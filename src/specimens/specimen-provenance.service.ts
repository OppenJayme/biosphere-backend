import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  type specimen,
  type specimen_provenance,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSpecimenProvenanceDto } from './dto/create-specimen-provenance.dto';
import { UpdateSpecimenProvenanceDto } from './dto/update-specimen-provenance.dto';
import { SpecimenProvenance } from './entities/specimen-provenance.entity';

interface ProvenanceChange {
  fieldChanged: string;
  oldValue: string | null;
  newValue: string | null;
}

const TEXT_FIELDS = [
  { api: 'collector', database: 'collector' },
  { api: 'donor', database: 'donor' },
  { api: 'collectionLocation', database: 'collection_location' },
  { api: 'preservationType', database: 'preservation_type' },
  { api: 'preservationMethod', database: 'preservation_method' },
] as const;

@Injectable()
export class SpecimenProvenanceService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    specimenId: string,
    dto: CreateSpecimenProvenanceDto,
    actingCuratorAccountId: string,
  ): Promise<SpecimenProvenance> {
    return this.prisma.$transaction(async (transaction) => {
      const specimenRecord = await this.findSpecimenOrThrow(
        transaction,
        specimenId,
      );
      this.assertEditable(specimenRecord);

      const existing = await transaction.specimen_provenance.findUnique({
        where: { specimen_id: specimenId },
      });
      if (existing) {
        throw new ConflictException(
          `Provenance already exists for specimen ${specimenId}`,
        );
      }

      const values = this.createValues(dto);
      const changes = this.collectCreateChanges(values);
      if (changes.length === 0) {
        throw new BadRequestException(
          'At least one provenance field must contain a value.',
        );
      }

      const changedAt = new Date();
      const created = await transaction.specimen_provenance.create({
        data: {
          specimen_id: specimenId,
          ...values,
          updated_at: changedAt,
        },
      });

      await this.touchSpecimen(
        transaction,
        specimenId,
        actingCuratorAccountId,
        changedAt,
      );
      await this.recordRevisions(
        transaction,
        specimenId,
        actingCuratorAccountId,
        changes,
      );
      await this.recordAudit(transaction, {
        userId: actingCuratorAccountId,
        specimenId,
        action: 'CREATE_SPECIMEN_PROVENANCE',
        fields: changes.map((change) => change.fieldChanged),
      });

      return this.toEntity(created);
    });
  }

  async findOne(specimenId: string): Promise<SpecimenProvenance> {
    await this.findSpecimenOrThrow(this.prisma, specimenId);
    const provenance = await this.prisma.specimen_provenance.findUnique({
      where: { specimen_id: specimenId },
    });
    if (!provenance) {
      throw new NotFoundException(
        `Provenance for specimen ${specimenId} not found`,
      );
    }

    return this.toEntity(provenance);
  }

  async update(
    specimenId: string,
    dto: UpdateSpecimenProvenanceDto,
    actingCuratorAccountId: string,
  ): Promise<SpecimenProvenance> {
    return this.prisma.$transaction(async (transaction) => {
      const specimenRecord = await this.findSpecimenOrThrow(
        transaction,
        specimenId,
      );
      this.assertEditable(specimenRecord);

      const existing = await transaction.specimen_provenance.findUnique({
        where: { specimen_id: specimenId },
      });
      if (!existing) {
        throw new NotFoundException(
          `Provenance for specimen ${specimenId} not found`,
        );
      }

      const { data, changes } = this.collectUpdate(dto, existing);
      if (changes.length === 0) {
        throw new BadRequestException(
          'At least one provenance field must change.',
        );
      }

      const changedAt = new Date();
      const updated = await transaction.specimen_provenance.update({
        where: { specimen_id: specimenId },
        data: { ...data, updated_at: changedAt },
      });

      await this.touchSpecimen(
        transaction,
        specimenId,
        actingCuratorAccountId,
        changedAt,
      );
      await this.recordRevisions(
        transaction,
        specimenId,
        actingCuratorAccountId,
        changes,
      );
      await this.recordAudit(transaction, {
        userId: actingCuratorAccountId,
        specimenId,
        action: 'UPDATE_SPECIMEN_PROVENANCE',
        fields: changes.map((change) => change.fieldChanged),
      });

      return this.toEntity(updated);
    });
  }

  private createValues(dto: CreateSpecimenProvenanceDto) {
    return {
      collector: dto.collector ?? null,
      donor: dto.donor ?? null,
      collection_date: this.toDatabaseDate(dto.collectionDate),
      collection_location: dto.collectionLocation ?? null,
      preservation_type: dto.preservationType ?? null,
      preservation_method: dto.preservationMethod ?? null,
    };
  }

  private collectCreateChanges(
    values: ReturnType<SpecimenProvenanceService['createValues']>,
  ): ProvenanceChange[] {
    const changes = TEXT_FIELDS.flatMap<ProvenanceChange>((field) => {
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

    if (values.collection_date) {
      changes.push({
        fieldChanged: 'collection_date',
        oldValue: null,
        newValue: this.toDateOnly(values.collection_date),
      });
    }

    return changes;
  }

  private collectUpdate(
    dto: UpdateSpecimenProvenanceDto,
    existing: specimen_provenance,
  ): {
    data: Prisma.specimen_provenanceUpdateInput;
    changes: ProvenanceChange[];
  } {
    const data: Prisma.specimen_provenanceUpdateInput = {};
    const changes: ProvenanceChange[] = [];

    for (const field of TEXT_FIELDS) {
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

    if (dto.collectionDate !== undefined) {
      const oldValue = existing.collection_date
        ? this.toDateOnly(existing.collection_date)
        : null;
      if (dto.collectionDate !== oldValue) {
        data.collection_date = this.toDatabaseDate(dto.collectionDate);
        changes.push({
          fieldChanged: 'collection_date',
          oldValue,
          newValue: dto.collectionDate,
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
        'Provenance for an archived specimen cannot be changed.',
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

  private async recordRevisions(
    transaction: Prisma.TransactionClient,
    specimenId: string,
    changedBy: string,
    changes: ProvenanceChange[],
  ): Promise<void> {
    await transaction.specimen_revision_history.createMany({
      data: changes.map((change) => ({
        specimen_id: specimenId,
        changed_by: changedBy,
        field_changed: change.fieldChanged,
        old_value: change.oldValue,
        new_value: change.newValue,
        source_section: 'specimen_provenance',
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

  private toDatabaseDate(value: string | null | undefined): Date | null {
    return value ? new Date(`${value}T00:00:00.000Z`) : null;
  }

  private toDateOnly(value: Date): string {
    return value.toISOString().slice(0, 10);
  }

  private toEntity(item: specimen_provenance): SpecimenProvenance {
    return {
      specimenId: item.specimen_id,
      collector: item.collector,
      donor: item.donor,
      collectionDate: item.collection_date
        ? this.toDateOnly(item.collection_date)
        : null,
      collectionLocation: item.collection_location,
      preservationType: item.preservation_type,
      preservationMethod: item.preservation_method,
      updatedAt: item.updated_at,
    };
  }
}
