import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  type specimen,
  type specimen_taxonomy,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSpecimenTaxonomyDto } from './dto/create-specimen-taxonomy.dto';
import { UpdateSpecimenTaxonomyDto } from './dto/update-specimen-taxonomy.dto';
import { SpecimenTaxonomy } from './entities/specimen-taxonomy.entity';

interface TaxonomyChange {
  fieldChanged: string;
  oldValue: string | null;
  newValue: string | null;
}

const TAXONOMY_FIELDS = [
  { api: 'kingdom', database: 'kingdom' },
  { api: 'phylum', database: 'phylum' },
  { api: 'class', database: 'class' },
  { api: 'orderName', database: 'order_name' },
  { api: 'family', database: 'family' },
  { api: 'genus', database: 'genus' },
  { api: 'species', database: 'species' },
  { api: 'habitat', database: 'habitat' },
  { api: 'ecologicalRole', database: 'ecological_role' },
  { api: 'conservationStatus', database: 'conservation_status' },
] as const;

@Injectable()
export class SpecimenTaxonomyService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    specimenId: string,
    dto: CreateSpecimenTaxonomyDto,
    actingCuratorAccountId: string,
  ): Promise<SpecimenTaxonomy> {
    return this.prisma.$transaction(async (transaction) => {
      const specimenRecord = await this.findSpecimenOrThrow(
        transaction,
        specimenId,
      );
      this.assertEditable(specimenRecord);

      const existing = await transaction.specimen_taxonomy.findUnique({
        where: { specimen_id: specimenId },
      });
      if (existing) {
        throw new ConflictException(
          `Taxonomy already exists for specimen ${specimenId}`,
        );
      }

      const values = this.createValues(dto);
      const changes = this.collectCreateChanges(values);
      if (changes.length === 0) {
        throw new BadRequestException(
          'At least one taxonomy field must contain a value.',
        );
      }

      const created = await transaction.specimen_taxonomy.create({
        data: { specimen_id: specimenId, ...values },
      });

      await this.touchSpecimen(transaction, specimenId, actingCuratorAccountId);
      await this.recordRevisions(
        transaction,
        specimenId,
        actingCuratorAccountId,
        changes,
      );
      await this.recordAudit(transaction, {
        userId: actingCuratorAccountId,
        specimenId,
        action: 'CREATE_SPECIMEN_TAXONOMY',
        fields: changes.map((change) => change.fieldChanged),
      });

      return this.toEntity(created);
    });
  }

  async findOne(specimenId: string): Promise<SpecimenTaxonomy> {
    await this.findSpecimenOrThrow(this.prisma, specimenId);
    const taxonomy = await this.prisma.specimen_taxonomy.findUnique({
      where: { specimen_id: specimenId },
    });
    if (!taxonomy) {
      throw new NotFoundException(
        `Taxonomy for specimen ${specimenId} not found`,
      );
    }

    return this.toEntity(taxonomy);
  }

  async update(
    specimenId: string,
    dto: UpdateSpecimenTaxonomyDto,
    actingCuratorAccountId: string,
  ): Promise<SpecimenTaxonomy> {
    return this.prisma.$transaction(async (transaction) => {
      const specimenRecord = await this.findSpecimenOrThrow(
        transaction,
        specimenId,
      );
      this.assertEditable(specimenRecord);

      const existing = await transaction.specimen_taxonomy.findUnique({
        where: { specimen_id: specimenId },
      });
      if (!existing) {
        throw new NotFoundException(
          `Taxonomy for specimen ${specimenId} not found`,
        );
      }

      const { data, changes } = this.collectUpdate(dto, existing);
      if (changes.length === 0) {
        throw new BadRequestException(
          'At least one taxonomy field must change.',
        );
      }

      const updated = await transaction.specimen_taxonomy.update({
        where: { specimen_id: specimenId },
        data,
      });

      await this.touchSpecimen(transaction, specimenId, actingCuratorAccountId);
      await this.recordRevisions(
        transaction,
        specimenId,
        actingCuratorAccountId,
        changes,
      );
      await this.recordAudit(transaction, {
        userId: actingCuratorAccountId,
        specimenId,
        action: 'UPDATE_SPECIMEN_TAXONOMY',
        fields: changes.map((change) => change.fieldChanged),
      });

      return this.toEntity(updated);
    });
  }

  private createValues(dto: CreateSpecimenTaxonomyDto) {
    return {
      kingdom: dto.kingdom ?? null,
      phylum: dto.phylum ?? null,
      class: dto.class ?? null,
      order_name: dto.orderName ?? null,
      family: dto.family ?? null,
      genus: dto.genus ?? null,
      species: dto.species ?? null,
      habitat: dto.habitat ?? null,
      ecological_role: dto.ecologicalRole ?? null,
      conservation_status: dto.conservationStatus ?? null,
    };
  }

  private collectCreateChanges(
    values: ReturnType<SpecimenTaxonomyService['createValues']>,
  ): TaxonomyChange[] {
    return TAXONOMY_FIELDS.flatMap((field) => {
      const value = values[field.database];
      return value === null
        ? []
        : [
            {
              fieldChanged: field.database,
              oldValue: null,
              newValue: value,
            },
          ];
    });
  }

  private collectUpdate(
    dto: UpdateSpecimenTaxonomyDto,
    existing: specimen_taxonomy,
  ): {
    data: Prisma.specimen_taxonomyUpdateInput;
    changes: TaxonomyChange[];
  } {
    const data: Prisma.specimen_taxonomyUpdateInput = {};
    const changes: TaxonomyChange[] = [];

    for (const field of TAXONOMY_FIELDS) {
      const newValue = dto[field.api];
      const oldValue = existing[field.database];
      if (newValue !== undefined && newValue !== oldValue) {
        Object.assign(data, { [field.database]: newValue });
        changes.push({
          fieldChanged: field.database,
          oldValue,
          newValue,
        });
      }
    }

    return { data, changes };
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

  private assertEditable(item: specimen): void {
    if (item.status === 'ARCHIVED' || item.archived_at) {
      throw new BadRequestException(
        'Taxonomy for an archived specimen cannot be changed.',
      );
    }
  }

  private async touchSpecimen(
    transaction: Prisma.TransactionClient,
    specimenId: string,
    actingCuratorAccountId: string,
  ): Promise<void> {
    await transaction.specimen.update({
      where: { id: specimenId },
      data: {
        updated_by: actingCuratorAccountId,
        updated_at: new Date(),
      },
    });
  }

  private async recordRevisions(
    transaction: Prisma.TransactionClient,
    specimenId: string,
    changedBy: string,
    changes: TaxonomyChange[],
  ): Promise<void> {
    await transaction.specimen_revision_history.createMany({
      data: changes.map((change) => ({
        specimen_id: specimenId,
        changed_by: changedBy,
        field_changed: change.fieldChanged,
        old_value: change.oldValue,
        new_value: change.newValue,
        source_section: 'specimen_taxonomy',
      })),
    });
  }

  private async recordAudit(
    transaction: Prisma.TransactionClient,
    params: {
      userId: string;
      specimenId: string;
      action: string;
      fields: string[];
    },
  ): Promise<void> {
    await transaction.audit_log.create({
      data: {
        user_id: params.userId,
        affected_record_id: params.specimenId,
        affected_record_type: 'specimen',
        action: params.action,
        module: 'specimens',
        details: { fields: params.fields },
        status: 'SUCCESS',
      },
    });
  }

  private toEntity(item: specimen_taxonomy): SpecimenTaxonomy {
    return {
      specimenId: item.specimen_id,
      kingdom: item.kingdom,
      phylum: item.phylum,
      class: item.class,
      orderName: item.order_name,
      family: item.family,
      genus: item.genus,
      species: item.species,
      habitat: item.habitat,
      ecologicalRole: item.ecological_role,
      conservationStatus: item.conservation_status,
    };
  }
}
