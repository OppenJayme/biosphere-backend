import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  type exhibit,
  type exhibit_media,
  type specimen,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../supabase/storage.service';
import { AddExhibitMediaDto } from './dto/add-exhibit-media.dto';
import { CreateExhibitDto } from './dto/create-exhibit.dto';
import { UpdateExhibitDto } from './dto/update-exhibit.dto';
import { Exhibit, ExhibitStatus } from './entities/exhibit.entity';
import { ExhibitMedia } from './entities/exhibit-media.entity';

const EXHIBIT_MEDIA_BUCKET = 'exhibit-media' as const;

@Injectable()
export class ExhibitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
  ) {}

  // ===========================================================
  // Curator CRUD — REQ-4.12-01/03
  // ===========================================================

  async create(
    dto: CreateExhibitDto,
    actingCuratorAccountId: string,
  ): Promise<Exhibit> {
    return this.prisma.$transaction(async (transaction) => {
      const specimenRecord = await transaction.specimen.findUnique({
        where: { id: dto.specimenId },
      });
      this.assertSpecimenEligible(specimenRecord, dto.specimenId);

      const existingForSpecimen = await transaction.exhibit.findFirst({
        where: { specimen_id: dto.specimenId, archived_at: null },
        select: { id: true },
      });
      if (existingForSpecimen) {
        throw new ConflictException(
          `Specimen ${dto.specimenId} already has an active exhibit.`,
        );
      }

      await this.assertSlugAvailable(transaction, dto.publicSlug);

      let created: exhibit;
      try {
        created = await transaction.exhibit.create({
          data: {
            specimen_id: dto.specimenId,
            created_by: actingCuratorAccountId,
            public_slug: dto.publicSlug,
            interesting_facts: dto.interestingFacts,
            public_description: dto.publicDescription,
            distribution: dto.distribution,
            diet: dto.diet,
            layout_type: dto.layoutType,
            status: 'UNPUBLISHED',
          },
        });
      } catch (error) {
        // Pre-checked above; this catch only guards the race window between
        // the check and the insert (see docs — slug uniqueness open item).
        if (this.isUniqueSlugViolation(error)) {
          throw new ConflictException(
            `Exhibit slug "${dto.publicSlug}" is already in use.`,
          );
        }
        throw error;
      }

      await this.recordAudit(transaction, {
        userId: actingCuratorAccountId,
        exhibitId: created.id,
        action: 'CREATE_EXHIBIT',
        details: { specimenId: dto.specimenId, publicSlug: dto.publicSlug },
      });

      return this.toEntity(created);
    });
  }

  async findAll(): Promise<Exhibit[]> {
    const exhibits = await this.prisma.exhibit.findMany({
      where: { archived_at: null },
      orderBy: { created_at: 'desc' },
    });

    return exhibits.map((item) => this.toEntity(item));
  }

  async findOne(id: string): Promise<Exhibit> {
    const item = await this.findOneOrThrow(id);
    const media = await this.prisma.exhibit_media.findMany({
      where: { exhibit_id: id },
      orderBy: { display_order: 'asc' },
    });

    return this.toEntity(item, media);
  }

  async update(
    id: string,
    dto: UpdateExhibitDto,
    actingCuratorAccountId: string,
  ): Promise<Exhibit> {
    return this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.exhibit.findUnique({
        where: { id },
      });
      this.assertExists(existing, id);
      this.assertNotArchived(existing);

      const hasChanges = [
        dto.publicSlug,
        dto.interestingFacts,
        dto.publicDescription,
        dto.distribution,
        dto.diet,
        dto.layoutType,
      ].some((value) => value !== undefined);

      if (!hasChanges) {
        throw new BadRequestException('At least one field must be updated.');
      }

      if (
        dto.publicSlug !== undefined &&
        dto.publicSlug !== existing.public_slug
      ) {
        await this.assertSlugAvailable(transaction, dto.publicSlug, id);
      }

      const data: Prisma.exhibitUncheckedUpdateInput = {
        updated_at: new Date(),
      };
      if (dto.publicSlug !== undefined) data.public_slug = dto.publicSlug;
      if (dto.interestingFacts !== undefined) {
        data.interesting_facts = dto.interestingFacts;
      }
      if (dto.publicDescription !== undefined) {
        data.public_description = dto.publicDescription;
      }
      if (dto.distribution !== undefined) data.distribution = dto.distribution;
      if (dto.diet !== undefined) data.diet = dto.diet;
      if (dto.layoutType !== undefined) data.layout_type = dto.layoutType;

      let updated: exhibit;
      try {
        updated = await transaction.exhibit.update({ where: { id }, data });
      } catch (error) {
        if (this.isUniqueSlugViolation(error)) {
          throw new ConflictException(
            `Exhibit slug "${dto.publicSlug}" is already in use.`,
          );
        }
        throw error;
      }

      await this.recordAudit(transaction, {
        userId: actingCuratorAccountId,
        exhibitId: id,
        action: 'UPDATE_EXHIBIT',
      });

      return this.toEntity(updated);
    });
  }

  // ===========================================================
  // Lifecycle — UNPUBLISHED -> PUBLISHED -> DISABLED, plus archive
  // ===========================================================

  async publish(id: string, actingCuratorAccountId: string): Promise<Exhibit> {
    return this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.exhibit.findUnique({
        where: { id },
      });
      this.assertExists(existing, id);
      this.assertNotArchived(existing);

      if (existing.status === 'PUBLISHED') {
        return this.toEntity(existing);
      }

      // Re-check eligibility at publish time, not just at creation time —
      // the specimen may have been unmarked for public display since.
      const specimenRecord = await transaction.specimen.findUnique({
        where: { id: existing.specimen_id },
      });
      this.assertSpecimenEligible(specimenRecord, existing.specimen_id);

      const publishedAt = new Date();
      const updated = await transaction.exhibit.update({
        where: { id },
        data: {
          status: 'PUBLISHED',
          published_at: publishedAt,
          updated_at: publishedAt,
        },
      });

      await this.recordAudit(transaction, {
        userId: actingCuratorAccountId,
        exhibitId: id,
        action: 'PUBLISH_EXHIBIT',
      });

      return this.toEntity(updated);
    });
  }

  async disable(id: string, actingCuratorAccountId: string): Promise<Exhibit> {
    return this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.exhibit.findUnique({
        where: { id },
      });
      this.assertExists(existing, id);
      this.assertNotArchived(existing);

      if (existing.status === 'DISABLED') {
        return this.toEntity(existing);
      }

      const updated = await transaction.exhibit.update({
        where: { id },
        data: { status: 'DISABLED', updated_at: new Date() },
      });

      await this.recordAudit(transaction, {
        userId: actingCuratorAccountId,
        exhibitId: id,
        action: 'DISABLE_EXHIBIT',
      });

      return this.toEntity(updated);
    });
  }

  async archive(id: string, actingCuratorAccountId: string): Promise<Exhibit> {
    return this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.exhibit.findUnique({
        where: { id },
      });
      this.assertExists(existing, id);

      if (existing.archived_at) {
        return this.toEntity(existing);
      }

      const archivedAt = new Date();
      const updated = await transaction.exhibit.update({
        where: { id },
        data: {
          status: 'DISABLED',
          archived_at: archivedAt,
          updated_at: archivedAt,
        },
      });

      await this.recordAudit(transaction, {
        userId: actingCuratorAccountId,
        exhibitId: id,
        action: 'ARCHIVE_EXHIBIT',
        details: { previousStatus: existing.status },
      });

      return this.toEntity(updated);
    });
  }

  // ===========================================================
  // Public QR exhibit page — REQ-4.12-04/09, BR-10
  // ===========================================================

  async findPublishedBySlug(slug: string): Promise<Omit<Exhibit, 'createdBy'>> {
    const item = await this.prisma.exhibit.findUnique({
      where: { public_slug: slug },
    });

    if (!item || item.status !== 'PUBLISHED' || item.archived_at) {
      throw new NotFoundException(`No published exhibit found for "${slug}".`);
    }

    const media = await this.prisma.exhibit_media.findMany({
      where: { exhibit_id: item.id },
      orderBy: { display_order: 'asc' },
    });

    return this.toPublicEntity(item, media);
  }

  // ===========================================================
  // Exhibit media — 'exhibit-media' bucket
  // ===========================================================

  async addMedia(
    exhibitId: string,
    file: Express.Multer.File,
    dto: AddExhibitMediaDto,
    actingCuratorAccountId: string,
  ): Promise<ExhibitMedia> {
    if (!file) {
      throw new BadRequestException('An exhibit media file is required.');
    }

    const exhibitRecord = await this.findOneOrThrow(exhibitId);
    this.assertNotArchived(exhibitRecord);

    const storagePath = await this.storageService.upload(
      EXHIBIT_MEDIA_BUCKET,
      exhibitId,
      file.buffer,
      file.mimetype,
    );

    try {
      return await this.prisma.$transaction(async (transaction) => {
        if (dto.isCover) {
          await transaction.exhibit_media.updateMany({
            where: { exhibit_id: exhibitId, is_cover: true },
            data: { is_cover: false },
          });
        }

        const media = await transaction.exhibit_media.create({
          data: {
            exhibit_id: exhibitId,
            storage_path: storagePath,
            display_order: dto.displayOrder ?? 0,
            caption: dto.caption,
            is_cover: dto.isCover ?? false,
          },
        });

        await this.recordAudit(transaction, {
          userId: actingCuratorAccountId,
          exhibitId,
          action: 'ADD_EXHIBIT_MEDIA',
          details: { mediaId: media.id },
        });

        return this.toMediaEntity(media);
      });
    } catch (error) {
      // Best-effort cleanup so a failed DB write doesn't leak an orphaned
      // file (same pattern as DeveloperService#createArAsset).
      await this.storageService
        .remove(EXHIBIT_MEDIA_BUCKET, storagePath)
        .catch(() => undefined);
      throw error;
    }
  }

  async removeMedia(
    exhibitId: string,
    mediaId: string,
    actingCuratorAccountId: string,
  ): Promise<{ id: string; removed: true }> {
    const media = await this.prisma.exhibit_media.findUnique({
      where: { id: mediaId },
    });

    if (!media || media.exhibit_id !== exhibitId) {
      throw new NotFoundException(
        `No exhibit media found with id "${mediaId}".`,
      );
    }

    await this.prisma.exhibit_media.delete({ where: { id: mediaId } });

    await this.storageService
      .remove(EXHIBIT_MEDIA_BUCKET, media.storage_path)
      .catch(() => undefined);

    await this.recordAudit(this.prisma, {
      userId: actingCuratorAccountId,
      exhibitId,
      action: 'REMOVE_EXHIBIT_MEDIA',
      details: { mediaId },
    });

    return { id: mediaId, removed: true };
  }

  // ===========================================================
  // Helpers
  // ===========================================================

  private async findOneOrThrow(id: string): Promise<exhibit> {
    const item = await this.prisma.exhibit.findUnique({ where: { id } });
    this.assertExists(item, id);
    return item;
  }

  private assertExists(
    item: exhibit | null,
    id: string,
  ): asserts item is exhibit {
    if (!item) {
      throw new NotFoundException(`Exhibit ${id} not found`);
    }
  }

  private assertNotArchived(item: exhibit): void {
    if (item.archived_at) {
      throw new BadRequestException('Archived exhibits cannot be changed.');
    }
  }

  // BR-20: only a Cataloged, public-display-approved specimen may back a
  // public exhibit. Checked on create() and again on publish().
  private assertSpecimenEligible(
    specimenRecord: specimen | null,
    specimenId: string,
  ): asserts specimenRecord is specimen {
    if (!specimenRecord) {
      throw new NotFoundException(`Specimen ${specimenId} not found`);
    }
    if (specimenRecord.status === 'ARCHIVED' || specimenRecord.archived_at) {
      throw new BadRequestException(
        'An archived specimen cannot be used for a public exhibit.',
      );
    }
    if (
      specimenRecord.status !== 'CATALOGED' ||
      !specimenRecord.public_display_allowed
    ) {
      throw new BadRequestException(
        'Only Cataloged specimens approved for public display can have an exhibit.',
      );
    }
  }

  private async assertSlugAvailable(
    client: Pick<Prisma.TransactionClient, 'exhibit'>,
    slug: string,
    ignoreExhibitId?: string,
  ): Promise<void> {
    const existing = await client.exhibit.findUnique({
      where: { public_slug: slug },
      select: { id: true },
    });
    if (existing && existing.id !== ignoreExhibitId) {
      throw new ConflictException(`Exhibit slug "${slug}" is already in use.`);
    }
  }

  private isUniqueSlugViolation(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }

  private async recordAudit(
    client: Pick<Prisma.TransactionClient, 'audit_log'>,
    params: {
      userId: string;
      exhibitId: string;
      action: string;
      details?: Prisma.InputJsonValue;
    },
  ): Promise<void> {
    await client.audit_log.create({
      data: {
        user_id: params.userId,
        affected_record_id: params.exhibitId,
        affected_record_type: 'exhibit',
        action: params.action,
        module: 'exhibits',
        details: params.details ?? Prisma.JsonNull,
        status: 'SUCCESS',
      },
    });
  }

  private toEntity(item: exhibit, media?: exhibit_media[]): Exhibit {
    return {
      id: item.id,
      specimenId: item.specimen_id,
      createdBy: item.created_by,
      publicSlug: item.public_slug,
      interestingFacts: item.interesting_facts,
      publicDescription: item.public_description,
      distribution: item.distribution,
      diet: item.diet,
      layoutType: item.layout_type,
      status: item.status as ExhibitStatus,
      publishedAt: item.published_at,
      archivedAt: item.archived_at,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
      media: media?.map((entry) => this.toMediaEntity(entry)),
    };
  }

  // NFR-SEC-08 / BR-10: the public QR page must never expose curator
  // attribution or any other internal-only field.
  private toPublicEntity(
    item: exhibit,
    media: exhibit_media[],
  ): Omit<Exhibit, 'createdBy'> {
    return {
      id: item.id,
      specimenId: item.specimen_id,
      publicSlug: item.public_slug,
      interestingFacts: item.interesting_facts,
      publicDescription: item.public_description,
      distribution: item.distribution,
      diet: item.diet,
      layoutType: item.layout_type,
      status: item.status as ExhibitStatus,
      publishedAt: item.published_at,
      archivedAt: item.archived_at,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
      media: media.map((entry) => this.toMediaEntity(entry)),
    };
  }

  private toMediaEntity(item: exhibit_media): ExhibitMedia {
    return {
      id: item.id,
      exhibitId: item.exhibit_id,
      mediaUrl: item.storage_path,
      displayOrder: item.display_order,
      caption: item.caption,
      isCover: item.is_cover,
    };
  }
}
