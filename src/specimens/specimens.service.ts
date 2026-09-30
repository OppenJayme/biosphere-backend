import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import {
  Prisma,
  type specimen,
  type specimen_revision_history,
  type user_role,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { runSerializableTransaction } from '../prisma/serializable-transaction';
import type { StorageLocationSummary } from '../storage-locations/entities/storage-location-path.entity';
import { resolveStorageLocations } from '../storage-locations/storage-location-paths';
import { findStorageSubtreeIds } from '../storage-locations/storage-subtree';
import { CreateSpecimenDto } from './dto/create-specimen.dto';
import { ListSpecimenRevisionsQueryDto } from './dto/list-specimen-revisions-query.dto';
import { ReopenCatalogingDto } from './dto/reopen-cataloging.dto';
import {
  SearchSpecimensQueryDto,
  SpecimenSortField,
} from './dto/search-specimens-query.dto';
import { SetPublicDisplayDto } from './dto/set-public-display.dto';
import { UpdateSpecimenDto } from './dto/update-specimen.dto';
import {
  SpecimenRevision,
  SpecimenRevisionPage,
} from './entities/specimen-revision.entity';
import {
  Specimen,
  SpecimenGender,
  SpecimenPage,
  SpecimenSearchItem,
  SpecimenStatus,
} from './entities/specimen.entity';
import {
  assertCatalogedValueRetained,
  hasCatalogText,
} from './catalog-completion.policy';
import { SpecimenAccessionService } from './specimen-accession.service';
import { SpecimenCatalogingService } from './specimen-cataloging.service';

interface RevisionChange {
  fieldChanged: string;
  oldValue: string | boolean | null;
  newValue: string | boolean | null;
}

const SPECIMEN_REVISION_INCLUDE = {
  user_account: {
    select: {
      id: true,
      full_name: true,
      role: true,
    },
  },
} satisfies Prisma.specimen_revision_historyInclude;

type SpecimenRevisionWithActor = specimen_revision_history & {
  user_account: {
    id: string;
    full_name: string;
    role: user_role;
  };
};

const SPECIMEN_SEARCH_INCLUDE = {
  specimen_taxonomy: { select: { family: true } },
  specimen_provenance: { select: { collector: true } },
  specimen_lot: {
    where: { is_active: true },
    select: {
      quantity: true,
      condition_class: true,
      storage_unit: { select: { id: true, label: true, unit_type: true } },
    },
    orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
  },
} satisfies Prisma.specimenInclude;

type SpecimenSearchRecord = Prisma.specimenGetPayload<{
  include: typeof SPECIMEN_SEARCH_INCLUDE;
}>;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class SpecimensService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogingService: SpecimenCatalogingService,
    private readonly accession: SpecimenAccessionService,
  ) {}

  async create(
    dto: CreateSpecimenDto,
    actingCuratorAccountId: string,
  ): Promise<Specimen> {
    return this.prisma.$transaction((transaction) =>
      this.createUncatalogedRecord(
        transaction,
        dto,
        actingCuratorAccountId,
        'CREATE_SPECIMEN',
      ),
    );
  }

  createOfflineDraft(
    transaction: Prisma.TransactionClient,
    dto: CreateSpecimenDto,
    actingCuratorAccountId: string,
    clientDraftId: string,
  ): Promise<Specimen> {
    return this.createUncatalogedRecord(
      transaction,
      dto,
      actingCuratorAccountId,
      'SYNC_OFFLINE_SPECIMEN_DRAFT',
      { clientDraftId },
    );
  }

  /**
   * Shared by manual create, offline-draft sync, and bulk import
   * (REQ-4.4-18/19) so every entry path assigns the same Uncataloged record
   * shape and audit trail. Callers own the transaction boundary.
   */
  createUncatalogedRecordFor(
    transaction: Prisma.TransactionClient,
    dto: CreateSpecimenDto,
    actingCuratorAccountId: string,
    auditAction: string,
    extraAuditDetails: Prisma.InputJsonObject = {},
  ): Promise<Specimen> {
    return this.createUncatalogedRecord(
      transaction,
      dto,
      actingCuratorAccountId,
      auditAction,
      extraAuditDetails,
    );
  }

  async findOneInTransaction(
    transaction: Prisma.TransactionClient,
    id: string,
  ): Promise<Specimen> {
    const item = await transaction.specimen.findUnique({ where: { id } });
    this.assertExists(item, id);
    return this.toEntity(item);
  }

  async findAll(): Promise<Specimen[]> {
    const specimens = await this.prisma.specimen.findMany({
      where: { status: { not: 'ARCHIVED' } },
      orderBy: { created_at: 'desc' },
    });

    return specimens.map((item) => this.toEntity(item));
  }

  async findOne(id: string): Promise<Specimen> {
    return this.toEntity(await this.findOneOrThrow(id));
  }

  async search(query: SearchSpecimensQueryDto): Promise<SpecimenPage> {
    const where = await this.buildSearchWhere(query);
    const skip = (query.page - 1) * query.limit;
    const orderBy = this.buildSearchOrderBy(query);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.specimen.findMany({
        where,
        include: SPECIMEN_SEARCH_INCLUDE,
        orderBy,
        skip,
        take: query.limit,
      }),
      this.prisma.specimen.count({ where }),
    ]);

    // One set of hierarchy lookups for every unit on the page.
    const locations = await resolveStorageLocations(
      this.prisma,
      items.flatMap((item) =>
        item.specimen_lot.map((lot) => lot.storage_unit.id),
      ),
    );

    return {
      items: items.map((item) => this.toSearchItem(item, locations)),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async findRevisionHistory(
    specimenId: string,
    query: ListSpecimenRevisionsQueryDto,
  ): Promise<SpecimenRevisionPage> {
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    if (from && to && from > to) {
      throw new BadRequestException(
        'The revision-history from timestamp must not be after the to timestamp.',
      );
    }

    const where: Prisma.specimen_revision_historyWhereInput = {
      specimen_id: specimenId,
      field_changed: query.fieldChanged
        ? {
            equals: query.fieldChanged,
            mode: Prisma.QueryMode.insensitive,
          }
        : undefined,
      source_section: query.sourceSection
        ? {
            equals: query.sourceSection,
            mode: Prisma.QueryMode.insensitive,
          }
        : undefined,
      changed_by: query.changedBy,
      changed_at:
        from || to
          ? {
              gte: from,
              lte: to,
            }
          : undefined,
    };
    const skip = (query.page - 1) * query.limit;
    const [existing, items, total] = await this.prisma.$transaction([
      this.prisma.specimen.findUnique({
        where: { id: specimenId },
        select: { id: true },
      }),
      this.prisma.specimen_revision_history.findMany({
        where,
        include: SPECIMEN_REVISION_INCLUDE,
        orderBy: [{ changed_at: 'desc' }, { id: 'desc' }],
        skip,
        take: query.limit,
      }),
      this.prisma.specimen_revision_history.count({ where }),
    ]);

    if (!existing) {
      throw new NotFoundException(`Specimen ${specimenId} not found`);
    }

    return {
      items: items.map((item) => this.toRevisionEntity(item)),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async update(
    id: string,
    dto: UpdateSpecimenDto,
    actingCuratorAccountId: string,
  ): Promise<Specimen> {
    return runSerializableTransaction(
      this.prisma,
      async (transaction) => {
        const existing = await transaction.specimen.findUnique({
          where: { id },
        });
        this.assertExists(existing, id);
        this.assertEditable(existing);

        assertCatalogedValueRetained(
          existing.status,
          dto.collectionId !== undefined,
          dto.collectionId !== null,
          'Collection',
        );
        assertCatalogedValueRetained(
          existing.status,
          dto.accessionNumber !== undefined,
          hasCatalogText(dto.accessionNumber ?? null),
          'Accession number',
        );
        assertCatalogedValueRetained(
          existing.status,
          dto.commonName !== undefined,
          hasCatalogText(dto.commonName ?? null),
          'Common name',
        );

        if (dto.collectionId) {
          await this.assertCollectionExists(transaction, dto.collectionId);
        }
        if (dto.accessionNumber !== undefined) {
          await this.accession.assertAvailable(
            transaction,
            dto.accessionNumber,
            id,
          );
        }

        const data: Prisma.specimenUncheckedUpdateInput = {};
        const changes: RevisionChange[] = [];

        if (
          dto.collectionId !== undefined &&
          dto.collectionId !== existing.collection_id
        ) {
          data.collection_id = dto.collectionId;
          changes.push({
            fieldChanged: 'collection_id',
            oldValue: existing.collection_id,
            newValue: dto.collectionId,
          });
        }

        if (
          dto.accessionNumber !== undefined &&
          dto.accessionNumber !== existing.accession_number
        ) {
          data.accession_number = dto.accessionNumber;
          changes.push({
            fieldChanged: 'accession_number',
            oldValue: existing.accession_number,
            newValue: dto.accessionNumber,
          });
        }

        if (
          dto.specimenCategory !== undefined &&
          dto.specimenCategory !== existing.specimen_category
        ) {
          data.specimen_category = dto.specimenCategory;
          changes.push({
            fieldChanged: 'specimen_category',
            oldValue: existing.specimen_category,
            newValue: dto.specimenCategory,
          });
        }

        if (
          dto.scientificName !== undefined &&
          dto.scientificName !== existing.scientific_name
        ) {
          data.scientific_name = dto.scientificName;
          changes.push({
            fieldChanged: 'scientific_name',
            oldValue: existing.scientific_name,
            newValue: dto.scientificName,
          });
        }

        if (
          dto.commonName !== undefined &&
          dto.commonName !== existing.common_name
        ) {
          data.common_name = dto.commonName;
          changes.push({
            fieldChanged: 'common_name',
            oldValue: existing.common_name,
            newValue: dto.commonName,
          });
        }

        if (dto.gender !== undefined && dto.gender !== existing.gender) {
          data.gender = dto.gender;
          changes.push({
            fieldChanged: 'gender',
            oldValue: existing.gender,
            newValue: dto.gender,
          });
        }

        if (
          dto.classificationStatus !== undefined &&
          dto.classificationStatus !== existing.classification_status
        ) {
          data.classification_status = dto.classificationStatus;
          changes.push({
            fieldChanged: 'classification_status',
            oldValue: existing.classification_status,
            newValue: dto.classificationStatus,
          });
        }

        if (dto.remarks !== undefined && dto.remarks !== existing.remarks) {
          data.remarks = dto.remarks;
          changes.push({
            fieldChanged: 'remarks',
            oldValue: existing.remarks,
            newValue: dto.remarks,
          });
        }

        if (changes.length === 0) {
          throw new BadRequestException(
            'At least one specimen core field must change.',
          );
        }

        let updated: specimen;
        try {
          updated = await transaction.specimen.update({
            where: { id },
            data: {
              ...data,
              updated_by: actingCuratorAccountId,
              updated_at: new Date(),
            },
          });
        } catch (error) {
          throw this.toAccessionConflict(error, dto.accessionNumber);
        }

        await this.recordRevisions(
          transaction,
          id,
          actingCuratorAccountId,
          changes,
        );
        await this.recordAudit(transaction, {
          userId: actingCuratorAccountId,
          specimenId: id,
          action: 'UPDATE_SPECIMEN',
          details: { fields: changes.map((change) => change.fieldChanged) },
        });

        return this.toEntity(updated);
      },
      'Specimen changed during the operation. Reload and try again.',
    );
  }

  /** Promotes only a server-validated record; clients cannot set status. */
  async completeCataloging(
    id: string,
    actingCuratorAccountId: string,
  ): Promise<Specimen> {
    return runSerializableTransaction(
      this.prisma,
      async (transaction) => {
        const existing = await transaction.specimen.findUnique({
          where: { id },
        });
        this.assertExists(existing, id);

        if (
          this.catalogingService.isArchived(
            existing.status,
            existing.archived_at,
          )
        ) {
          throw new BadRequestException(
            'Archived specimens cannot complete cataloging.',
          );
        }
        if (existing.status === 'CATALOGED') {
          return this.toEntity(existing);
        }

        const readiness = await this.catalogingService.getReadinessWith(
          transaction,
          id,
        );
        if (!readiness.canComplete) {
          throw new BadRequestException({
            message:
              'This specimen cannot be Cataloged until every required item is complete.',
            missingRequirements: readiness.missingRequirements,
          });
        }

        const changedAt = new Date();
        const updated = await transaction.specimen.update({
          where: { id },
          data: {
            status: 'CATALOGED',
            updated_by: actingCuratorAccountId,
            updated_at: changedAt,
          },
        });

        await this.recordRevisions(transaction, id, actingCuratorAccountId, [
          {
            fieldChanged: 'status',
            oldValue: existing.status,
            newValue: 'CATALOGED',
          },
        ]);
        await this.recordAudit(transaction, {
          userId: actingCuratorAccountId,
          specimenId: id,
          action: 'COMPLETE_SPECIMEN_CATALOGING',
          details: { previousStatus: existing.status },
        });

        return this.toEntity(updated);
      },
      'Specimen changed during the operation. Reload and try again.',
    );
  }

  /** Explicitly reopens a Cataloged record before required data is removed. */
  async reopenCataloging(
    id: string,
    dto: ReopenCatalogingDto,
    actingCuratorAccountId: string,
  ): Promise<Specimen> {
    return runSerializableTransaction(
      this.prisma,
      async (transaction) => {
        const existing = await transaction.specimen.findUnique({
          where: { id },
        });
        this.assertExists(existing, id);

        if (
          this.catalogingService.isArchived(
            existing.status,
            existing.archived_at,
          )
        ) {
          throw new BadRequestException(
            'Archived specimens cannot be reopened for cataloging.',
          );
        }
        if (existing.status === 'UNCATALOGED') {
          return this.toEntity(existing);
        }

        const changedAt = new Date();
        const updated = await transaction.specimen.update({
          where: { id },
          data: {
            status: 'UNCATALOGED',
            public_display_allowed: false,
            updated_by: actingCuratorAccountId,
            updated_at: changedAt,
          },
        });
        const changes: RevisionChange[] = [
          {
            fieldChanged: 'status',
            oldValue: existing.status,
            newValue: 'UNCATALOGED',
          },
        ];
        if (existing.public_display_allowed) {
          changes.push({
            fieldChanged: 'public_display_allowed',
            oldValue: true,
            newValue: false,
          });
        }

        await this.recordRevisions(
          transaction,
          id,
          actingCuratorAccountId,
          changes,
          dto.reason,
        );
        await this.recordAudit(transaction, {
          userId: actingCuratorAccountId,
          specimenId: id,
          action: 'REOPEN_SPECIMEN_CATALOGING',
          details: { reason: dto.reason, previousStatus: existing.status },
        });

        return this.toEntity(updated);
      },
      'Specimen changed during the operation. Reload and try again.',
    );
  }

  async archive(id: string, actingCuratorAccountId: string): Promise<Specimen> {
    return this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.specimen.findUnique({
        where: { id },
      });
      this.assertExists(existing, id);

      if (existing.status === 'ARCHIVED' || existing.archived_at) {
        return this.toEntity(existing);
      }

      const activeLots = await transaction.specimen_lot.count({
        where: { specimen_id: id, is_active: true },
      });
      if (activeLots > 0) {
        throw new BadRequestException(
          "Deactivate or resolve this specimen's active lots before archiving.",
        );
      }

      const archivedAt = new Date();
      const archived = await transaction.specimen.update({
        where: { id },
        data: {
          status: 'ARCHIVED',
          public_display_allowed: false,
          archived_by: actingCuratorAccountId,
          archived_at: archivedAt,
          updated_by: actingCuratorAccountId,
          updated_at: archivedAt,
        },
      });

      const changes: RevisionChange[] = [
        {
          fieldChanged: 'status',
          oldValue: existing.status,
          newValue: 'ARCHIVED',
        },
      ];
      if (existing.public_display_allowed) {
        changes.push({
          fieldChanged: 'public_display_allowed',
          oldValue: true,
          newValue: false,
        });
      }

      await this.recordRevisions(
        transaction,
        id,
        actingCuratorAccountId,
        changes,
      );
      await this.recordAudit(transaction, {
        userId: actingCuratorAccountId,
        specimenId: id,
        action: 'ARCHIVE_SPECIMEN',
        details: { previousStatus: existing.status },
      });

      return this.toEntity(archived);
    });
  }

  async setPublicDisplay(
    id: string,
    dto: SetPublicDisplayDto,
    actingCuratorAccountId: string,
  ): Promise<Specimen> {
    return runSerializableTransaction(
      this.prisma,
      async (transaction) => {
        const existing = await transaction.specimen.findUnique({
          where: { id },
        });
        this.assertExists(existing, id);
        this.assertEditable(existing);

        if (dto.publicDisplay && existing.status !== 'CATALOGED') {
          throw new BadRequestException(
            'Only Cataloged specimens can be eligible for public display.',
          );
        }

        if (dto.publicDisplay === existing.public_display_allowed) {
          return this.toEntity(existing);
        }

        const updated = await transaction.specimen.update({
          where: { id },
          data: {
            public_display_allowed: dto.publicDisplay,
            updated_by: actingCuratorAccountId,
            updated_at: new Date(),
          },
        });

        const changes: RevisionChange[] = [
          {
            fieldChanged: 'public_display_allowed',
            oldValue: existing.public_display_allowed,
            newValue: dto.publicDisplay,
          },
        ];
        await this.recordRevisions(
          transaction,
          id,
          actingCuratorAccountId,
          changes,
        );
        await this.recordAudit(transaction, {
          userId: actingCuratorAccountId,
          specimenId: id,
          action: 'SET_SPECIMEN_PUBLIC_DISPLAY',
          details: { publicDisplay: dto.publicDisplay },
        });

        return this.toEntity(updated);
      },
      'Specimen changed during the operation. Reload and try again.',
    );
  }

  private async findOneOrThrow(id: string): Promise<specimen> {
    const item = await this.prisma.specimen.findUnique({ where: { id } });
    this.assertExists(item, id);
    return item;
  }

  private async buildSearchWhere(
    query: SearchSpecimensQueryDto,
  ): Promise<Prisma.specimenWhereInput> {
    const insensitive = (value: string | undefined) =>
      value === undefined
        ? undefined
        : { equals: value, mode: Prisma.QueryMode.insensitive };
    const createdAt = this.buildCreatedAtFilter(query);
    const where: Prisma.specimenWhereInput = {
      status: query.status ?? { not: 'ARCHIVED' },
      collection_id: query.collectionId,
      specimen_category: query.specimenCategory
        ? {
            equals: query.specimenCategory,
            mode: Prisma.QueryMode.insensitive,
          }
        : undefined,
      gender: query.gender,
      public_display_allowed: query.publicDisplay,
      classification_status: insensitive(query.classificationStatus),
      created_at: createdAt,
    };

    const taxonomy: Prisma.specimen_taxonomyWhereInput = {
      kingdom: insensitive(query.kingdom),
      phylum: insensitive(query.phylum),
      class: insensitive(query.taxonClass),
      order_name: insensitive(query.taxonOrder),
      family: insensitive(query.family),
      genus: insensitive(query.genus),
      species: insensitive(query.species),
    };
    if (Object.values(taxonomy).some((filter) => filter !== undefined)) {
      where.specimen_taxonomy = { is: taxonomy };
    }

    if (query.tag) {
      where.specimen_tag = {
        some: { tag: { tag_name: insensitive(query.tag) } },
      };
    }

    // Condition and location describe the same physical lot, so both must
    // match one active lot rather than any two different lots.
    if (query.conditionClass || query.storageUnitId) {
      const storageUnitIds = query.storageUnitId
        ? query.includeDescendantUnits
          ? await findStorageSubtreeIds(this.prisma, query.storageUnitId)
          : [query.storageUnitId]
        : undefined;
      where.specimen_lot = {
        some: {
          is_active: true,
          condition_class: insensitive(query.conditionClass),
          storage_unit_id: storageUnitIds ? { in: storageUnitIds } : undefined,
        },
      };
    }

    if (query.search) {
      const contains = {
        contains: query.search,
        mode: Prisma.QueryMode.insensitive,
      } as const;
      where.OR = [
        { accession_number: contains },
        { specimen_category: contains },
        { scientific_name: contains },
        { common_name: contains },
        { classification_status: contains },
        { remarks: contains },
        { collection: { is: { collection_name: contains } } },
        {
          specimen_taxonomy: {
            is: {
              OR: [
                { kingdom: contains },
                { phylum: contains },
                { class: contains },
                { order_name: contains },
                { family: contains },
                { genus: contains },
                { species: contains },
              ],
            },
          },
        },
        { specimen_provenance: { is: { collector: contains } } },
        { specimen_tag: { some: { tag: { tag_name: contains } } } },
      ];
      if (isUUID(query.search)) where.OR.push({ id: query.search });
    }

    return where;
  }

  private buildCreatedAtFilter(
    query: SearchSpecimensQueryDto,
  ): Prisma.DateTimeFilter<'specimen'> | undefined {
    if (!query.createdFrom && !query.createdTo) {
      return undefined;
    }

    const from = query.createdFrom ? new Date(query.createdFrom) : undefined;
    // A plain date means "through the end of that day".
    const to = query.createdTo ? new Date(query.createdTo) : undefined;
    const toIsDateOnly =
      query.createdTo !== undefined && DATE_ONLY.test(query.createdTo);
    if (from && to && from > to) {
      throw new BadRequestException('createdFrom must not be after createdTo.');
    }

    return {
      gte: from,
      lte: to && !toIsDateOnly ? to : undefined,
      lt: to && toIsDateOnly ? new Date(to.getTime() + DAY_MS) : undefined,
    };
  }

  private buildSearchOrderBy(
    query: SearchSpecimensQueryDto,
  ): Prisma.specimenOrderByWithRelationInput[] {
    if (query.sortBy === SpecimenSortField.FAMILY) {
      return [
        {
          specimen_taxonomy: {
            family: { sort: query.sortDirection, nulls: 'last' },
          },
        },
        { id: 'asc' },
      ];
    }

    const fields: Record<
      Exclude<SpecimenSortField, SpecimenSortField.FAMILY>,
      keyof Prisma.specimenOrderByWithRelationInput
    > = {
      [SpecimenSortField.UPDATED_AT]: 'updated_at',
      [SpecimenSortField.CREATED_AT]: 'created_at',
      [SpecimenSortField.ACCESSION_NUMBER]: 'accession_number',
      [SpecimenSortField.SCIENTIFIC_NAME]: 'scientific_name',
      [SpecimenSortField.COMMON_NAME]: 'common_name',
      [SpecimenSortField.STATUS]: 'status',
      [SpecimenSortField.SPECIMEN_CATEGORY]: 'specimen_category',
    };

    const field = fields[query.sortBy];
    const nullableSortFields = new Set<
      keyof Prisma.specimenOrderByWithRelationInput
    >([
      'accession_number',
      'scientific_name',
      'common_name',
      'specimen_category',
    ]);
    const primarySort = nullableSortFields.has(field)
      ? { sort: query.sortDirection, nulls: 'last' as const }
      : query.sortDirection;

    return [{ [field]: primarySort }, { id: 'asc' }];
  }

  private async createUncatalogedRecord(
    transaction: Prisma.TransactionClient,
    dto: CreateSpecimenDto,
    actingCuratorAccountId: string,
    auditAction: string,
    extraAuditDetails: Prisma.InputJsonObject = {},
  ): Promise<Specimen> {
    if (dto.collectionId) {
      await this.assertCollectionExists(transaction, dto.collectionId);
    }
    await this.accession.assertAvailable(transaction, dto.accessionNumber);

    let created: specimen;
    try {
      created = await transaction.specimen.create({
        data: {
          collection_id: dto.collectionId,
          created_by: actingCuratorAccountId,
          updated_by: actingCuratorAccountId,
          accession_number: dto.accessionNumber,
          specimen_category: dto.specimenCategory,
          scientific_name: dto.scientificName,
          common_name: dto.commonName,
          gender: dto.gender,
          classification_status: dto.classificationStatus,
          status: 'UNCATALOGED',
          public_display_allowed: false,
          remarks: dto.remarks,
        },
      });
    } catch (error) {
      throw this.toAccessionConflict(error, dto.accessionNumber);
    }

    await this.recordAudit(transaction, {
      userId: actingCuratorAccountId,
      specimenId: created.id,
      action: auditAction,
      details: { status: created.status, ...extraAuditDetails },
    });

    return this.toEntity(created);
  }

  /** Maps the unique-index race loser to the same 409 as the pre-check. */
  private toAccessionConflict(
    error: unknown,
    accessionNumber: string | null | undefined,
  ): unknown {
    if (accessionNumber && this.accession.isUniqueViolation(error)) {
      return this.accession.conflict(accessionNumber);
    }
    return error;
  }

  private assertExists(
    item: specimen | null,
    id: string,
  ): asserts item is specimen {
    if (!item) {
      throw new NotFoundException(`Specimen ${id} not found`);
    }
  }

  private assertEditable(item: specimen): void {
    if (item.status === 'ARCHIVED' || item.archived_at) {
      throw new BadRequestException('Archived specimens cannot be changed.');
    }
  }

  private async assertCollectionExists(
    transaction: Prisma.TransactionClient,
    collectionId: string,
  ): Promise<void> {
    const collection = await transaction.collection.findUnique({
      where: { id: collectionId },
      select: { id: true },
    });
    if (!collection) {
      throw new NotFoundException(`Collection ${collectionId} not found`);
    }
  }

  private async recordRevisions(
    transaction: Prisma.TransactionClient,
    specimenId: string,
    changedBy: string,
    changes: RevisionChange[],
    reason?: string,
  ): Promise<void> {
    await transaction.specimen_revision_history.createMany({
      data: changes.map((change) => ({
        specimen_id: specimenId,
        changed_by: changedBy,
        field_changed: change.fieldChanged,
        old_value: this.historyValue(change.oldValue),
        new_value: this.historyValue(change.newValue),
        reason,
        source_section: 'specimen_core',
      })),
    });
  }

  private async recordAudit(
    transaction: Prisma.TransactionClient,
    params: {
      userId: string;
      specimenId: string;
      action: string;
      details: Prisma.InputJsonValue;
    },
  ): Promise<void> {
    await transaction.audit_log.create({
      data: {
        user_id: params.userId,
        affected_record_id: params.specimenId,
        affected_record_type: 'specimen',
        action: params.action,
        module: 'specimens',
        details: params.details,
        status: 'SUCCESS',
      },
    });
  }

  private historyValue(value: string | boolean | null): string | null {
    if (value === null) return null;
    return typeof value === 'boolean' ? String(value) : value;
  }

  private toSearchItem(
    item: SpecimenSearchRecord,
    locations: ReadonlyMap<string, StorageLocationSummary>,
  ): SpecimenSearchItem {
    const storageUnits = new Map(
      item.specimen_lot.map((lot) => [
        lot.storage_unit.id,
        {
          id: lot.storage_unit.id,
          label: lot.storage_unit.label,
          unitType: lot.storage_unit.unit_type,
          pathLabel:
            locations.get(lot.storage_unit.id)?.pathLabel ??
            lot.storage_unit.label,
        },
      ]),
    );

    return {
      ...this.toEntity(item),
      family: item.specimen_taxonomy?.family ?? null,
      collector: item.specimen_provenance?.collector ?? null,
      totalQuantity: item.specimen_lot.reduce(
        (total, lot) => total + lot.quantity,
        0,
      ),
      conditionClasses: [
        ...new Set(item.specimen_lot.map((lot) => lot.condition_class)),
      ],
      storageUnits: [...storageUnits.values()],
    };
  }

  private toEntity(item: specimen): Specimen {
    return {
      id: item.id,
      collectionId: item.collection_id,
      accessionNumber: item.accession_number,
      specimenCategory: item.specimen_category,
      scientificName: item.scientific_name,
      commonName: item.common_name,
      gender: item.gender as SpecimenGender | null,
      classificationStatus: item.classification_status,
      status: item.status as SpecimenStatus,
      publicDisplay: item.public_display_allowed,
      remarks: item.remarks,
      createdBy: item.created_by,
      updatedBy: item.updated_by,
      archivedBy: item.archived_by,
      archivedAt: item.archived_at,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    };
  }

  private toRevisionEntity(item: SpecimenRevisionWithActor): SpecimenRevision {
    return {
      id: item.id,
      specimenId: item.specimen_id,
      changedBy: {
        id: item.user_account.id,
        fullName: item.user_account.full_name,
        role: item.user_account.role,
      },
      fieldChanged: item.field_changed,
      oldValue: item.old_value,
      newValue: item.new_value,
      reason: item.reason,
      sourceSection: item.source_section,
      changedAt: item.changed_at,
    };
  }
}
