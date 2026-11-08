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
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  Prisma,
  type ar_asset,
  type user_account,
} from '../generated/prisma/client';
import { extname } from 'node:path';
import { SUPABASE_CLIENT } from '../supabase/supabase.constants';
import { StorageService } from '../supabase/storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { runSerializableTransaction } from '../prisma/serializable-transaction';
import {
  authUsersPastInvite,
  ONBOARDING_PENDING_KEY,
} from '../auth/onboarding';
import { OnboardCuratorDto } from './dto/onboard-curator.dto';
import { UpdateCuratorStatusDto } from './dto/update-curator-status.dto';
import { HandOverCuratorDto } from './dto/hand-over-curator.dto';
import {
  CreateArAssetDto,
  type ArModelFormat,
} from './dto/create-ar-asset.dto';
import { UpdateArAssetDto } from './dto/update-ar-asset.dto';
import {
  CuratorAccountEntity,
  CuratorHandoverEntity,
} from './entities/curator-account.entity';
import { ArAssetEntity, ArExhibitEntity } from './entities/ar-asset.entity';
import {
  AR_ASSET_STORAGE_BUCKET,
  MAX_AR_ASSET_SIZE_BYTES,
} from './developer.constants';
import { inspectGlb, type GlbMetadata } from './glb-validation';

type AuditStatus = 'SUCCESS' | 'FAILED' | 'DENIED';

// What the compatibility check found in a model (REQ-4.2-05). Recorded in
// the audit entry of each upload, replacement and activation, since ar_asset
// has no metadata column.
type ArModelReport = {
  metadata: GlbMetadata | { sizeBytes: number };
  warnings: string[];
};

export const HAND_OVER_CURATOR_ACTION = 'HAND_OVER_CURATOR';

const INVITE_NOT_COMPLETED =
  'The invitation could not be completed and no account was created. Try again.';

// An AR-deployable exhibit: the curator has marked it for AR preparation in
// the exhibit module (REQ-4.13-02, SRS 4.2.2), it is not archived, and its
// specimen is not archived, still Cataloged and approved for public display,
// the same rule the curator's exhibit module applies to an exhibit's
// specimen (BR-20). The curator then turns AR on or off for the exhibit.
const DEPLOYABLE_EXHIBIT: Prisma.exhibitWhereInput = {
  ar_selected_at: { not: null },
  archived_at: null,
  specimen: {
    status: 'CATALOGED',
    public_display_allowed: true,
    archived_at: null,
  },
};

// The exhibit fields isDeployable needs.
const DEPLOYABILITY_SELECT = {
  ar_selected_at: true,
  archived_at: true,
  specimen: {
    select: { status: true, public_display_allowed: true, archived_at: true },
  },
} satisfies Prisma.exhibitSelect;

@Injectable()
export class DeveloperService {
  private readonly logger = new Logger(DeveloperService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
    private readonly storageService: StorageService,
    private readonly configService: ConfigService,
  ) {}

  // ===========================================================
  // Curator account administration — REQ-4.2-02, REQ-4.2-03
  // ===========================================================

  async listCuratorAccounts(): Promise<CuratorAccountEntity[]> {
    const rows = await this.prisma.user_account.findMany({
      where: { role: 'CURATOR' },
      orderBy: { created_at: 'desc' },
    });

    const pastInvite = await authUsersPastInvite(
      this.prisma,
      rows.map((row) => row.auth_user_id),
    );

    return rows.map((row) =>
      this.toCuratorAccountEntity(row, pastInvite.has(row.auth_user_id)),
    );
  }

  async onboardInitialCurator(
    dto: OnboardCuratorDto,
    actingDeveloperId: string,
  ): Promise<CuratorAccountEntity> {
    // Checked first because the provider re-invites an unconfirmed user
    // instead of refusing, which would then collide with their account row.
    const existing = await this.prisma.users.findFirst({
      where: { email: { equals: dto.email, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existing) {
      await this.recordAudit({
        actingAuthUserId: actingDeveloperId,
        action: 'ONBOARD_CURATOR',
        affectedRecordType: 'user_account',
        status: 'FAILED',
        details: {
          email: dto.email,
          reason: 'Email already belongs to an account.',
        },
      });
      throw new ConflictException(
        'An account with this email address already exists.',
      );
    }

    const { data, error } = await this.supabase.auth.admin.inviteUserByEmail(
      dto.email,
      {
        data: { role: 'CURATOR' },
        redirectTo: this.buildFrontendRedirectUrl('/login/accept-invite'),
      },
    );

    if (error || !data?.user) {
      await this.recordAudit({
        actingAuthUserId: actingDeveloperId,
        action: 'ONBOARD_CURATOR',
        affectedRecordType: 'user_account',
        status: 'FAILED',
        details: { email: dto.email, reason: error?.message },
      });
      throw new ConflictException(
        error?.message ?? 'Unable to send the curator onboarding invitation.',
      );
    }

    // The pending flag keeps the invite session out of protected APIs until
    // a password is set. Only the service key can write app_metadata.
    const { error: metadataError } =
      await this.supabase.auth.admin.updateUserById(data.user.id, {
        app_metadata: { role: 'CURATOR', [ONBOARDING_PENDING_KEY]: true },
      });

    if (metadataError) {
      await this.rollBackInvite(data.user.id, dto.email);
      await this.recordAudit({
        actingAuthUserId: actingDeveloperId,
        action: 'ONBOARD_CURATOR',
        affectedRecordType: 'user_account',
        status: 'FAILED',
        details: { email: dto.email, reason: metadataError.message },
      });
      throw new InternalServerErrorException(INVITE_NOT_COMPLETED);
    }

    let accountRow: user_account;

    try {
      accountRow = await this.prisma.user_account.create({
        data: {
          auth_user_id: data.user.id,
          full_name: dto.fullName,
          role: 'CURATOR',
          status: 'ACTIVE',
        },
      });
    } catch (insertError) {
      this.logger.error(
        `Auth invite sent to ${dto.email} but the user_account record ` +
          'could not be created.',
        insertError instanceof Error ? insertError.stack : insertError,
      );
      // A unique violation means the auth user already has an account, so it
      // is not this request's half-created invite and must not be removed.
      const duplicate =
        insertError instanceof Prisma.PrismaClientKnownRequestError &&
        insertError.code === 'P2002';
      if (!duplicate) await this.rollBackInvite(data.user.id, dto.email);
      await this.recordAudit({
        actingAuthUserId: actingDeveloperId,
        action: 'ONBOARD_CURATOR',
        affectedRecordType: 'user_account',
        status: 'FAILED',
        details: { email: dto.email, reason: this.errorMessage(insertError) },
      });
      if (duplicate) {
        throw new ConflictException(
          'An account with this email address already exists.',
        );
      }
      throw new InternalServerErrorException(INVITE_NOT_COMPLETED);
    }

    await this.recordAudit({
      actingAuthUserId: actingDeveloperId,
      action: 'ONBOARD_CURATOR',
      affectedRecordId: accountRow.id,
      affectedRecordType: 'user_account',
      status: 'SUCCESS',
      details: { email: dto.email },
    });

    // Nobody has used the link yet.
    return this.toCuratorAccountEntity(accountRow, false);
  }

  async updateCuratorStatus(
    id: string,
    dto: UpdateCuratorStatusDto,
    actingDeveloperId: string,
  ): Promise<CuratorAccountEntity> {
    const existing = await this.prisma.user_account.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`No user account found with id "${id}".`);
    }

    if (existing.role !== 'CURATOR') {
      await this.recordAudit({
        actingAuthUserId: actingDeveloperId,
        action: 'UPDATE_CURATOR_STATUS',
        affectedRecordId: id,
        affectedRecordType: 'user_account',
        status: 'DENIED',
        details: { reason: 'Target account is not a curator account.' },
      });
      throw new ForbiddenException(
        'The restricted Developer interface may only change the status of curator accounts.',
      );
    }

    let updated: user_account;

    try {
      updated = await this.prisma.user_account.update({
        where: { id },
        data: { status: dto.status },
      });
    } catch (error) {
      await this.recordAudit({
        actingAuthUserId: actingDeveloperId,
        action: 'UPDATE_CURATOR_STATUS',
        affectedRecordId: id,
        affectedRecordType: 'user_account',
        status: 'FAILED',
        details: { reason: this.errorMessage(error) },
      });
      throw new InternalServerErrorException(
        'Unable to update the curator account status.',
      );
    }

    await this.recordAudit({
      actingAuthUserId: actingDeveloperId,
      action: 'UPDATE_CURATOR_STATUS',
      affectedRecordId: id,
      affectedRecordType: 'user_account',
      status: 'SUCCESS',
      details: {
        newStatus: dto.status,
        authorizationReason: dto.authorizationReason,
      },
    });

    const pastInvite = await authUsersPastInvite(this.prisma, [
      updated.auth_user_id,
    ]);

    return this.toCuratorAccountEntity(
      updated,
      pastInvite.has(updated.auth_user_id),
    );
  }

  /**
   * Hands a curator's role over to a successor (REQ-4.1-09). The museum
   * decided on 2026-11-07 that curators do not deactivate each other, so this
   * is a Developer action. The successor must already hold their own active
   * curator account and have signed in with it: no credentials move between
   * people. The outgoing account is deactivated and kept, so its history
   * stays attributed to it.
   *
   * SERIALIZABLE keeps two handovers, or a handover and a status change, from
   * both acting on stale statuses. The status change and its audit entry
   * commit together, and every refused attempt is audited (REQ-4.1-11).
   * Sessions need no separate ending: an inactive account is refused on every
   * request (REQ-4.1-12).
   */
  async handOverCurator(
    dto: HandOverCuratorDto,
    actingDeveloperId: string,
  ): Promise<CuratorHandoverEntity> {
    let result: { outgoing: user_account; successor: user_account };
    try {
      if (dto.outgoingCuratorId === dto.successorCuratorId) {
        throw new BadRequestException(
          'The successor must have their own, separate curator account.',
        );
      }
      result = await runSerializableTransaction(
        this.prisma,
        (transaction) =>
          this.applyHandover(transaction, dto, actingDeveloperId),
        'A curator account changed during the handover. Reload and try again.',
      );
    } catch (error) {
      const refused = error instanceof HttpException;
      await this.recordAudit({
        actingAuthUserId: actingDeveloperId,
        action: HAND_OVER_CURATOR_ACTION,
        affectedRecordId: dto.outgoingCuratorId,
        affectedRecordType: 'user_account',
        status: refused ? 'DENIED' : 'FAILED',
        details: {
          successorAccountId: dto.successorCuratorId,
          authorizationReason: dto.authorizationReason,
          failure: this.errorMessage(error),
        },
      });
      if (refused) throw error;
      throw new InternalServerErrorException(
        'The handover could not be completed. No account was changed.',
      );
    }

    const pastInvite = await authUsersPastInvite(this.prisma, [
      result.outgoing.auth_user_id,
    ]);
    return {
      outgoing: this.toCuratorAccountEntity(
        result.outgoing,
        pastInvite.has(result.outgoing.auth_user_id),
      ),
      // The handover only succeeds once the successor has accepted.
      successor: this.toCuratorAccountEntity(result.successor, true),
    };
  }

  private async applyHandover(
    transaction: Prisma.TransactionClient,
    dto: HandOverCuratorDto,
    actingDeveloperId: string,
  ): Promise<{ outgoing: user_account; successor: user_account }> {
    const acting = await transaction.user_account.findUnique({
      where: { auth_user_id: actingDeveloperId },
      select: { id: true },
    });
    if (!acting) {
      throw new ForbiddenException('Your account could not be found.');
    }

    const outgoing = await transaction.user_account.findUnique({
      where: { id: dto.outgoingCuratorId },
    });
    const successor = await transaction.user_account.findUnique({
      where: { id: dto.successorCuratorId },
    });
    if (outgoing?.role !== 'CURATOR') {
      throw new NotFoundException('Outgoing curator account not found.');
    }
    if (successor?.role !== 'CURATOR') {
      throw new NotFoundException('Successor curator account not found.');
    }
    if (outgoing.status !== 'ACTIVE') {
      throw new ConflictException(
        'The outgoing curator account is already inactive.',
      );
    }
    if (successor.status !== 'ACTIVE') {
      throw new ConflictException(
        "The successor's account is inactive. Activate it before the handover.",
      );
    }
    // Accepted the invitation and signed in with their own account.
    const accepted = await authUsersPastInvite(transaction, [
      successor.auth_user_id,
    ]);
    const signIn = await transaction.users.findUnique({
      where: { id: successor.auth_user_id },
      select: { last_sign_in_at: true },
    });
    if (!accepted.has(successor.auth_user_id) || !signIn?.last_sign_in_at) {
      throw new ConflictException(
        'The successor has not finished setting up their account. They must accept the invitation and sign in before the handover.',
      );
    }

    const updated = await transaction.user_account.update({
      where: { id: outgoing.id },
      data: { status: 'INACTIVE' },
    });
    // Same transaction: the handover never lands without its audit entry.
    await transaction.audit_log.create({
      data: {
        user_id: acting.id,
        affected_record_id: outgoing.id,
        affected_record_type: 'user_account',
        action: HAND_OVER_CURATOR_ACTION,
        module: 'developer',
        status: 'SUCCESS',
        details: {
          successorAccountId: successor.id,
          previousStatus: outgoing.status,
          newStatus: 'INACTIVE',
          authorizationReason: dto.authorizationReason,
        },
      },
    });
    return { outgoing: updated, successor };
  }

  // ===========================================================
  // AR asset deployment — REQ-4.2-04, REQ-4.2-05
  // ===========================================================

  // Exhibits the developer can pick when deploying an AR asset (see
  // DEPLOYABLE_EXHIBIT). Exhibits that are no longer deployable, e.g.
  // archived, are still listed while they hold assets, so those assets can
  // be deactivated, removed, or moved; the service rejects activating or
  // replacing them in place. Only the exhibit's public identity is returned
  // (REQ-4.2-07/08).
  async listArExhibits(): Promise<ArExhibitEntity[]> {
    const exhibits = await this.prisma.exhibit.findMany({
      where: { OR: [DEPLOYABLE_EXHIBIT, { ar_asset: { some: {} } }] },
      select: {
        id: true,
        public_slug: true,
        status: true,
        archived_at: true,
        ar_selected_at: true,
        ar_selection_note: true,
        specimen: {
          select: {
            common_name: true,
            scientific_name: true,
            status: true,
            public_display_allowed: true,
            archived_at: true,
          },
        },
        ar_asset: { orderBy: { id: 'asc' } },
      },
      orderBy: { created_at: 'desc' },
    });

    return exhibits.map((item) => ({
      id: item.id,
      publicSlug: item.public_slug,
      status: item.status,
      archived: item.archived_at !== null,
      deployable: this.isDeployable(item),
      arSelected: Boolean(item.ar_selected_at),
      arSelectionNote: item.ar_selection_note,
      commonName: item.specimen.common_name,
      scientificName: item.specimen.scientific_name,
      assets: item.ar_asset.map((asset) => this.toArAssetEntity(asset)),
    }));
  }

  async createArAsset(
    file: Express.Multer.File,
    dto: CreateArAssetDto,
    actingDeveloperId: string,
  ): Promise<ArAssetEntity> {
    const { storagePath, model } = await this.auditRejection(
      actingDeveloperId,
      {
        action: 'CREATE_AR_ASSET',
        details: {
          exhibitId: dto.exhibitId,
          modelFormat: dto.modelFormat,
          isEnabled: dto.isEnabled ?? false,
          authorizationReference: this.reference(dto.authorizationReference),
        },
      },
      async () => {
        this.requireAuthorization(dto.authorizationReference, 'upload');
        await this.assertExhibitDeployable(dto.exhibitId);
        const model = this.validateArAssetFile(file, dto.modelFormat);

        const storagePath = await this.storageService.upload(
          AR_ASSET_STORAGE_BUCKET,
          dto.exhibitId,
          file.buffer,
          file.mimetype,
        );
        return { storagePath, model };
      },
    );

    let created: ar_asset;

    try {
      created = await this.prisma.ar_asset.create({
        data: {
          exhibit_id: dto.exhibitId,
          storage_path: storagePath,
          model_format: dto.modelFormat,
          is_enabled: dto.isEnabled ?? false,
        },
      });
    } catch (error) {
      await this.storageService
        .remove(AR_ASSET_STORAGE_BUCKET, storagePath)
        .catch(() => undefined);

      await this.recordAudit({
        actingAuthUserId: actingDeveloperId,
        action: 'CREATE_AR_ASSET',
        affectedRecordType: 'ar_asset',
        status: 'FAILED',
        details: {
          exhibitId: dto.exhibitId,
          authorizationReference: dto.authorizationReference,
          reason: this.errorMessage(error),
        },
      });
      throw new InternalServerErrorException(
        'Unable to create the AR asset record.',
      );
    }

    await this.recordAudit({
      actingAuthUserId: actingDeveloperId,
      action: 'CREATE_AR_ASSET',
      affectedRecordId: created.id,
      affectedRecordType: 'ar_asset',
      status: 'SUCCESS',
      details: {
        exhibitId: dto.exhibitId,
        modelFormat: dto.modelFormat,
        isEnabled: dto.isEnabled ?? false,
        authorizationReference: dto.authorizationReference,
        model,
      },
    });

    return this.toArAssetEntity(created);
  }

  async updateArAsset(
    id: string,
    file: Express.Multer.File | undefined,
    dto: UpdateArAssetDto,
    actingDeveloperId: string,
  ): Promise<ArAssetEntity> {
    const { existing, updateData, previousStoragePath, model } =
      await this.auditRejection(
        actingDeveloperId,
        {
          action: 'UPDATE_AR_ASSET',
          affectedRecordId: id,
          details: {
            exhibitId: dto.exhibitId,
            modelFormat: dto.modelFormat,
            isEnabled: dto.isEnabled,
            fileProvided: file !== undefined,
            authorizationReference: this.reference(dto.authorizationReference),
          },
        },
        async () => {
          const existing = await this.findArAssetOrThrow(id);

          // Replacing, moving, or activating deploys something new to
          // visitors, so it must carry documented authorization
          // (REQ-4.2-05). Checked before anything is uploaded.
          if (file || dto.exhibitId || dto.isEnabled) {
            this.requireAuthorization(
              dto.authorizationReference,
              'replace, move, or activate',
            );
          }

          if (dto.exhibitId) {
            await this.assertExhibitDeployable(dto.exhibitId);
          } else if (file || dto.isEnabled) {
            await this.assertCurrentExhibitDeployable(
              existing,
              file ? 'replaced' : 'activated',
            );
          }

          let model: ArModelReport | undefined;
          if (dto.isEnabled && !file) {
            model = await this.assertStoredModelValid(existing);
          }

          const updateData: Prisma.ar_assetUncheckedUpdateInput = {};
          let previousStoragePath: string | null = null;

          if (file) {
            const targetFormat: ArModelFormat =
              dto.modelFormat ?? (existing.model_format as ArModelFormat);
            model = this.validateArAssetFile(file, targetFormat);

            const exhibitId = dto.exhibitId ?? existing.exhibit_id;
            const storagePath = await this.storageService.upload(
              AR_ASSET_STORAGE_BUCKET,
              exhibitId,
              file.buffer,
              file.mimetype,
            );

            previousStoragePath = existing.storage_path;
            updateData.storage_path = storagePath;
            updateData.model_format = targetFormat;
          } else if (dto.modelFormat) {
            throw new BadRequestException(
              'modelFormat can only change when a replacement file is uploaded.',
            );
          }

          if (dto.exhibitId) {
            updateData.exhibit_id = dto.exhibitId;
          }

          if (dto.isEnabled !== undefined) {
            updateData.is_enabled = dto.isEnabled;
          }

          return { existing, updateData, previousStoragePath, model };
        },
      );

    if (Object.keys(updateData).length === 0) {
      return this.toArAssetEntity(existing);
    }

    let updated: ar_asset;

    try {
      updated = await this.prisma.ar_asset.update({
        where: { id },
        data: updateData,
      });
    } catch (error) {
      if (file) {
        await this.storageService
          .remove(AR_ASSET_STORAGE_BUCKET, updateData.storage_path as string)
          .catch(() => undefined);
      }
      await this.recordAudit({
        actingAuthUserId: actingDeveloperId,
        action: 'UPDATE_AR_ASSET',
        affectedRecordId: id,
        affectedRecordType: 'ar_asset',
        status: 'FAILED',
        details: {
          authorizationReference: dto.authorizationReference,
          reason: this.errorMessage(error),
        },
      });
      throw new InternalServerErrorException('Unable to update the AR asset.');
    }

    if (previousStoragePath) {
      await this.storageService
        .remove(AR_ASSET_STORAGE_BUCKET, previousStoragePath)
        .catch(() => undefined);
    }

    await this.recordAudit({
      actingAuthUserId: actingDeveloperId,
      action: 'UPDATE_AR_ASSET',
      affectedRecordId: id,
      affectedRecordType: 'ar_asset',
      status: 'SUCCESS',
      details: {
        exhibitId: dto.exhibitId,
        modelFormat: dto.modelFormat,
        isEnabled: dto.isEnabled,
        fileReplaced: previousStoragePath !== null,
        authorizationReference: dto.authorizationReference,
        ...(model ? { model } : {}),
      },
    });

    return this.toArAssetEntity(updated);
  }

  async setArAssetEnabled(
    id: string,
    isEnabled: boolean,
    actingDeveloperId: string,
    // Required to activate (REQ-4.2-05); ignored when deactivating.
    authorizationReference?: string,
  ): Promise<ArAssetEntity> {
    const authorizationDetails = isEnabled
      ? { authorizationReference: this.reference(authorizationReference) }
      : {};

    const model = await this.auditRejection(
      actingDeveloperId,
      {
        action: isEnabled ? 'ACTIVATE_AR_ASSET' : 'DEACTIVATE_AR_ASSET',
        affectedRecordId: id,
        details: authorizationDetails,
      },
      async () => {
        if (isEnabled) {
          this.requireAuthorization(authorizationReference, 'activate');
        }

        const existing = await this.findArAssetOrThrow(id);

        if (!isEnabled) return undefined;
        await this.assertCurrentExhibitDeployable(existing, 'activated');
        return this.assertStoredModelValid(existing);
      },
    );

    let updated: ar_asset;

    try {
      updated = await this.prisma.ar_asset.update({
        where: { id },
        data: { is_enabled: isEnabled },
      });
    } catch (error) {
      await this.recordAudit({
        actingAuthUserId: actingDeveloperId,
        action: isEnabled ? 'ACTIVATE_AR_ASSET' : 'DEACTIVATE_AR_ASSET',
        affectedRecordId: id,
        affectedRecordType: 'ar_asset',
        status: 'FAILED',
        details: { ...authorizationDetails, reason: this.errorMessage(error) },
      });
      throw new InternalServerErrorException(
        `Unable to ${isEnabled ? 'activate' : 'deactivate'} the AR asset.`,
      );
    }

    await this.recordAudit({
      actingAuthUserId: actingDeveloperId,
      action: isEnabled ? 'ACTIVATE_AR_ASSET' : 'DEACTIVATE_AR_ASSET',
      affectedRecordId: id,
      affectedRecordType: 'ar_asset',
      status: 'SUCCESS',
      ...(isEnabled
        ? {
            details: {
              ...authorizationDetails,
              ...(model ? { model } : {}),
            },
          }
        : {}),
    });

    return this.toArAssetEntity(updated);
  }

  async removeArAsset(
    id: string,
    actingDeveloperId: string,
  ): Promise<{ id: string; removed: true }> {
    const existing = await this.auditRejection(
      actingDeveloperId,
      { action: 'REMOVE_AR_ASSET', affectedRecordId: id },
      () => this.findArAssetOrThrow(id),
    );

    try {
      await this.prisma.ar_asset.delete({ where: { id } });
    } catch (error) {
      await this.recordAudit({
        actingAuthUserId: actingDeveloperId,
        action: 'REMOVE_AR_ASSET',
        affectedRecordId: id,
        affectedRecordType: 'ar_asset',
        status: 'FAILED',
        details: { reason: this.errorMessage(error) },
      });
      throw new InternalServerErrorException('Unable to remove the AR asset.');
    }

    await this.storageService
      .remove(AR_ASSET_STORAGE_BUCKET, existing.storage_path)
      .catch(() => undefined);

    await this.recordAudit({
      actingAuthUserId: actingDeveloperId,
      action: 'REMOVE_AR_ASSET',
      affectedRecordId: id,
      affectedRecordType: 'ar_asset',
      status: 'SUCCESS',
    });

    return { id, removed: true };
  }

  // ===========================================================
  // Helpers
  // ===========================================================

  /**
   * Runs the checks and uploads that happen before an AR change is written.
   * If any of them rejects the attempt, a FAILED audit entry is recorded
   * (REQ-4.2-09) and the original error is rethrown unchanged. Failures of the
   * database write itself are audited where they happen, so they are not
   * wrapped here.
   */
  private async auditRejection<T>(
    actingAuthUserId: string,
    attempt: {
      action: string;
      affectedRecordId?: string;
      details?: Record<string, unknown>;
    },
    step: () => Promise<T>,
  ): Promise<T> {
    try {
      return await step();
    } catch (error) {
      await this.recordAudit({
        actingAuthUserId,
        action: attempt.action,
        affectedRecordId: attempt.affectedRecordId,
        affectedRecordType: 'ar_asset',
        status: 'FAILED',
        details: { ...attempt.details, reason: this.rejectionReason(error) },
      });
      throw error;
    }
  }

  // HttpException messages here are this module's own fixed, user-facing
  // strings. Anything else (e.g. a raw client error) is summarized so internal
  // details never reach the audit log.
  private rejectionReason(error: unknown): string {
    return error instanceof HttpException
      ? error.message
      : 'Unexpected error before the change was saved.';
  }

  // The DTOs leave authorizationReference optional so a missing one reaches
  // the service and can be audited; this is where it is enforced.
  private requireAuthorization(
    authorizationReference: string | undefined,
    action: string,
  ): void {
    if (!authorizationReference?.trim()) {
      throw new BadRequestException(
        `An authorizationReference is required to ${action} an AR asset.`,
      );
    }
  }

  private reference(authorizationReference: string | undefined) {
    return authorizationReference?.trim() || undefined;
  }

  private async findArAssetOrThrow(id: string): Promise<ar_asset> {
    const asset = await this.prisma.ar_asset.findUnique({ where: { id } });

    if (!asset) {
      throw new NotFoundException(`No AR asset found with id "${id}".`);
    }

    return asset;
  }

  // New assets, and assets moved to another exhibit, may only target a
  // deployable exhibit (REQ-4.13-03).
  private async assertExhibitDeployable(exhibitId: string): Promise<void> {
    const exhibit = await this.prisma.exhibit.findUnique({
      where: { id: exhibitId },
      select: DEPLOYABILITY_SELECT,
    });

    if (!exhibit) {
      throw new NotFoundException(`No exhibit found with id "${exhibitId}".`);
    }

    if (exhibit.archived_at) {
      throw new BadRequestException(
        'AR assets cannot be deployed to an archived exhibit.',
      );
    }

    if (!exhibit.ar_selected_at) {
      throw new BadRequestException(
        'AR assets can only be deployed to an exhibit the curator has ' +
          'marked for AR preparation.',
      );
    }

    if (!this.isDeployable(exhibit)) {
      throw new BadRequestException(
        'AR assets can only be deployed to an exhibit whose specimen is ' +
          'active, Cataloged, and approved for public display.',
      );
    }
  }

  // An asset whose exhibit is no longer deployable is cleanup-only: it can
  // be deactivated, removed, or moved to a deployable exhibit, but not
  // activated or replaced where it is.
  private async assertCurrentExhibitDeployable(
    asset: ar_asset,
    action: 'activated' | 'replaced',
  ): Promise<void> {
    const exhibit = await this.prisma.exhibit.findUnique({
      where: { id: asset.exhibit_id },
      select: DEPLOYABILITY_SELECT,
    });

    if (!exhibit || !this.isDeployable(exhibit)) {
      throw new BadRequestException(
        `This AR asset cannot be ${action} because its exhibit is no longer ` +
          'deployable. It can only be deactivated, removed, or moved to a ' +
          'deployable exhibit.',
      );
    }
  }

  // Activation re-reads the stored model, because assets uploaded before the
  // backend checked GLB structure may still reference external files.
  // Re-checking also applies compatibility rules added after an upload.
  private async assertStoredModelValid(
    asset: ar_asset,
  ): Promise<ArModelReport | undefined> {
    if (asset.model_format !== 'glb') return undefined;

    const result = inspectGlb(
      await this.storageService.download(
        AR_ASSET_STORAGE_BUCKET,
        asset.storage_path,
      ),
    );
    if (result.error !== undefined) {
      throw new BadRequestException(result.error);
    }
    return { metadata: result.metadata, warnings: result.warnings };
  }

  // Mirrors DEPLOYABLE_EXHIBIT for an exhibit that is already loaded.
  private isDeployable(exhibit: {
    ar_selected_at: Date | null;
    archived_at: Date | null;
    specimen: {
      status: string;
      public_display_allowed: boolean;
      archived_at: Date | null;
    };
  }): boolean {
    return (
      Boolean(exhibit.ar_selected_at) &&
      exhibit.archived_at === null &&
      exhibit.specimen.archived_at === null &&
      exhibit.specimen.status === 'CATALOGED' &&
      exhibit.specimen.public_display_allowed
    );
  }

  private validateArAssetFile(
    file: Express.Multer.File | undefined,
    modelFormat: ArModelFormat,
  ): ArModelReport {
    if (!file) {
      throw new BadRequestException('An AR asset file is required.');
    }

    if (file.size > MAX_AR_ASSET_SIZE_BYTES) {
      throw new BadRequestException(
        `AR asset file exceeds the maximum allowed size of ${
          MAX_AR_ASSET_SIZE_BYTES / (1024 * 1024)
        }MB.`,
      );
    }

    const extension = extname(file.originalname).toLowerCase().replace('.', '');

    if (extension !== modelFormat) {
      throw new BadRequestException(
        `File extension ".${extension}" does not match the declared model format "${modelFormat}".`,
      );
    }

    if (modelFormat !== 'glb') {
      return { metadata: { sizeBytes: file.size }, warnings: [] };
    }

    // Size, structure and Android Scene Viewer compatibility (REQ-4.2-05).
    const result = inspectGlb(file.buffer);
    if (result.error !== undefined) {
      throw new BadRequestException(result.error);
    }
    return { metadata: result.metadata, warnings: result.warnings };
  }

  /**
   * Joins the configured frontend origin with a path, normalizing away any
   * trailing/leading slash so a trailing slash in FRONTEND_URL never produces
   * a double slash in the redirect Supabase emails to the invitee.
   */
  private buildFrontendRedirectUrl(path: string): string {
    const frontendUrl = this.configService
      .getOrThrow<string>('FRONTEND_URL')
      .replace(/\/+$/, '');
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;

    return `${frontendUrl}${normalizedPath}`;
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

  private errorMessage(error: unknown): string {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return `${error.code}: ${error.message}`;
    }
    return error instanceof Error ? error.message : 'Unknown error';
  }

  private toCuratorAccountEntity(
    row: user_account,
    inviteAccepted: boolean,
  ): CuratorAccountEntity {
    return {
      id: row.id,
      authUserId: row.auth_user_id,
      fullName: row.full_name,
      role: row.role,
      status: row.status,
      inviteAccepted,
      avatarPath: row.avatar_path,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private toArAssetEntity(row: ar_asset): ArAssetEntity {
    return {
      id: row.id,
      exhibitId: row.exhibit_id,
      modelUrl: row.storage_path,
      modelFormat: row.model_format as ArModelFormat,
      isEnabled: row.is_enabled,
    };
  }

  private async recordAudit(params: {
    actingAuthUserId: string;
    action: string;
    affectedRecordId?: string;
    affectedRecordType?: string;
    details?: Record<string, unknown>;
    status: AuditStatus;
  }): Promise<void> {
    try {
      const actingAccount = await this.prisma.user_account.findUnique({
        where: { auth_user_id: params.actingAuthUserId },
        select: { id: true },
      });

      if (!actingAccount) {
        this.logger.error(
          `No user_account found for auth user "${params.actingAuthUserId}" ` +
            `— skipping audit log for action "${params.action}".`,
        );
        return;
      }

      await this.prisma.audit_log.create({
        data: {
          user_id: actingAccount.id,
          affected_record_id: params.affectedRecordId,
          affected_record_type: params.affectedRecordType,
          action: params.action,
          module: 'developer',
          status: params.status,
          ...(params.details
            ? { details: params.details as Prisma.InputJsonValue }
            : {}),
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to record audit log entry for action "${params.action}"`,
        error instanceof Error ? error.stack : error,
      );
    }
  }
}
