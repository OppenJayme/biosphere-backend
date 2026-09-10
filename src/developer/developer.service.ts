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
import {
  Prisma,
  type ar_asset,
  type user_account,
} from '../generated/prisma/client';
import { extname } from 'node:path';
import { SUPABASE_CLIENT } from '../supabase/supabase.constants';
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

  async onboardInitialCurator(
    dto: OnboardCuratorDto,
    actingDeveloperId: string,
  ): Promise<CuratorAccountEntity> {
    const { data, error } = await this.supabase.auth.admin.inviteUserByEmail(
      dto.email,
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

    const { error: metadataError } =
      await this.supabase.auth.admin.updateUserById(data.user.id, {
        app_metadata: { role: 'CURATOR' },
      });

    if (metadataError) {
      await this.recordAudit({
        actingAuthUserId: actingDeveloperId,
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
      accountRow = this.toCuratorAccountEntity(account);
    } catch (insertError) {
      this.logger.error(
        `Auth invite sent to ${dto.email} but the user_account record ` +
          'could not be created — manual reconciliation required.',
        insertError instanceof Error ? insertError.stack : insertError,
      );
      await this.recordAudit({
        actingAuthUserId: actingDeveloperId,
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
      actingAuthUserId: actingDeveloperId,
      action: 'ONBOARD_CURATOR',
      affectedRecordId: accountRow.id,
      affectedRecordType: 'user_account',
      status: 'SUCCESS',
      details: { email: dto.email },
    });

    return this.toCuratorAccountEntity(accountRow);
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
      updated = this.toCuratorAccountEntity(account);
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

    const storagePath = await this.storageService.upload(
      AR_ASSET_STORAGE_BUCKET,
      dto.exhibitId,
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
      created = this.toArAssetEntity(asset);
    } catch (error) {
      await this.storageService
        .remove(AR_ASSET_STORAGE_BUCKET, storagePath)
        .catch(() => undefined);

      await this.recordAudit({
        actingAuthUserId: actingDeveloperId,
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
      actingAuthUserId: actingDeveloperId,
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
    let uploadedStoragePath: string | null = null;

    if (file) {
      const targetFormat: ArModelFormat =
        dto.modelFormat ?? (existing.model_format as ArModelFormat);
      this.validateArAssetFile(file, targetFormat);

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
      updated = this.toArAssetEntity(asset);
    } catch (error) {
      if (uploadedStoragePath) {
        await this.storageService
          .remove(AR_ASSET_STORAGE_BUCKET, uploadedStoragePath)
          .catch(() => undefined);
      }
      await this.recordAudit({
        actingAuthUserId: actingDeveloperId,
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
      actingAuthUserId: actingDeveloperId,
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
        data: { is_enabled: isEnabled },
      });
      updated = this.toArAssetEntity(asset);
    } catch (error) {
      await this.recordAudit({
        actingAuthUserId: actingDeveloperId,
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
      actingAuthUserId: actingDeveloperId,
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

  private async findArAssetOrThrow(id: string): Promise<ar_asset> {
    const asset = await this.prisma.ar_asset.findUnique({ where: { id } });

    if (!asset) {
      throw new NotFoundException(`No AR asset found with id "${id}".`);
    }

    return this.toArAssetEntity(asset);
  }

  private async assertExhibitExists(exhibitId: string): Promise<void> {
    const exhibit = await this.prisma.exhibit.findUnique({
      where: { id: exhibitId },
      select: { id: true, archived_at: true },
    });

    if (!exhibit) {
      throw new NotFoundException(`No exhibit found with id "${exhibitId}".`);
    }

    if (exhibit.archived_at) {
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

    const extension = extname(file.originalname).toLowerCase().replace('.', '');

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