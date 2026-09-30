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
import { OnboardCuratorDto } from './dto/onboard-curator.dto';
import { UpdateCuratorStatusDto } from './dto/update-curator-status.dto';
import {
  CreateArAssetDto,
  type ArModelFormat,
} from './dto/create-ar-asset.dto';
import { UpdateArAssetDto } from './dto/update-ar-asset.dto';
import { CuratorAccountEntity } from './entities/curator-account.entity';
import { ArAssetEntity, ArExhibitEntity } from './entities/ar-asset.entity';
import {
  AR_ASSET_STORAGE_BUCKET,
  MAX_AR_ASSET_SIZE_BYTES,
} from './developer.constants';

type AuditStatus = 'SUCCESS' | 'FAILED' | 'DENIED';

// An AR-deployable exhibit: it is not archived and its specimen is not
// archived, still Cataloged and approved for public display, the same rule
// the curator's exhibit module applies to an exhibit's specimen (BR-20).
// This is eligibility only, not AR selection: which deployable exhibits get
// AR is the curator's decision, handed to the developer outside BioSphere
// (REQ-4.13-02). The curator then turns AR on or off for the exhibit.
const DEPLOYABLE_EXHIBIT: Prisma.exhibitWhereInput = {
  archived_at: null,
  specimen: {
    status: 'CATALOGED',
    public_display_allowed: true,
    archived_at: null,
  },
};

// The exhibit fields isDeployable needs.
const DEPLOYABILITY_SELECT = {
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

    return rows.map((row) => this.toCuratorAccountEntity(row));
  }

  async onboardInitialCurator(
    dto: OnboardCuratorDto,
    actingDeveloperId: string,
  ): Promise<CuratorAccountEntity> {
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
    await this.assertExhibitDeployable(dto.exhibitId);
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
    const existing = await this.findArAssetOrThrow(id);

    // Replacing, moving, or activating deploys something new to visitors,
    // so it must carry documented authorization (REQ-4.2-05). Checked before
    // anything is uploaded.
    if (
      (file || dto.exhibitId || dto.isEnabled) &&
      !dto.authorizationReference
    ) {
      throw new BadRequestException(
        'An authorizationReference is required to replace, move, or activate an AR asset.',
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

    const updateData: Prisma.ar_assetUncheckedUpdateInput = {};
    let previousStoragePath: string | null = null;

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
    if (isEnabled && !authorizationReference?.trim()) {
      throw new BadRequestException(
        'An authorizationReference is required to activate an AR asset.',
      );
    }

    const existing = await this.findArAssetOrThrow(id);

    if (isEnabled) {
      await this.assertCurrentExhibitDeployable(existing, 'activated');
    }

    const authorizationDetails = isEnabled
      ? { authorizationReference: authorizationReference?.trim() }
      : {};

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
      ...(isEnabled ? { details: authorizationDetails } : {}),
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

  // Mirrors DEPLOYABLE_EXHIBIT for an exhibit that is already loaded.
  private isDeployable(exhibit: {
    archived_at: Date | null;
    specimen: {
      status: string;
      public_display_allowed: boolean;
      archived_at: Date | null;
    };
  }): boolean {
    return (
      exhibit.archived_at === null &&
      exhibit.specimen.archived_at === null &&
      exhibit.specimen.status === 'CATALOGED' &&
      exhibit.specimen.public_display_allowed
    );
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
