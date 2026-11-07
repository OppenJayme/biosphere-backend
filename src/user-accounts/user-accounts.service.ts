import {
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SUPABASE_CLIENT } from '../supabase/supabase.constants';
import {
  authUsersPastInvite,
  ONBOARDING_PENDING_KEY,
} from '../auth/onboarding';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import type { InviteCuratorDto } from './dto/invite-curator.dto';
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
