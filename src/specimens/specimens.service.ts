import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type specimen } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSpecimenDto } from './dto/create-specimen.dto';
import { SetPublicDisplayDto } from './dto/set-public-display.dto';
import { UpdateSpecimenDto } from './dto/update-specimen.dto';
import {
  Specimen,
  SpecimenGender,
  SpecimenStatus,
} from './entities/specimen.entity';

interface RevisionChange {
  fieldChanged: string;
  oldValue: string | boolean | null;
  newValue: string | boolean | null;
}

@Injectable()
export class SpecimensService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    dto: CreateSpecimenDto,
    actingCuratorAccountId: string,
  ): Promise<Specimen> {
    return this.prisma.$transaction(async (transaction) => {
      if (dto.collectionId) {
        await this.assertCollectionExists(transaction, dto.collectionId);
      }

      const created = await transaction.specimen.create({
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

      await this.recordAudit(transaction, {
        userId: actingCuratorAccountId,
        specimenId: created.id,
        action: 'CREATE_SPECIMEN',
        details: { status: created.status },
      });

      return this.toEntity(created);
    });
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

  async update(
    id: string,
    dto: UpdateSpecimenDto,
    actingCuratorAccountId: string,
  ): Promise<Specimen> {
    return this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.specimen.findUnique({
        where: { id },
      });
      this.assertExists(existing, id);
      this.assertEditable(existing);

      if (dto.collectionId) {
        await this.assertCollectionExists(transaction, dto.collectionId);
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

      const updated = await transaction.specimen.update({
        where: { id },
        data: {
          ...data,
          updated_by: actingCuratorAccountId,
          updated_at: new Date(),
        },
      });

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
    });
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
    return this.prisma.$transaction(async (transaction) => {
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
    });
  }

  private async findOneOrThrow(id: string): Promise<specimen> {
    const item = await this.prisma.specimen.findUnique({ where: { id } });
    this.assertExists(item, id);
    return item;
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
  ): Promise<void> {
    await transaction.specimen_revision_history.createMany({
      data: changes.map((change) => ({
        specimen_id: specimenId,
        changed_by: changedBy,
        field_changed: change.fieldChanged,
        old_value: this.historyValue(change.oldValue),
        new_value: this.historyValue(change.newValue),
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
}
