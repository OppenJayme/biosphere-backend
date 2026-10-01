import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  Prisma,
  type exhibit_media,
  type specimen,
} from '../generated/prisma/client';
import { AR_ASSET_STORAGE_BUCKET } from '../developer/developer.constants';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../supabase/storage.service';
import { AddExhibitMediaDto } from './dto/add-exhibit-media.dto';
import { CreateExhibitDto } from './dto/create-exhibit.dto';
import { ExhibitQrQueryDto } from './dto/exhibit-qr-query.dto';
import { ListExhibitsQueryDto } from './dto/list-exhibits-query.dto';
import { ReplaceExhibitUrlDto } from './dto/replace-exhibit-url.dto';
import { SetExhibitArDto } from './dto/set-exhibit-ar.dto';
import { UpdateExhibitMediaDto } from './dto/update-exhibit-media.dto';
import { UpdateExhibitDto } from './dto/update-exhibit.dto';
import {
  Exhibit,
  ExhibitStatus,
  PublicArModel,
  PublicExhibitResponse,
} from './entities/exhibit.entity';
import {
  ExhibitMedia,
  PublicExhibitMedia,
} from './entities/exhibit-media.entity';
import {
  PUBLIC_SPECIMEN_FIELDS,
  PublicSpecimenField,
  TAXONOMY_RANK_FIELDS,
  assertRequiredContent,
  missingRequiredContent,
  normalizePublicSpecimenFields,
  storedPublicSpecimenFields,
} from './exhibit-public-fields';
import { ExhibitQrService } from './exhibit-qr.service';

const EXHIBIT_MEDIA_BUCKET = 'exhibit-media' as const;

const PUBLIC_MEDIA_URL_LIFETIME_SECONDS = 300;
const CURATOR_PREVIEW_URL_LIFETIME_SECONDS = 300;
// AR models are large; give the visitor time to download and open them.
const PUBLIC_AR_URL_LIFETIME_SECONDS = 900;
const DEFAULT_QR_SIZE = 1024;

// What curator views need besides the exhibit row itself.
const CURATOR_INCLUDE = {
  specimen: {
    select: {
      common_name: true,
      scientific_name: true,
      accession_number: true,
    },
  },
  ar_asset: { select: { id: true, is_enabled: true } },
} satisfies Prisma.exhibitInclude;

type ExhibitRecord = Prisma.exhibitGetPayload<{
  include: typeof CURATOR_INCLUDE;
}>;

// Everything the public page may show. Restricted specimen fields (remarks,
// accession number, storage, condition) are never selected (REQ-4.12-08).
const PUBLIC_INCLUDE = {
  specimen: {
    select: {
      id: true,
      status: true,
      archived_at: true,
      public_display_allowed: true,
      common_name: true,
      scientific_name: true,
      collection: { select: { collection_name: true } },
      specimen_taxonomy: {
        select: {
          kingdom: true,
          phylum: true,
          class: true,
          order_name: true,
          family: true,
          genus: true,
          species: true,
          habitat: true,
          ecological_role: true,
          conservation_status: true,
        },
      },
    },
  },
  ar_asset: {
    where: { is_enabled: true },
    select: { storage_path: true, model_format: true },
    orderBy: { id: 'asc' },
  },
  exhibit_media: { orderBy: { display_order: 'asc' } },
} satisfies Prisma.exhibitInclude;

type PublicExhibitRecord = Prisma.exhibitGetPayload<{
  include: typeof PUBLIC_INCLUDE;
}>;

type SpecimenEligibility = Pick<
  specimen,
  'status' | 'archived_at' | 'public_display_allowed'
>;

export interface ExhibitQrImage {
  contentType: 'image/png' | 'image/svg+xml';
  body: Buffer | string;
  fileName: string;
}

@Injectable()
export class ExhibitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly qr: ExhibitQrService,
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

      let created: ExhibitRecord;
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
            public_specimen_fields: normalizePublicSpecimenFields(
              dto.publicSpecimenFields ?? PUBLIC_SPECIMEN_FIELDS,
            ),
            status: 'UNPUBLISHED',
          },
          include: CURATOR_INCLUDE,
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
        details: {
          specimenId: dto.specimenId,
          publicSlug: dto.publicSlug,
          publicSpecimenFields: created.public_specimen_fields,
        },
      });

      return this.toEntity(created);
    });
  }

  async findAll(query: ListExhibitsQueryDto = {}): Promise<Exhibit[]> {
    const search = query.search
      ? { contains: query.search, mode: Prisma.QueryMode.insensitive }
      : undefined;
    const exhibits = await this.prisma.exhibit.findMany({
      where: {
        archived_at: null,
        status: query.status,
        // AR is on when at least one uploaded asset is enabled.
        ...(query.arEnabled !== undefined && {
          ar_asset: query.arEnabled
            ? { some: { is_enabled: true } }
            : { none: { is_enabled: true } },
        }),
        ...(search && {
          OR: [
            { public_slug: search },
            { specimen: { common_name: search } },
            { specimen: { scientific_name: search } },
            { specimen: { accession_number: search } },
          ],
        }),
      },
      include: CURATOR_INCLUDE,
      orderBy: { created_at: 'desc' },
    });

    return exhibits.map((item) => this.toEntity(item));
  }

  async findOne(id: string): Promise<Exhibit> {
    const item = await this.prisma.exhibit.findUnique({
      where: { id },
      include: {
        ...CURATOR_INCLUDE,
        exhibit_media: { orderBy: { display_order: 'asc' } },
      },
    });
    if (!item) {
      throw new NotFoundException(`Exhibit ${id} not found`);
    }

    return this.toEntity(
      item,
      await Promise.all(
        item.exhibit_media.map((entry) => this.toCuratorMedia(entry)),
      ),
    );
  }

  // Content edits keep the public URL (REQ-4.12-10); see replaceUrl().
  async update(
    id: string,
    dto: UpdateExhibitDto,
    actingCuratorAccountId: string,
  ): Promise<Exhibit> {
    return this.prisma.$transaction(async (transaction) => {
      const existing = await this.findOneOrThrow(transaction, id);
      this.assertNotArchived(existing);

      const data: Prisma.exhibitUncheckedUpdateInput = {};
      if (dto.interestingFacts !== undefined) {
        data.interesting_facts = dto.interestingFacts;
      }
      if (dto.publicDescription !== undefined) {
        data.public_description = dto.publicDescription;
      }
      if (dto.distribution !== undefined) data.distribution = dto.distribution;
      if (dto.diet !== undefined) data.diet = dto.diet;
      if (dto.layoutType !== undefined) data.layout_type = dto.layoutType;

      const previousFields = storedPublicSpecimenFields(
        existing.public_specimen_fields,
      );
      let nextFields = previousFields;
      if (dto.publicSpecimenFields !== undefined) {
        nextFields = normalizePublicSpecimenFields(dto.publicSpecimenFields);
        data.public_specimen_fields = nextFields;
      }

      if (Object.keys(data).length === 0) {
        throw new BadRequestException('At least one field must be updated.');
      }
      // A published page must keep its required content.
      if (existing.status === 'PUBLISHED') {
        assertRequiredContent(
          {
            public_description:
              dto.publicDescription !== undefined
                ? dto.publicDescription
                : existing.public_description,
            interesting_facts:
              dto.interestingFacts !== undefined
                ? dto.interestingFacts
                : existing.interesting_facts,
            distribution:
              dto.distribution !== undefined
                ? dto.distribution
                : existing.distribution,
            diet: dto.diet !== undefined ? dto.diet : existing.diet,
          },
          'A published exhibit must keep its description, interesting facts, distribution, and diet.',
        );
      }
      data.updated_at = new Date();

      const updated = await transaction.exhibit.update({
        where: { id },
        data,
        include: CURATOR_INCLUDE,
      });

      // Field visibility changes are recorded with both selections
      // (REQ-4.12-11); content text itself is not copied into the audit log.
      const visibilityChanged =
        nextFields.join(',') !== previousFields.join(',');
      await this.recordAudit(transaction, {
        userId: actingCuratorAccountId,
        exhibitId: id,
        action: 'UPDATE_EXHIBIT',
        details: {
          changedFields: Object.keys(dto).filter(
            (key) => dto[key as keyof UpdateExhibitDto] !== undefined,
          ),
          ...(visibilityChanged && {
            publicSpecimenFields: {
              previous: previousFields,
              current: nextFields,
            },
          }),
        },
      });

      return this.toEntity(updated);
    });
  }

  // Intentional page replacement (REQ-4.12-10): gives the exhibit a new
  // public URL. QR codes printed for the old URL stop resolving and show the
  // unavailable state, so this is audited with both slugs (REQ-4.12-11).
  async replaceUrl(
    id: string,
    dto: ReplaceExhibitUrlDto,
    actingCuratorAccountId: string,
  ): Promise<Exhibit> {
    return this.prisma.$transaction(async (transaction) => {
      const existing = await this.findOneOrThrow(transaction, id);
      this.assertNotArchived(existing);
      if (existing.public_slug === dto.publicSlug) {
        throw new BadRequestException(
          'The exhibit already uses this URL. Choose a different slug to replace it.',
        );
      }
      await this.assertSlugAvailable(transaction, dto.publicSlug, id);

      let updated: ExhibitRecord;
      try {
        updated = await transaction.exhibit.update({
          where: { id },
          data: { public_slug: dto.publicSlug, updated_at: new Date() },
          include: CURATOR_INCLUDE,
        });
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
        action: 'REPLACE_EXHIBIT_URL',
        details: {
          previousSlug: existing.public_slug,
          publicSlug: dto.publicSlug,
        },
      });

      return this.toEntity(updated);
    });
  }

  // ===========================================================
  // Lifecycle — SRS B.3: Unpublished -> Published -> Unpublished or
  // Disabled. Disabled is terminal apart from archive; archive is final.
  // Every change is audited (REQ-4.12-11).
  // ===========================================================

  async publish(id: string, actingCuratorAccountId: string): Promise<Exhibit> {
    return this.prisma.$transaction(async (transaction) => {
      const existing = await this.findOneOrThrow(transaction, id);
      this.assertNotArchived(existing);

      if (existing.status === 'PUBLISHED') {
        return this.toEntity(existing);
      }
      // SRS B.3 has no Disabled -> Published transition.
      if (existing.status === 'DISABLED') {
        throw new BadRequestException(
          'A disabled exhibit cannot be published again.',
        );
      }

      // Re-check eligibility at publish time, not just at creation time —
      // the specimen may have been unmarked for public display since.
      const specimenRecord = await transaction.specimen.findUnique({
        where: { id: existing.specimen_id },
      });
      this.assertSpecimenEligible(specimenRecord, existing.specimen_id);
      assertRequiredContent(
        existing,
        'Add the description, interesting facts, distribution, and diet before publishing.',
      );

      const publishedAt = new Date();
      const updated = await transaction.exhibit.update({
        where: { id },
        data: {
          status: 'PUBLISHED',
          published_at: publishedAt,
          updated_at: publishedAt,
        },
        include: CURATOR_INCLUDE,
      });

      await this.recordAudit(transaction, {
        userId: actingCuratorAccountId,
        exhibitId: id,
        action: 'PUBLISH_EXHIBIT',
        details: { previousStatus: existing.status },
      });

      return this.toEntity(updated);
    });
  }

  // Takes a published page offline without disabling it (REQ-4.12-01/09).
  async unpublish(
    id: string,
    actingCuratorAccountId: string,
  ): Promise<Exhibit> {
    return this.prisma.$transaction(async (transaction) => {
      const existing = await this.findOneOrThrow(transaction, id);
      this.assertNotArchived(existing);

      if (existing.status === 'UNPUBLISHED') {
        return this.toEntity(existing);
      }
      if (existing.status !== 'PUBLISHED') {
        throw new BadRequestException(
          'Only a published exhibit can be unpublished.',
        );
      }

      const updated = await transaction.exhibit.update({
        where: { id },
        data: { status: 'UNPUBLISHED', updated_at: new Date() },
        include: CURATOR_INCLUDE,
      });

      await this.recordAudit(transaction, {
        userId: actingCuratorAccountId,
        exhibitId: id,
        action: 'UNPUBLISH_EXHIBIT',
        details: { previousStatus: existing.status },
      });

      return this.toEntity(updated);
    });
  }

  // SRS B.3: only a published page is disabled. An unpublished draft is
  // already offline; retire it with archive instead.
  async disable(id: string, actingCuratorAccountId: string): Promise<Exhibit> {
    return this.prisma.$transaction(async (transaction) => {
      const existing = await this.findOneOrThrow(transaction, id);
      this.assertNotArchived(existing);

      if (existing.status === 'DISABLED') {
        return this.toEntity(existing);
      }
      if (existing.status !== 'PUBLISHED') {
        throw new BadRequestException(
          'Only a published exhibit can be disabled.',
        );
      }

      const updated = await transaction.exhibit.update({
        where: { id },
        data: { status: 'DISABLED', updated_at: new Date() },
        include: CURATOR_INCLUDE,
      });

      await this.recordAudit(transaction, {
        userId: actingCuratorAccountId,
        exhibitId: id,
        action: 'DISABLE_EXHIBIT',
        details: { previousStatus: existing.status },
      });

      return this.toEntity(updated);
    });
  }

  async archive(id: string, actingCuratorAccountId: string): Promise<Exhibit> {
    return this.prisma.$transaction(async (transaction) => {
      const existing = await this.findOneOrThrow(transaction, id);

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
        include: CURATOR_INCLUDE,
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
  // AR on/off — REQ-4.13-02/04/06
  // ===========================================================

  // Developers upload an exhibit's AR assets (/developer, REQ-4.13-03); the
  // curator decides whether they are shown by enabling or disabling them
  // here, using ar_asset.is_enabled. The public page offers View in AR only
  // while at least one asset is enabled. Disabling keeps the files, so AR can
  // be turned back on without a new upload.
  async setAr(
    id: string,
    dto: SetExhibitArDto,
    actingCuratorAccountId: string,
  ): Promise<Exhibit> {
    return this.prisma.$transaction(async (transaction) => {
      const existing = await this.findOneOrThrow(transaction, id);
      this.assertNotArchived(existing);

      if (dto.enabled && existing.ar_asset.length === 0) {
        throw new BadRequestException(
          'No AR asset has been uploaded for this exhibit yet. A developer must upload one first.',
        );
      }
      const changing = existing.ar_asset.filter(
        (asset) => asset.is_enabled !== dto.enabled,
      );
      if (changing.length === 0) {
        return this.toEntity(existing);
      }

      await transaction.ar_asset.updateMany({
        where: { exhibit_id: id, is_enabled: !dto.enabled },
        data: { is_enabled: dto.enabled },
      });
      const updated = await this.findOneOrThrow(transaction, id);

      await this.recordAudit(transaction, {
        userId: actingCuratorAccountId,
        exhibitId: id,
        action: dto.enabled ? 'ENABLE_EXHIBIT_AR' : 'DISABLE_EXHIBIT_AR',
        details: { assetIds: changing.map((asset) => asset.id) },
      });

      return this.toEntity(updated);
    });
  }

  // ===========================================================
  // QR code and printable label — REQ-4.12-05/06
  // ===========================================================

  // Regenerated on demand from the public URL, so a lost or damaged label
  // can be reprinted at any time and still matches earlier prints.
  async getQrCode(
    id: string,
    query: ExhibitQrQueryDto,
  ): Promise<ExhibitQrImage> {
    const item = await this.findOneOrThrow(this.prisma, id);
    this.assertNotArchived(item);
    const url = this.requirePublicUrl(item.public_slug);

    if (query.format === 'svg') {
      return {
        contentType: 'image/svg+xml',
        body: await this.qr.qrSvg(url),
        fileName: `${item.public_slug}-qr.svg`,
      };
    }
    return {
      contentType: 'image/png',
      body: await this.qr.qrPng(url, query.size ?? DEFAULT_QR_SIZE),
      fileName: `${item.public_slug}-qr.png`,
    };
  }

  async getLabel(id: string): Promise<ExhibitQrImage> {
    const item = await this.findOneOrThrow(this.prisma, id);
    this.assertNotArchived(item);

    return {
      contentType: 'image/svg+xml',
      body: await this.qr.label({
        publicUrl: this.requirePublicUrl(item.public_slug),
        commonName: item.specimen.common_name,
        scientificName: item.specimen.scientific_name,
      }),
      fileName: `${item.public_slug}-label.svg`,
    };
  }

  // Refuses to produce a QR code or label without a real visitor-facing
  // address, since printed codes cannot be corrected later.
  private requirePublicUrl(slug: string): string {
    const url = this.qr.publicUrl(slug);
    if (!url) {
      throw new ServiceUnavailableException(
        'PUBLIC_SITE_URL is not configured, so QR codes and labels cannot be generated.',
      );
    }
    return url;
  }

  // ===========================================================
  // Public QR exhibit page — REQ-4.12-04/07/08/09/12, REQ-4.13-04/07
  // ===========================================================

  async findPublishedBySlug(slug: string): Promise<PublicExhibitResponse> {
    const item = await this.prisma.exhibit.findUnique({
      where: { public_slug: slug },
      include: PUBLIC_INCLUDE,
    });

    // One safe message for missing, unpublished, disabled, archived, and
    // no-longer-eligible pages, so nothing about them is revealed.
    if (
      !item ||
      item.status !== 'PUBLISHED' ||
      item.archived_at ||
      !this.isSpecimenEligible(item.specimen)
    ) {
      throw new NotFoundException(`No published exhibit found for "${slug}".`);
    }

    return this.toPublicEntity(item);
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

    const exhibitRecord = await this.findOneOrThrow(this.prisma, exhibitId);
    this.assertNotArchived(exhibitRecord);

    const storagePath = await this.storageService.upload(
      EXHIBIT_MEDIA_BUCKET,
      exhibitId,
      file.buffer,
      file.mimetype,
    );

    let media: exhibit_media;
    try {
      media = await this.prisma.$transaction(async (transaction) => {
        if (dto.isCover) {
          await transaction.exhibit_media.updateMany({
            where: { exhibit_id: exhibitId, is_cover: true },
            data: { is_cover: false },
          });
        }

        const created = await transaction.exhibit_media.create({
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
          details: { mediaId: created.id },
        });

        return created;
      });
    } catch (error) {
      // Best-effort cleanup so a failed DB write doesn't leak an orphaned
      // file (same pattern as DeveloperService#createArAsset).
      await this.safeRemoveMediaFile(EXHIBIT_MEDIA_BUCKET, storagePath);
      throw error;
    }

    return this.toCuratorMedia(media);
  }

  // Caption, order, and cover edits for an existing image (REQ-4.12-03).
  async updateMedia(
    exhibitId: string,
    mediaId: string,
    dto: UpdateExhibitMediaDto,
    actingCuratorAccountId: string,
  ): Promise<ExhibitMedia> {
    const data: Prisma.exhibit_mediaUpdateInput = {};
    if (dto.caption !== undefined) data.caption = dto.caption;
    if (dto.displayOrder !== undefined) data.display_order = dto.displayOrder;
    if (dto.isCover !== undefined) data.is_cover = dto.isCover;
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('At least one field must be updated.');
    }

    const updated = await this.prisma.$transaction(async (transaction) => {
      const exhibitRecord = await this.findOneOrThrow(transaction, exhibitId);
      this.assertNotArchived(exhibitRecord);
      await this.findMediaOrThrow(transaction, exhibitId, mediaId);

      if (dto.isCover) {
        await transaction.exhibit_media.updateMany({
          where: {
            exhibit_id: exhibitId,
            is_cover: true,
            id: { not: mediaId },
          },
          data: { is_cover: false },
        });
      }
      const media = await transaction.exhibit_media.update({
        where: { id: mediaId },
        data,
      });

      await this.recordAudit(transaction, {
        userId: actingCuratorAccountId,
        exhibitId,
        action: 'UPDATE_EXHIBIT_MEDIA',
        details: { mediaId },
      });
      return media;
    });

    return this.toCuratorMedia(updated);
  }

  async removeMedia(
    exhibitId: string,
    mediaId: string,
    actingCuratorAccountId: string,
  ): Promise<{ id: string; removed: true }> {
    // The row delete and its audit entry commit together; the stored file is
    // removed only after that, since storage cannot join the transaction.
    const media = await this.prisma.$transaction(async (transaction) => {
      const exhibitRecord = await this.findOneOrThrow(transaction, exhibitId);
      this.assertNotArchived(exhibitRecord);
      const existing = await this.findMediaOrThrow(
        transaction,
        exhibitId,
        mediaId,
      );

      await transaction.exhibit_media.delete({ where: { id: mediaId } });

      await this.recordAudit(transaction, {
        userId: actingCuratorAccountId,
        exhibitId,
        action: 'REMOVE_EXHIBIT_MEDIA',
        details: { mediaId },
      });
      return existing;
    });

    await this.safeRemoveMediaFile(EXHIBIT_MEDIA_BUCKET, media.storage_path);

    return { id: mediaId, removed: true };
  }

  // ===========================================================
  // Helpers
  // ===========================================================

  private async findOneOrThrow(
    client: Prisma.TransactionClient,
    id: string,
  ): Promise<ExhibitRecord> {
    const item = await client.exhibit.findUnique({
      where: { id },
      include: CURATOR_INCLUDE,
    });
    if (!item) {
      throw new NotFoundException(`Exhibit ${id} not found`);
    }
    return item;
  }

  private async findMediaOrThrow(
    client: Prisma.TransactionClient,
    exhibitId: string,
    mediaId: string,
  ): Promise<exhibit_media> {
    const media = await client.exhibit_media.findUnique({
      where: { id: mediaId },
    });
    if (!media || media.exhibit_id !== exhibitId) {
      throw new NotFoundException(
        `No exhibit media found with id "${mediaId}".`,
      );
    }
    return media;
  }

  private assertNotArchived(item: { archived_at: Date | null }): void {
    if (item.archived_at) {
      throw new BadRequestException('Archived exhibits cannot be changed.');
    }
  }

  // BR-20 / REQ-4.12-02: only a Cataloged, public-display-approved specimen
  // may back a public exhibit. Checked on create() and again on publish().
  private assertSpecimenEligible(
    specimenRecord: SpecimenEligibility | null,
    specimenId: string,
  ): asserts specimenRecord is SpecimenEligibility {
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

  private isSpecimenEligible(specimenRecord: SpecimenEligibility): boolean {
    return (
      specimenRecord.status === 'CATALOGED' &&
      !specimenRecord.archived_at &&
      specimenRecord.public_display_allowed
    );
  }

  // A slug is taken while an exhibit (including an archived one) uses it,
  // and stays reserved after replace-url retires it: printed QR codes for a
  // retired URL must show the unavailable state, never another specimen's
  // page (REQ-4.12-09/10). Only the exhibit that retired a slug may take it
  // back. Retired slugs are read from the REPLACE_EXHIBIT_URL audit entries.
  private async assertSlugAvailable(
    client: Pick<Prisma.TransactionClient, 'exhibit' | 'audit_log'>,
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

    const retired = await client.audit_log.findFirst({
      where: {
        action: 'REPLACE_EXHIBIT_URL',
        affected_record_type: 'exhibit',
        details: { path: ['previousSlug'], equals: slug },
        ...(ignoreExhibitId && {
          NOT: { affected_record_id: ignoreExhibitId },
        }),
      },
      select: { id: true },
    });
    if (retired) {
      throw new ConflictException(
        `Exhibit slug "${slug}" was used by another exhibit's printed QR codes and cannot be reused.`,
      );
    }
  }

  private isUniqueSlugViolation(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }

  private async safeRemoveMediaFile(
    bucket: typeof EXHIBIT_MEDIA_BUCKET,
    storagePath: string,
  ): Promise<void> {
    await Promise.resolve(
      this.storageService.remove(bucket, storagePath),
    ).catch(() => undefined);
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

  private toEntity(item: ExhibitRecord, media?: ExhibitMedia[]): Exhibit {
    const arAssetCount = item.ar_asset.length;
    return {
      id: item.id,
      specimenId: item.specimen_id,
      createdBy: item.created_by,
      publicSlug: item.public_slug,
      publicUrl: this.qr.publicUrl(item.public_slug),
      interestingFacts: item.interesting_facts,
      publicDescription: item.public_description,
      distribution: item.distribution,
      diet: item.diet,
      layoutType: item.layout_type,
      publicSpecimenFields: storedPublicSpecimenFields(
        item.public_specimen_fields,
      ),
      missingForPublish: missingRequiredContent(item),
      status: item.status as ExhibitStatus,
      arEnabled: item.ar_asset.some((asset) => asset.is_enabled),
      arAssetCount,
      specimen: {
        commonName: item.specimen.common_name,
        scientificName: item.specimen.scientific_name,
        accessionNumber: item.specimen.accession_number,
      },
      publishedAt: item.published_at,
      archivedAt: item.archived_at,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
      media,
    };
  }

  // NFR-SEC-08 / BR-10 / REQ-4.12-08: the public QR page never exposes
  // curator attribution or any other internal-only field.
  private async toPublicEntity(
    item: PublicExhibitRecord,
  ): Promise<PublicExhibitResponse> {
    const taxonomy = item.specimen.specimen_taxonomy;
    const [media, models] = await Promise.all([
      Promise.all(
        item.exhibit_media.map((entry) => this.toPublicMediaEntity(entry)),
      ).then((signed) =>
        signed.filter((entry): entry is PublicExhibitMedia => entry !== null),
      ),
      // PUBLIC_INCLUDE selects only enabled assets.
      Promise.all(
        item.ar_asset.map((asset) => this.toPublicArModel(asset)),
      ).then((signed) =>
        signed.filter((model): model is PublicArModel => model !== null),
      ),
    ]);

    // Only the specimen fields the curator selected are sent (REQ-4.12-03);
    // a hidden field is left out of the response, not just blanked.
    const shown = new Set(
      storedPublicSpecimenFields(item.public_specimen_fields),
    );
    const specimenValues: Record<PublicSpecimenField, string | null> = {
      commonName: item.specimen.common_name,
      scientificName: item.specimen.scientific_name,
      collection: item.specimen.collection?.collection_name ?? null,
      kingdom: taxonomy?.kingdom ?? null,
      phylum: taxonomy?.phylum ?? null,
      class: taxonomy?.class ?? null,
      order: taxonomy?.order_name ?? null,
      family: taxonomy?.family ?? null,
      genus: taxonomy?.genus ?? null,
      species: taxonomy?.species ?? null,
      habitat: taxonomy?.habitat ?? null,
      ecologicalRole: taxonomy?.ecological_role ?? null,
      conservationStatus: taxonomy?.conservation_status ?? null,
    };
    const pick = (fields: readonly PublicSpecimenField[]) =>
      Object.fromEntries(
        fields
          .filter((field) => shown.has(field))
          .map((field) => [field, specimenValues[field]]),
      );
    const taxonomyRanks = pick(TAXONOMY_RANK_FIELDS);

    return {
      publicSlug: item.public_slug,
      ...pick(
        PUBLIC_SPECIMEN_FIELDS.filter(
          (field) =>
            !(TAXONOMY_RANK_FIELDS as readonly string[]).includes(field),
        ),
      ),
      ...(Object.keys(taxonomyRanks).length > 0 && {
        taxonomy: taxonomyRanks,
      }),
      interestingFacts: item.interesting_facts,
      publicDescription: item.public_description,
      distribution: item.distribution,
      diet: item.diet,
      layoutType: item.layout_type,
      media,
      ar: { available: models.length > 0, models },
    };
  }

  // An image whose file cannot be signed (e.g. missing from storage) is left
  // out, so one broken file never takes the whole public page down.
  private async toPublicMediaEntity(
    item: exhibit_media,
  ): Promise<PublicExhibitMedia | null> {
    try {
      return {
        mediaUrl: await this.storageService.createSignedUrl(
          EXHIBIT_MEDIA_BUCKET,
          item.storage_path,
          PUBLIC_MEDIA_URL_LIFETIME_SECONDS,
        ),
        displayOrder: item.display_order,
        caption: item.caption,
        isCover: item.is_cover,
      };
    } catch {
      return null;
    }
  }

  // AR is optional (REQ-4.13-06): a model that cannot be signed, e.g. its
  // file is missing from storage, is left out instead of failing the page.
  // With no usable model left, ar.available is false and View in AR hides.
  private async toPublicArModel(asset: {
    storage_path: string;
    model_format: string;
  }): Promise<PublicArModel | null> {
    try {
      return {
        format: asset.model_format,
        url: await this.storageService.createSignedUrl(
          AR_ASSET_STORAGE_BUCKET,
          asset.storage_path,
          PUBLIC_AR_URL_LIFETIME_SECONDS,
        ),
      };
    } catch {
      return null;
    }
  }

  // Curator views get a short-lived preview URL; a signing failure only
  // loses the preview, not the whole response.
  private async toCuratorMedia(item: exhibit_media): Promise<ExhibitMedia> {
    let previewUrl: string | null = null;
    try {
      previewUrl = await this.storageService.createSignedUrl(
        EXHIBIT_MEDIA_BUCKET,
        item.storage_path,
        CURATOR_PREVIEW_URL_LIFETIME_SECONDS,
      );
    } catch {
      previewUrl = null;
    }

    return {
      id: item.id,
      exhibitId: item.exhibit_id,
      mediaUrl: item.storage_path,
      previewUrl,
      displayOrder: item.display_order,
      caption: item.caption,
      isCover: item.is_cover,
    };
  }
}
