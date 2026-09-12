import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  type specimen,
  type specimen_media,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../supabase/storage.service';
import { CreateSpecimenMediaDto } from './dto/create-specimen-media.dto';
import { UpdateSpecimenMediaDto } from './dto/update-specimen-media.dto';
import {
  RemoveSpecimenMediaResult,
  ReplaceSpecimenMediaResult,
  SpecimenMedia,
  SpecimenMediaSignedUrl,
} from './entities/specimen-media.entity';

const SPECIMEN_MEDIA_BUCKET = 'specimen-media';
const SIGNED_URL_LIFETIME_SECONDS = 300;
const SERIALIZABLE_RETRY_LIMIT = 3;
const POSTGRES_INTEGER_MAX = 2_147_483_647;

@Injectable()
export class SpecimenMediaService {
  private readonly logger = new Logger(SpecimenMediaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async create(
    specimenId: string,
    file: Express.Multer.File | undefined,
    dto: CreateSpecimenMediaDto,
    actingCuratorAccountId: string,
  ): Promise<SpecimenMedia> {
    if (!file) {
      throw new BadRequestException('A specimen image file is required.');
    }

    const specimenRecord = await this.findSpecimenOrThrow(
      this.prisma,
      specimenId,
    );
    this.assertSpecimenEditable(specimenRecord);

    const storagePath = await this.storage.upload(
      SPECIMEN_MEDIA_BUCKET,
      specimenId,
      file.buffer,
      file.mimetype,
    );

    try {
      return await this.runSerializableMutation(async (transaction) => {
        const currentSpecimen = await this.findSpecimenOrThrow(
          transaction,
          specimenId,
        );
        this.assertSpecimenEditable(currentSpecimen);

        const [aggregate, existingCover] = await Promise.all([
          transaction.specimen_media.aggregate({
            where: { specimen_id: specimenId },
            _max: { display_order: true },
          }),
          transaction.specimen_media.findFirst({
            where: { specimen_id: specimenId, is_cover: true },
            select: { id: true },
          }),
        ]);
        const shouldBeCover = dto.isCover === true || existingCover === null;
        const displayOrder =
          dto.displayOrder ??
          this.nextDisplayOrder(aggregate._max.display_order);
        const changedAt = new Date();

        if (shouldBeCover) {
          await transaction.specimen_media.updateMany({
            where: { specimen_id: specimenId, is_cover: true },
            data: { is_cover: false },
          });
        }

        const created = await transaction.specimen_media.create({
          data: {
            specimen_id: specimenId,
            storage_path: storagePath,
            display_order: displayOrder,
            caption: dto.caption,
            is_cover: shouldBeCover,
            created_at: changedAt,
          },
        });

        await this.touchSpecimen(
          transaction,
          specimenId,
          actingCuratorAccountId,
          changedAt,
        );
        await this.recordRevision(transaction, {
          specimenId,
          changedBy: actingCuratorAccountId,
          fieldChanged: 'specimen_media',
          oldValue: null,
          newValue: created.id,
          changedAt,
        });
        await this.recordAudit(transaction, {
          userId: actingCuratorAccountId,
          specimenId,
          mediaId: created.id,
          action: 'CREATE_SPECIMEN_MEDIA',
          details: {
            displayOrder,
            isCover: shouldBeCover,
            mimeType: file.mimetype,
          },
        });

        return this.toEntity(created);
      });
    } catch (error) {
      try {
        await this.storage.remove(SPECIMEN_MEDIA_BUCKET, storagePath);
      } catch (cleanupError) {
        this.logger.error(
          `Failed to remove orphaned specimen media object ${storagePath}.`,
          cleanupError instanceof Error ? cleanupError.stack : cleanupError,
        );
        await this.recordStorageCleanupFailure({
          userId: actingCuratorAccountId,
          specimenId,
          action: 'CLEANUP_ORPHANED_SPECIMEN_MEDIA',
          storagePath,
          error: cleanupError,
        });
      }

      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException ||
        error instanceof ConflictException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        'The specimen image could not be saved. If this continues, contact an administrator.',
      );
    }
  }

  async findAll(specimenId: string): Promise<SpecimenMedia[]> {
    await this.findSpecimenOrThrow(this.prisma, specimenId);
    const media = await this.prisma.specimen_media.findMany({
      where: { specimen_id: specimenId },
      orderBy: [{ display_order: 'asc' }, { created_at: 'asc' }, { id: 'asc' }],
    });
    return media.map((item) => this.toEntity(item));
  }

  async findOne(specimenId: string, mediaId: string): Promise<SpecimenMedia> {
    await this.findSpecimenOrThrow(this.prisma, specimenId);
    return this.toEntity(
      await this.findMediaOrThrow(this.prisma, specimenId, mediaId),
    );
  }

  async createSignedUrl(
    specimenId: string,
    mediaId: string,
  ): Promise<SpecimenMediaSignedUrl> {
    await this.findSpecimenOrThrow(this.prisma, specimenId);
    const media = await this.findMediaOrThrow(this.prisma, specimenId, mediaId);
    const signedUrl = await this.storage.createSignedUrl(
      SPECIMEN_MEDIA_BUCKET,
      media.storage_path,
      SIGNED_URL_LIFETIME_SECONDS,
    );
    return {
      mediaId,
      signedUrl,
      expiresIn: SIGNED_URL_LIFETIME_SECONDS,
    };
  }

  async update(
    specimenId: string,
    mediaId: string,
    dto: UpdateSpecimenMediaDto,
    actingCuratorAccountId: string,
  ): Promise<SpecimenMedia> {
    return this.prisma.$transaction(async (transaction) => {
      const specimenRecord = await this.findSpecimenOrThrow(
        transaction,
        specimenId,
      );
      this.assertSpecimenEditable(specimenRecord);
      const existing = await this.findMediaOrThrow(
        transaction,
        specimenId,
        mediaId,
      );

      const captionChanged =
        dto.caption !== undefined && dto.caption !== existing.caption;
      const orderChanged =
        dto.displayOrder !== undefined &&
        dto.displayOrder !== existing.display_order;
      if (!captionChanged && !orderChanged) {
        throw new BadRequestException(
          'At least one specimen media field must change.',
        );
      }

      const changedAt = new Date();
      const updated = await transaction.specimen_media.update({
        where: { id: mediaId },
        data: {
          caption: captionChanged ? dto.caption : undefined,
          display_order: orderChanged ? dto.displayOrder : undefined,
        },
      });

      await this.touchSpecimen(
        transaction,
        specimenId,
        actingCuratorAccountId,
        changedAt,
      );
      if (captionChanged) {
        await this.recordRevision(transaction, {
          specimenId,
          changedBy: actingCuratorAccountId,
          fieldChanged: 'specimen_media.caption',
          oldValue: existing.caption,
          newValue: dto.caption ?? null,
          changedAt,
        });
      }
      if (orderChanged) {
        await this.recordRevision(transaction, {
          specimenId,
          changedBy: actingCuratorAccountId,
          fieldChanged: 'specimen_media.display_order',
          oldValue: String(existing.display_order),
          newValue: String(dto.displayOrder),
          changedAt,
        });
      }
      await this.recordAudit(transaction, {
        userId: actingCuratorAccountId,
        specimenId,
        mediaId,
        action: 'UPDATE_SPECIMEN_MEDIA',
        details: {
          fields: [
            ...(captionChanged ? ['caption'] : []),
            ...(orderChanged ? ['display_order'] : []),
          ],
        },
      });

      return this.toEntity(updated);
    });
  }

  async replaceFile(
    specimenId: string,
    mediaId: string,
    file: Express.Multer.File | undefined,
    actingCuratorAccountId: string,
  ): Promise<ReplaceSpecimenMediaResult> {
    if (!file) {
      throw new BadRequestException(
        'A replacement specimen image is required.',
      );
    }

    const specimenRecord = await this.findSpecimenOrThrow(
      this.prisma,
      specimenId,
    );
    this.assertSpecimenEditable(specimenRecord);
    await this.findMediaOrThrow(this.prisma, specimenId, mediaId);

    const newStoragePath = await this.storage.upload(
      SPECIMEN_MEDIA_BUCKET,
      specimenId,
      file.buffer,
      file.mimetype,
    );

    let replacement: { media: SpecimenMedia; previousStoragePath: string };
    try {
      replacement = await this.runSerializableMutation(async (transaction) => {
        const currentSpecimen = await this.findSpecimenOrThrow(
          transaction,
          specimenId,
        );
        this.assertSpecimenEditable(currentSpecimen);
        const existing = await this.findMediaOrThrow(
          transaction,
          specimenId,
          mediaId,
        );
        const changedAt = new Date();
        const updated = await transaction.specimen_media.update({
          where: { id: mediaId },
          data: { storage_path: newStoragePath },
        });

        await this.touchSpecimen(
          transaction,
          specimenId,
          actingCuratorAccountId,
          changedAt,
        );
        await this.recordRevision(transaction, {
          specimenId,
          changedBy: actingCuratorAccountId,
          fieldChanged: 'specimen_media.file',
          oldValue: existing.storage_path,
          newValue: updated.storage_path,
          changedAt,
        });
        await this.recordAudit(transaction, {
          userId: actingCuratorAccountId,
          specimenId,
          mediaId,
          action: 'REPLACE_SPECIMEN_MEDIA_FILE',
          details: { mimeType: file.mimetype },
        });

        return {
          media: this.toEntity(updated),
          previousStoragePath: existing.storage_path,
        };
      });
    } catch (error) {
      try {
        await this.storage.remove(SPECIMEN_MEDIA_BUCKET, newStoragePath);
      } catch (cleanupError) {
        this.logger.error(
          `Failed to remove orphaned replacement object ${newStoragePath}.`,
          cleanupError instanceof Error ? cleanupError.stack : cleanupError,
        );
        await this.recordStorageCleanupFailure({
          userId: actingCuratorAccountId,
          specimenId,
          mediaId,
          action: 'CLEANUP_ORPHANED_MEDIA_REPLACEMENT',
          storagePath: newStoragePath,
          error: cleanupError,
        });
      }

      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException ||
        error instanceof ConflictException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        'The replacement image could not be saved. If this continues, contact an administrator.',
      );
    }

    let previousStorageCleanupPending = false;
    try {
      await this.storage.remove(
        SPECIMEN_MEDIA_BUCKET,
        replacement.previousStoragePath,
      );
    } catch (error) {
      previousStorageCleanupPending = true;
      this.logger.error(
        `Specimen media ${mediaId} now uses its replacement, but previous object ${replacement.previousStoragePath} still requires cleanup.`,
        error instanceof Error ? error.stack : error,
      );
      await this.recordStorageCleanupFailure({
        userId: actingCuratorAccountId,
        specimenId,
        mediaId,
        action: 'CLEANUP_REPLACED_SPECIMEN_MEDIA',
        storagePath: replacement.previousStoragePath,
        error,
      });
    }

    return { media: replacement.media, previousStorageCleanupPending };
  }

  async setCover(
    specimenId: string,
    mediaId: string,
    actingCuratorAccountId: string,
  ): Promise<SpecimenMedia> {
    return this.runSerializableMutation(async (transaction) => {
      const specimenRecord = await this.findSpecimenOrThrow(
        transaction,
        specimenId,
      );
      this.assertSpecimenEditable(specimenRecord);
      const selected = await this.findMediaOrThrow(
        transaction,
        specimenId,
        mediaId,
      );
      if (selected.is_cover) return this.toEntity(selected);

      const previousCover = await transaction.specimen_media.findFirst({
        where: { specimen_id: specimenId, is_cover: true },
        orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
        select: { id: true },
      });
      const changedAt = new Date();
      await transaction.specimen_media.updateMany({
        where: { specimen_id: specimenId, is_cover: true },
        data: { is_cover: false },
      });
      const updated = await transaction.specimen_media.update({
        where: { id: mediaId },
        data: { is_cover: true },
      });

      await this.touchSpecimen(
        transaction,
        specimenId,
        actingCuratorAccountId,
        changedAt,
      );
      await this.recordRevision(transaction, {
        specimenId,
        changedBy: actingCuratorAccountId,
        fieldChanged: 'specimen_media.cover',
        oldValue: previousCover?.id ?? null,
        newValue: mediaId,
        changedAt,
      });
      await this.recordAudit(transaction, {
        userId: actingCuratorAccountId,
        specimenId,
        mediaId,
        action: 'SET_SPECIMEN_MEDIA_COVER',
        details: { previousCoverId: previousCover?.id ?? null },
      });

      return this.toEntity(updated);
    });
  }

  async remove(
    specimenId: string,
    mediaId: string,
    actingCuratorAccountId: string,
  ): Promise<RemoveSpecimenMediaResult> {
    const removed = await this.runSerializableMutation(async (transaction) => {
      const specimenRecord = await this.findSpecimenOrThrow(
        transaction,
        specimenId,
      );
      this.assertSpecimenEditable(specimenRecord);
      const existing = await this.findMediaOrThrow(
        transaction,
        specimenId,
        mediaId,
      );

      const nextCover = existing.is_cover
        ? await transaction.specimen_media.findFirst({
            where: { specimen_id: specimenId, id: { not: mediaId } },
            orderBy: [
              { display_order: 'asc' },
              { created_at: 'asc' },
              { id: 'asc' },
            ],
          })
        : null;
      const changedAt = new Date();

      await transaction.specimen_media.delete({ where: { id: mediaId } });
      if (existing.is_cover) {
        await transaction.specimen_media.updateMany({
          where: { specimen_id: specimenId, is_cover: true },
          data: { is_cover: false },
        });
        if (nextCover) {
          await transaction.specimen_media.update({
            where: { id: nextCover.id },
            data: { is_cover: true },
          });
        }
      }

      await this.touchSpecimen(
        transaction,
        specimenId,
        actingCuratorAccountId,
        changedAt,
      );
      await this.recordRevision(transaction, {
        specimenId,
        changedBy: actingCuratorAccountId,
        fieldChanged: 'specimen_media',
        oldValue: mediaId,
        newValue: null,
        changedAt,
      });
      await this.recordAudit(transaction, {
        userId: actingCuratorAccountId,
        specimenId,
        mediaId,
        action: 'REMOVE_SPECIMEN_MEDIA',
        details: {
          wasCover: existing.is_cover,
          replacementCoverId: nextCover?.id ?? null,
        },
      });

      return existing;
    });

    let storageCleanupPending = false;
    try {
      await this.storage.remove(SPECIMEN_MEDIA_BUCKET, removed.storage_path);
    } catch (error) {
      storageCleanupPending = true;
      this.logger.error(
        `Specimen media ${mediaId} was removed from PostgreSQL, but storage object ${removed.storage_path} still requires cleanup.`,
        error instanceof Error ? error.stack : error,
      );
      await this.recordStorageCleanupFailure({
        userId: actingCuratorAccountId,
        specimenId,
        mediaId,
        action: 'CLEANUP_REMOVED_SPECIMEN_MEDIA',
        storagePath: removed.storage_path,
        error,
      });
    }

    return { id: mediaId, removed: true, storageCleanupPending };
  }

  private nextDisplayOrder(currentMaximum: number | null): number {
    if (currentMaximum === null) return 0;
    if (currentMaximum === POSTGRES_INTEGER_MAX) {
      throw new BadRequestException(
        'A display order must be supplied because the current maximum cannot be incremented.',
      );
    }
    return currentMaximum + 1;
  }

  private async runSerializableMutation<T>(
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= SERIALIZABLE_RETRY_LIMIT; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (!this.isRetryableTransactionError(error)) throw error;
        if (attempt === SERIALIZABLE_RETRY_LIMIT) {
          throw new ConflictException(
            'Specimen media changed during the operation. Reload and try again.',
          );
        }
      }
    }
    throw new ConflictException(
      'Specimen media changed during the operation. Reload and try again.',
    );
  }

  private isRetryableTransactionError(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2034'
    );
  }

  private async findSpecimenOrThrow(
    client: Pick<Prisma.TransactionClient, 'specimen'>,
    specimenId: string,
  ): Promise<specimen> {
    const item = await client.specimen.findUnique({
      where: { id: specimenId },
    });
    if (!item) {
      throw new NotFoundException(`Specimen ${specimenId} not found`);
    }
    return item;
  }

  private async findMediaOrThrow(
    client: Pick<Prisma.TransactionClient, 'specimen_media'>,
    specimenId: string,
    mediaId: string,
  ): Promise<specimen_media> {
    const item = await client.specimen_media.findFirst({
      where: { id: mediaId, specimen_id: specimenId },
    });
    if (!item) {
      throw new NotFoundException(
        `Media ${mediaId} not found for specimen ${specimenId}`,
      );
    }
    return item;
  }

  private assertSpecimenEditable(item: specimen): void {
    if (item.status === 'ARCHIVED' || item.archived_at) {
      throw new BadRequestException(
        'Media for an archived specimen cannot be changed.',
      );
    }
  }

  private async touchSpecimen(
    transaction: Prisma.TransactionClient,
    specimenId: string,
    actingCuratorAccountId: string,
    changedAt: Date,
  ): Promise<void> {
    await transaction.specimen.update({
      where: { id: specimenId },
      data: {
        updated_by: actingCuratorAccountId,
        updated_at: changedAt,
      },
    });
  }

  private async recordRevision(
    transaction: Prisma.TransactionClient,
    params: {
      specimenId: string;
      changedBy: string;
      fieldChanged: string;
      oldValue: string | null;
      newValue: string | null;
      changedAt: Date;
    },
  ): Promise<void> {
    await transaction.specimen_revision_history.create({
      data: {
        specimen_id: params.specimenId,
        changed_by: params.changedBy,
        field_changed: params.fieldChanged,
        old_value: params.oldValue,
        new_value: params.newValue,
        changed_at: params.changedAt,
        source_section: 'specimen_media',
      },
    });
  }

  private async recordAudit(
    transaction: Prisma.TransactionClient,
    params: {
      userId: string;
      specimenId: string;
      mediaId: string;
      action: string;
      details: Record<string, Prisma.InputJsonValue | null>;
    },
  ): Promise<void> {
    await transaction.audit_log.create({
      data: {
        user_id: params.userId,
        affected_record_id: params.mediaId,
        affected_record_type: 'specimen_media',
        action: params.action,
        module: 'specimens',
        details: { specimenId: params.specimenId, ...params.details },
        status: 'SUCCESS',
      },
    });
  }

  private async recordStorageCleanupFailure(params: {
    userId: string;
    specimenId: string;
    mediaId?: string;
    action: string;
    storagePath: string;
    error: unknown;
  }): Promise<void> {
    try {
      await this.prisma.audit_log.create({
        data: {
          user_id: params.userId,
          affected_record_id: params.mediaId ?? params.specimenId,
          affected_record_type: 'specimen_media',
          action: params.action,
          module: 'specimens',
          details: {
            specimenId: params.specimenId,
            storagePath: params.storagePath,
            reason:
              params.error instanceof Error
                ? params.error.message
                : 'Unknown storage cleanup error',
          },
          status: 'FAILED',
        },
      });
    } catch (auditError) {
      this.logger.error(
        `Unable to record failed storage cleanup audit for ${params.storagePath}.`,
        auditError instanceof Error ? auditError.stack : auditError,
      );
    }
  }

  private toEntity(item: specimen_media): SpecimenMedia {
    return {
      id: item.id,
      specimenId: item.specimen_id,
      storagePath: item.storage_path,
      displayOrder: item.display_order,
      caption: item.caption,
      isCover: item.is_cover,
      createdAt: item.created_at,
    };
  }
}
