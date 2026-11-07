import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { runSerializableTransaction } from '../prisma/serializable-transaction';
import { SUPABASE_CLIENT } from '../supabase/supabase.constants';
import {
  authUsersPastInvite,
  ONBOARDING_PENDING_KEY,
} from '../auth/onboarding';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import type { InviteCuratorDto } from './dto/invite-curator.dto';
import type { HandOverCuratorAccountDto } from './dto/hand-over-curator-account.dto';
import type { UpdateCuratorAccountStatusDto } from './dto/update-curator-account-status.dto';
import {
  UserAccountStatus,
  type UserAccountSummary,
} from './entities/user-account-summary.entity';

const USER_ACCOUNT_SELECT = {
  id: true,
  auth_user_id: true,
  full_name: true,
  status: true,
  created_at: true,
  users: {
    select: { email: true, last_sign_in_at: true },
  },
} satisfies Prisma.user_accountSelect;

type UserAccountRecord = Prisma.user_accountGetPayload<{
  select: typeof USER_ACCOUNT_SELECT;
}>;

type AuditResult = 'SUCCESS' | 'FAILED' | 'DENIED';

export const INVITE_CURATOR_ACTION = 'INVITE_CURATOR';
export const UPDATE_CURATOR_STATUS_ACTION = 'UPDATE_CURATOR_STATUS';
export const CURATOR_HANDOVER_ACTION = 'CURATOR_HANDOVER';

/**
 * The Curator answered on 2026-11-07 that one curator should not turn off
 * another curator's account: a departing curator turns everything over and
 * then no longer interferes. So curators may reactivate an account but not
 * deactivate one; deactivation happens through the outgoing curator's own
 * handover, or through the Developer route at the museum's direction when the
 * holder left without handing over.
 */
export const PEER_DEACTIVATION_REFUSED =
  "Curators cannot deactivate another curator's account. The outgoing curator hands over their own account, or the Developer deactivates it at the museum's direction.";

const NOT_COMPLETED =
  'The invitation could not be completed and no account was created. Try again.';

@Injectable()
export class UserAccountsService {
  private readonly logger = new Logger(UserAccountsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
    private readonly config: ConfigService,
  ) {}

  /** Curator accounts only, newest first: developer accounts stay out of curator views. */
  async list(): Promise<UserAccountSummary[]> {
    const rows = await this.prisma.user_account.findMany({
      where: { role: 'CURATOR' },
      orderBy: { created_at: 'desc' },
      select: USER_ACCOUNT_SELECT,
    });
    const pastInvite = await authUsersPastInvite(
      this.prisma,
      rows.map((row) => row.auth_user_id),
    );
    return rows.map((row) =>
      this.toSummary(row, pastInvite.has(row.auth_user_id)),
    );
  }

  /**
   * A curator onboards another curator (REQ-4.1-07): Supabase emails a
   * password-setup invitation, so no password is ever set or sent here
   * (REQ-4.1-17). The new account is a separate CURATOR account that shows
   * as a pending invite until the link is used. Every attempt is audited
   * without invitation secrets (REQ-4.1-11).
   */
  async inviteCurator(
    dto: InviteCuratorDto,
    actor: AuthenticatedUser,
  ): Promise<UserAccountSummary> {
    const email = dto.email;

    const existing = await this.prisma.users.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existing) {
      await this.recordInviteAudit(actor, 'FAILED', {
        email,
        reason: 'Email already belongs to an account.',
      });
      throw new ConflictException(
        'An account with this email address already exists.',
      );
    }

    const { data, error } = await this.supabase.auth.admin.inviteUserByEmail(
      email,
      {
        data: { role: 'CURATOR' },
        redirectTo: this.frontendUrl('/login/accept-invite'),
      },
    );

    if (error || !data?.user) {
      await this.recordInviteAudit(actor, 'FAILED', {
        email,
        reason: error?.message ?? 'No user returned by the invite.',
      });
      if (error?.code === 'email_exists' || error?.status === 422) {
        throw new ConflictException(
          'An account with this email address already exists.',
        );
      }
      throw new ServiceUnavailableException(
        'The invitation email could not be sent. Try again later.',
      );
    }
    const authUserId = data.user.id;

    // Only the service key can write app_metadata. The pending flag keeps
    // the invite session out of protected APIs until a password is set.
    const { error: metadataError } =
      await this.supabase.auth.admin.updateUserById(authUserId, {
        app_metadata: { role: 'CURATOR', [ONBOARDING_PENDING_KEY]: true },
      });
    if (metadataError) {
      await this.rollBackInvite(authUserId, email);
      await this.recordInviteAudit(actor, 'FAILED', {
        email,
        reason: metadataError.message,
      });
      throw new InternalServerErrorException(NOT_COMPLETED);
    }

    let row: UserAccountRecord;
    try {
      row = await this.prisma.user_account.create({
        data: {
          auth_user_id: authUserId,
          full_name: dto.fullName,
          role: 'CURATOR',
          status: 'ACTIVE',
        },
        select: USER_ACCOUNT_SELECT,
      });
    } catch (insertError) {
      await this.rollBackInvite(authUserId, email);
      await this.recordInviteAudit(actor, 'FAILED', {
        email,
        reason: this.errorMessage(insertError),
      });
      throw new InternalServerErrorException(NOT_COMPLETED);
    }

    await this.recordInviteAudit(
      actor,
      'SUCCESS',
      { email, fullName: dto.fullName },
      row.id,
    );

    // Nobody has used the link yet, so no password exists.
    return this.toSummary(row, false);
  }

  /**
   * A curator reactivates another curator (REQ-4.1-08). Deactivating another
   * curator is refused (see PEER_DEACTIVATION_REFUSED); the other rules are the
   * team's recommendation: see docs/AUTH_ACCOUNT_DECISIONS_STATUS.md.
   *
   * Refusing self-changes also protects the last active curator, because the
   * actor stays active. Re-reading the actor under SERIALIZABLE keeps that true
   * when two curators deactivate each other at once: the retried transaction
   * sees its actor is now inactive and is refused.
   *
   * Sessions need no separate ending: an inactive account is refused on every
   * request (REQ-4.1-12). Every attempt is audited (REQ-4.1-11).
   */
  async updateCuratorStatus(
    id: string,
    dto: UpdateCuratorAccountStatusDto,
    actor: AuthenticatedUser,
  ): Promise<UserAccountSummary> {
    let row: UserAccountRecord;
    try {
      if (id === actor.accountId) {
        throw new ForbiddenException(
          'You cannot change the status of your own account.',
        );
      }
      if (dto.status === UserAccountStatus.INACTIVE) {
        throw new ForbiddenException(PEER_DEACTIVATION_REFUSED);
      }
      row = await runSerializableTransaction(
        this.prisma,
        (transaction) => this.applyCuratorStatus(transaction, id, dto, actor),
        'This account changed while saving. Reload and try again.',
      );
    } catch (error) {
      const refused = error instanceof HttpException;
      await this.recordAudit(
        actor,
        UPDATE_CURATOR_STATUS_ACTION,
        error instanceof ForbiddenException ? 'DENIED' : 'FAILED',
        {
          requestedStatus: dto.status,
          reason: dto.reason,
          failure: this.errorMessage(error),
        },
        id,
      );
      if (refused) throw error;
      throw new InternalServerErrorException(
        'The account status could not be changed. Try again.',
      );
    }

    const pastInvite = await authUsersPastInvite(this.prisma, [
      row.auth_user_id,
    ]);
    return this.toSummary(row, pastInvite.has(row.auth_user_id));
  }

  private async applyCuratorStatus(
    transaction: Prisma.TransactionClient,
    id: string,
    dto: UpdateCuratorAccountStatusDto,
    actor: AuthenticatedUser,
  ): Promise<UserAccountRecord> {
    const acting = await transaction.user_account.findUnique({
      where: { id: actor.accountId },
      select: { status: true },
    });
    if (acting?.status !== 'ACTIVE') {
      throw new ForbiddenException('Your account is no longer active.');
    }

    const target = await transaction.user_account.findUnique({
      where: { id },
      select: { ...USER_ACCOUNT_SELECT, role: true },
    });
    // Developer accounts stay out of curator views, so they read as missing.
    if (target?.role !== 'CURATOR') {
      throw new NotFoundException('Curator account not found.');
    }
    // A retried request changes nothing and adds no second audit entry.
    if (UserAccountStatus[target.status] === dto.status) return target;

    const updated = await transaction.user_account.update({
      where: { id },
      data: { status: dto.status },
      select: USER_ACCOUNT_SELECT,
    });
    // Same transaction: a status change never lands without its audit entry.
    await transaction.audit_log.create({
      data: {
        user_id: actor.accountId,
        affected_record_id: id,
        affected_record_type: 'user_account',
        action: UPDATE_CURATOR_STATUS_ACTION,
        module: 'user-accounts',
        status: 'SUCCESS',
        details: {
          previousStatus: target.status,
          newStatus: dto.status,
          reason: dto.reason,
        },
      },
    });
    return updated;
  }

  /**
   * Handover (REQ-4.1-09, REQ-4.1-11), as the Curator described it on
   * 2026-11-07: the outgoing curator turns the work over to a successor who
   * already has their own account, then steps away. No credentials move.
   *
   * The successor must be another active curator who has set a password, so
   * the museum is never left without a working curator. The outgoing account
   * is deactivated, not deleted, so past records still show who did what, and
   * the handover is audited in the same transaction. The outgoing session is
   * refused from the next request on (REQ-4.1-12).
   */
  async handOver(
    dto: HandOverCuratorAccountDto,
    actor: AuthenticatedUser,
  ): Promise<UserAccountSummary> {
    let row: UserAccountRecord;
    try {
      if (dto.successorAccountId === actor.accountId) {
        throw new BadRequestException(
          'Choose another curator as your successor.',
        );
      }
      const successor = await this.prisma.user_account.findUnique({
        where: { id: dto.successorAccountId },
        select: { ...USER_ACCOUNT_SELECT, role: true },
      });
      if (successor?.role !== 'CURATOR') {
        throw new NotFoundException('Successor curator account not found.');
      }
      const ready = await authUsersPastInvite(this.prisma, [
        successor.auth_user_id,
      ]);
      if (!ready.has(successor.auth_user_id)) {
        throw new ConflictException(
          'The successor has not finished setting up their account. Ask them to accept the invitation and sign in first.',
        );
      }
      row = await runSerializableTransaction(
        this.prisma,
        (transaction) =>
          this.applyHandover(transaction, dto, actor, successor.full_name),
        'An account changed while saving. Reload and try again.',
      );
    } catch (error) {
      await this.recordAudit(
        actor,
        CURATOR_HANDOVER_ACTION,
        error instanceof ForbiddenException ? 'DENIED' : 'FAILED',
        {
          successorAccountId: dto.successorAccountId,
          reason: dto.reason,
          failure: this.errorMessage(error),
        },
        actor.accountId,
      );
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(
        'The handover could not be completed. Try again.',
      );
    }

    const pastInvite = await authUsersPastInvite(this.prisma, [
      row.auth_user_id,
    ]);
    return this.toSummary(row, pastInvite.has(row.auth_user_id));
  }

  private async applyHandover(
    transaction: Prisma.TransactionClient,
    dto: HandOverCuratorAccountDto,
    actor: AuthenticatedUser,
    successorName: string,
  ): Promise<UserAccountRecord> {
    const outgoing = await transaction.user_account.findUnique({
      where: { id: actor.accountId },
      select: { status: true, role: true },
    });
    if (outgoing?.role !== 'CURATOR' || outgoing.status !== 'ACTIVE') {
      throw new ForbiddenException('Your account is no longer active.');
    }
    // Re-read under SERIALIZABLE so two curators handing over to each other
    // at once cannot both leave: the retried one sees its successor inactive.
    const successor = await transaction.user_account.findUnique({
      where: { id: dto.successorAccountId },
      select: { status: true, role: true },
    });
    if (successor?.role !== 'CURATOR' || successor.status !== 'ACTIVE') {
      throw new ConflictException(
        'The successor account is not active. Choose an active curator.',
      );
    }

    const updated = await transaction.user_account.update({
      where: { id: actor.accountId },
      data: { status: 'INACTIVE' },
      select: USER_ACCOUNT_SELECT,
    });
    await transaction.audit_log.create({
      data: {
        user_id: actor.accountId,
        affected_record_id: actor.accountId,
        affected_record_type: 'user_account',
        action: CURATOR_HANDOVER_ACTION,
        module: 'user-accounts',
        status: 'SUCCESS',
        details: {
          successorAccountId: dto.successorAccountId,
          successorName,
          previousStatus: 'ACTIVE',
          newStatus: 'INACTIVE',
          reason: dto.reason,
        },
      },
    });
    return updated;
  }

  /** Removes a half-created invite so its link stops working and a retry can succeed. */
  private async rollBackInvite(authUserId: string, email: string) {
    const { error } = await this.supabase.auth.admin.deleteUser(authUserId);
    if (error) {
      this.logger.error(
        `Invite for ${email} failed and auth user ${authUserId} could not be ` +
          `removed — manual reconciliation required: ${error.message}`,
      );
    }
  }

  // A failed audit write is logged, never allowed to change the outcome.
  private recordInviteAudit(
    actor: AuthenticatedUser,
    status: AuditResult,
    details: Prisma.InputJsonObject,
    affectedRecordId?: string,
  ) {
    return this.recordAudit(
      actor,
      INVITE_CURATOR_ACTION,
      status,
      details,
      affectedRecordId,
    );
  }

  private async recordAudit(
    actor: AuthenticatedUser,
    action: string,
    status: AuditResult,
    details: Prisma.InputJsonObject,
    affectedRecordId?: string,
  ) {
    try {
      await this.prisma.audit_log.create({
        data: {
          user_id: actor.accountId,
          affected_record_id: affectedRecordId,
          affected_record_type: 'user_account',
          action,
          module: 'user-accounts',
          status,
          details,
        },
      });
    } catch (error) {
      this.logger.error(
        `Could not record ${action} (${status}) in the audit log.`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private frontendUrl(path: string) {
    const base = this.config
      .getOrThrow<string>('FRONTEND_URL')
      .replace(/\/+$/, '');
    return `${base}${path}`;
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return `${error.code}: ${error.message}`;
    }
    return error instanceof Error ? error.message : 'Unknown error';
  }

  private toSummary(
    row: UserAccountRecord,
    inviteAccepted: boolean,
  ): UserAccountSummary {
    return {
      id: row.id,
      fullName: row.full_name,
      email: row.users.email,
      status: UserAccountStatus[row.status],
      inviteAccepted,
      lastSignInAt: row.users.last_sign_in_at,
      createdAt: row.created_at,
    };
  }
}
