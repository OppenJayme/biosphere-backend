import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Prisma, type ar_asset, type user_account } from '../generated/prisma/client';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { SUPABASE_CLIENT } from '../supabase/supabase-client.provider';
import { StorageService } from '../supabase/storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { OnboardCuratorDto } from './dto/onboard-curator.dto';
import { UpdateCuratorStatusDto } from './dto/update-curator-status.dto';
import {
  CreateArAssetDto,
  type ArModelFormat,
} from './dto/create-ar-asset.dto';
import { UpdateArAssetDto } from './dto/update-ar-asset.dto';
import { CuratorAccountEntity } from './entities/curator-account.entity';
import { ArAssetEntity } from './entities/ar-asset.entity';
import {
  AR_ASSET_STORAGE_BUCKET,
  MAX_AR_ASSET_SIZE_BYTES,
} from './developer.constants';

type AuditStatus = 'SUCCESS' | 'FAILED' | 'DENIED';

@Injectable()
export class DeveloperService {
  private readonly logger = new Logger(DeveloperService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
    private readonly storageService: StorageService,
  ) {}

  // ===========================================================
  // Curator account administration — REQ-4.2-02, REQ-4.2-03
  // ===========================================================

  async listCuratorAccounts(): Promise<CuratorAccountEntity[]> {
    const rows = await this.prisma.user_account.findMany({
      where: { role: 'CURATOR' },
      orderBy: { created_at: 'desc' },
    });

    return rows.map((row) => this.toCuratorAccountEntity(row));
  }

  /**
   * REQ-4.2-02: provisions a curator account through the approved
   * onboarding procedure and sends a secure password-setup invitation.
   * REQ-4.1-17: never sends a current/temporary password — the Supabase
   * invite flow is what lets the curator set their own password.
   *
   * Two Supabase Admin API calls are needed because inviteUserByEmail's
   * options only accept `data` (-> user_metadata, client-editable) and
   * `redirectTo` — there is no way to set app_metadata (the server-trusted
   * claim SupabaseAuthGuard reads the role from) in that same call. The
   * role is set separately via updateUserById right after the invite.
   */
  async onboardInitialCurator(
    dto: OnboardCuratorDto,
    actingDeveloperId: string,
  ): Promise<CuratorAccountEntity> {
    const { data, error } = await this.supabase.auth.admin.inviteUserByEmail(
      dto.email,
    );

    if (error || !data?.user) {
      await this.recordAudit({
        actingUserId: actingDeveloperId,
        action: 'ONBOARD_CURATOR',
        affectedRecordType: 'user_account',
        status: 'FAILED',
        details: { email: dto.email, reason: error?.message },
      });
      throw new ConflictException(
        error?.message ?? 'Unable to send the curator onboarding invitation.',
      );
    }

    const { error: metadataError } =
      await this.supabase.auth.admin.updateUserById(data.user.id, {
        app_metadata: { role: 'CURATOR' },
      });

    if (metadataError) {
      await this.recordAudit({
        actingUserId: actingDeveloperId,
        action: 'ONBOARD_CURATOR',
        affectedRecordType: 'user_account',
        status: 'FAILED',
        details: { email: dto.email, reason: metadataError.message },
      });
      throw new InternalServerErrorException(
        'The onboarding invitation was sent, but the curator role could ' +
          'not be assigned. Please contact an administrator before retrying.',
      );
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
      // The Supabase auth invite already succeeded at this point. There is
      // no single transaction spanning auth.users + public.user_account, so
      // this is logged loudly rather than silently retried — an operator
      // needs to reconcile the orphaned auth invite manually.
      this.logger.error(
        `Auth invite sent to ${dto.email} but the user_account record ` +
          'could not be created — manual reconciliation required.',
        insertError instanceof Error ? insertError.stack : insertError,
      );
      await this.recordAudit({
        actingUserId: actingDeveloperId,
        action: 'ONBOARD_CURATOR',
        affectedRecordType: 'user_account',
        status: 'FAILED',
        details: { email: dto.email, reason: this.errorMessage(insertError) },
      });
      throw new InternalServerErrorException(
        'The onboarding invitation was sent, but the curator account record ' +
          'could not be created. Please contact an administrator before retrying.',
      );
    }

    await this.recordAudit({
      actingUserId: actingDeveloperId,
      action: 'ONBOARD_CURATOR',
      affectedRecordId: accountRow.id,
      affectedRecordType: 'user_account',
      status: 'SUCCESS',
      details: { email: dto.email },
    });

    return this.toCuratorAccountEntity(accountRow);
  }

  /**
   * REQ-4.2-03: activate/deactivate a curator account only under formal
   * authorization. Also enforces that a Developer may not touch another
   * Developer account through this restricted path — only curator accounts.
   */
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
        actingUserId: actingDeveloperId,
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
        actingUserId: actingDeveloperId,
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
      actingUserId: actingDeveloperId,
      action: 'UPDATE_CURATOR_STATUS',
      affectedRecordId: id,
      affectedRecordType: 'user_account',
      status: 'SUCCESS',
      details: {
        newStatus: dto.status,
        authorizationReason: dto.authorizationReason,
      },
    });

    return this.toCuratorAccountEntity(updated);
  }

  // ===========================================================
  // AR asset deployment — REQ-4.2-04, REQ-4.2-05
  // ===========================================================

  async createArAsset(
    file: Express.Multer.File,
    dto: CreateArAssetDto,
    actingDeveloperId: string,
  ): Promise<ArAssetEntity> {
    await this.assertExhibitExists(dto.exhibitId);
    this.validateArAssetFile(file, dto.modelFormat);

    const storagePath = `${dto.exhibitId}/${randomUUID()}.${dto.modelFormat}`;

    await this.storageService.upload(
      AR_ASSET_STORAGE_BUCKET,
      storagePath,
      file.buffer,
      file.mimetype,
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
      // Best-effort cleanup so we don't leak an orphaned file if the DB
      // insert failed after the upload succeeded.
      await this.storageService
        .remove(AR_ASSET_STORAGE_BUCKET, storagePath)
        .catch(() => undefined);

      await this.recordAudit({
        actingUserId: actingDeveloperId,
        action: 'CREATE_AR_ASSET',
        affectedRecordType: 'ar_asset',
        status: 'FAILED',
        details: { exhibitId: dto.exhibitId, reason: this.errorMessage(error) },
      });
      throw new InternalServerErrorException(
        'Unable to create the AR asset record.',
      );
    }

    await this.recordAudit({
      actingUserId: actingDeveloperId,
      action: 'CREATE_AR_ASSET',
      affectedRecordId: created.id,
      affectedRecordType: 'ar_asset',
      status: 'SUCCESS',
      details: { exhibitId: dto.exhibitId, modelFormat: dto.modelFormat },
    });

    return this.toArAssetEntity(created);
  }

  async updateArAsset(
    id: string,
    file: Express.Multer.File | undefined,
    dto: UpdateArAssetDto,
    actingDeveloperId: string,
  ): Promise<ArAssetEntity> {
    const existing = await this.findArAssetOrThrow(id);

    if (dto.exhibitId) {
      await this.assertExhibitExists(dto.exhibitId);
    }

    const updateData: Prisma.ar_assetUncheckedUpdateInput = {};
    let previousStoragePath: string | null = null;

    if (file) {
      const targetFormat: ArModelFormat =
        dto.modelFormat ?? (existing.modelFormat as ArModelFormat);
      this.validateArAssetFile(file, targetFormat);

      const exhibitId = dto.exhibitId ?? existing.exhibitId;
      const storagePath = `${exhibitId}/${randomUUID()}.${targetFormat}`;
      await this.storageService.upload(
        AR_ASSET_STORAGE_BUCKET,
        storagePath,
        file.buffer,
        file.mimetype,
      );

      previousStoragePath = existing.storage_path;
      updateData.storage_path = storagePath;
      updateData.model_format = targetFormat;
    } else if (dto.modelFormat) {
      updateData.model_format = dto.modelFormat;
    }

    if (dto.exhibitId) {
      updateData.exhibit_id = dto.exhibitId;
    }

    if (dto.isEnabled !== undefined) {
      updateData.is_enabled = dto.isEnabled;
    }

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
      await this.recordAudit({
        actingUserId: actingDeveloperId,
        action: 'UPDATE_AR_ASSET',
        affectedRecordId: id,
        affectedRecordType: 'ar_asset',
        status: 'FAILED',
        details: { reason: this.errorMessage(error) },
      });
      throw new InternalServerErrorException('Unable to update the AR asset.');
    }

    if (previousStoragePath) {
      await this.storageService
        .remove(AR_ASSET_STORAGE_BUCKET, previousStoragePath)
        .catch(() => undefined);
    }

    await this.recordAudit({
      actingUserId: actingDeveloperId,
      action: 'UPDATE_AR_ASSET',
      affectedRecordId: id,
      affectedRecordType: 'ar_asset',
      status: 'SUCCESS',
      details: {
        exhibitId: dto.exhibitId,
        modelFormat: dto.modelFormat,
        isEnabled: dto.isEnabled,
      },
    });

    return this.toArAssetEntity(updated);
  }

  async setArAssetEnabled(
    id: string,
    isEnabled: boolean,
    actingDeveloperId: string,
  ): Promise<ArAssetEntity> {
    await this.findArAssetOrThrow(id);

    let updated: ar_asset;

    try {
      updated = await this.prisma.ar_asset.update({
        where: { id },
        data: { isEnabled },
      });
    } catch (error) {
      await this.recordAudit({
        actingUserId: actingDeveloperId,
        action: isEnabled ? 'ACTIVATE_AR_ASSET' : 'DEACTIVATE_AR_ASSET',
        affectedRecordId: id,
        affectedRecordType: 'ar_asset',
        status: 'FAILED',
        details: { reason: this.errorMessage(error) },
      });
      throw new InternalServerErrorException(
        `Unable to ${isEnabled ? 'activate' : 'deactivate'} the AR asset.`,
      );
    }

    await this.recordAudit({
      actingUserId: actingDeveloperId,
      action: isEnabled ? 'ACTIVATE_AR_ASSET' : 'DEACTIVATE_AR_ASSET',
      affectedRecordId: id,
      affectedRecordType: 'ar_asset',
      status: 'SUCCESS',
    });

    return this.toArAssetEntity(updated);
  }

  async removeArAsset(
    id: string,
    actingDeveloperId: string,
  ): Promise<{ id: string; removed: true }> {
    const existing = await this.findArAssetOrThrow(id);

    try {
      await this.prisma.ar_asset.delete({ where: { id } });
    } catch (error) {
      await this.recordAudit({
        actingUserId: actingDeveloperId,
        action: 'REMOVE_AR_ASSET',
        affectedRecordId: id,
        affectedRecordType: 'ar_asset',
        status: 'FAILED',
        details: { reason: this.errorMessage(error) },
      });
      throw new InternalServerErrorException('Unable to remove the AR asset.');
    }

    await this.storageService
      .remove(AR_ASSET_STORAGE_BUCKET, existing.modelUrl)
      .catch(() => undefined);

    await this.recordAudit({
      actingUserId: actingDeveloperId,
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

  private async findArAssetOrThrow(id: string): Promise<ArAssetEntity> {
    const asset = await this.prisma.ar_asset.findUnique({ where: { id } });

    if (!asset) {
      throw new NotFoundException(`No AR asset found with id "${id}".`);
    }

    return asset;
  }

  /**
   * Read-only existence/eligibility check. The Developer module never
   * writes to `exhibit` — REQ-4.2-06/07 keep exhibit content management
   * inside the curator-facing exhibits module.
   */
  private async assertExhibitExists(exhibitId: string): Promise<void> {
    const exhibit = await this.prisma.exhibit.findUnique({
      where: { id: exhibitId },
      select: { id: true, archivedAt: true },
    });

    if (!exhibit) {
      throw new NotFoundException(`No exhibit found with id "${exhibitId}".`);
    }

    if (exhibit.archivedAt) {
      throw new BadRequestException(
        'AR assets cannot be deployed to an archived exhibit.',
      );
    }
  }

  private validateArAssetFile(
    file: Express.Multer.File | undefined,
    modelFormat: ArModelFormat,
  ): void {
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

    const extension = extname(file.originalname)
      .toLowerCase()
      .replace('.', '');

    if (extension !== modelFormat) {
      throw new BadRequestException(
        `File extension ".${extension}" does not match the declared model format "${modelFormat}".`,
      );
    }
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return `${error.code}: ${error.message}`;
    }
    return error instanceof Error ? error.message : 'Unknown error';
  }

  // 

  private toCuratorAccountEntity(row: user_account): CuratorAccountEntity {
    return {
      id: row.id,
      authUserId: row.auth_user_id,
      fullName: row.full_name,
      role: row.role,
      status: row.status,
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

  /**
   * REQ-4.2-09: "The system shall audit all developer account and AR
   * deployment actions." A failure to write the audit row is logged loudly
   * but never allowed to mask the outcome of the primary operation, which
   * has already been decided by the time this is called.
   *
   * `details` is spread in conditionally rather than passed as
   * `params.details ?? Prisma.JsonNull` — the newer Prisma client's
   * `NullableJsonNullValueInput` type doesn't accept `Prisma.JsonNull`
   * directly in this generator's typings, and there's no need for an
   * explicit SQL NULL anyway: omitting an optional Json field entirely
   * already stores NULL.
   */
  private async recordAudit(params: {
    actingUserId: string;
    action: string;
    affectedRecordId?: string;
    affectedRecordType?: string;
    details?: Record<string, unknown>;
    status: AuditStatus;
  }): Promise<void> {
    try {
      await this.prisma.audit_log.create({
        data: {
          userId: params.actingUserId,
          affectedRecordId: params.affectedRecordId,
          affectedRecordType: params.affectedRecordType,
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