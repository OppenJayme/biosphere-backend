import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  type specimen,
  type specimen_lot,
  type specimen_lot_transaction,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSpecimenLotDto } from './dto/create-specimen-lot.dto';
import { ListLotTransactionsQueryDto } from './dto/list-lot-transactions-query.dto';
import { UpdateSpecimenLotNotesDto } from './dto/update-specimen-lot-notes.dto';
import {
  LotTransactionType,
  QuantityAdjustmentType,
  SpecimenLotTransaction,
  SpecimenLotTransactionPage,
} from './entities/specimen-lot-transaction.entity';
import { SpecimenLotSummary } from './entities/specimen-lot-summary.entity';
import { SpecimenLot } from './entities/specimen-lot.entity';

@Injectable()
export class SpecimenLotsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    specimenId: string,
    dto: CreateSpecimenLotDto,
    actingCuratorAccountId: string,
  ): Promise<SpecimenLot> {
    return this.prisma.$transaction(async (transaction) => {
      const specimenRecord = await this.findSpecimenOrThrow(
        transaction,
        specimenId,
      );
      this.assertSpecimenEditable(specimenRecord);
      await this.assertAssignableStorageUnit(transaction, dto.storageUnitId);

      const matchingLot = await transaction.specimen_lot.findFirst({
        where: {
          specimen_id: specimenId,
          storage_unit_id: dto.storageUnitId,
          condition_class: dto.conditionClass,
          is_active: true,
        },
        select: { id: true },
      });
      if (matchingLot) {
        throw this.matchingLotConflict(matchingLot.id);
      }

      const changedAt = new Date();
      let created: specimen_lot;
      try {
        created = await transaction.specimen_lot.create({
          data: {
            specimen_id: specimenId,
            storage_unit_id: dto.storageUnitId,
            condition_class: dto.conditionClass,
            quantity: dto.quantity,
            storage_notes: dto.storageNotes,
            is_active: true,
            created_by: actingCuratorAccountId,
            updated_by: actingCuratorAccountId,
            created_at: changedAt,
            updated_at: changedAt,
          },
        });
      } catch (error) {
        if (this.isUniqueConstraintError(error)) {
          throw this.matchingLotConflict();
        }
        throw error;
      }

      await transaction.specimen_lot_transaction.create({
        data: {
          source_lot_id: null,
          target_lot_id: created.id,
          transaction_type: 'QUANTITY_ADJUSTMENT',
          quantity_affected: dto.quantity,
          adjustment_type: 'ADDITION',
          reason: dto.reason,
          performed_by: actingCuratorAccountId,
          created_at: changedAt,
        },
      });

      await this.touchSpecimen(
        transaction,
        specimenId,
        actingCuratorAccountId,
        changedAt,
      );
      await this.recordAudit(transaction, {
        userId: actingCuratorAccountId,
        lotId: created.id,
        action: 'CREATE_SPECIMEN_LOT',
        details: {
          specimenId,
          storageUnitId: dto.storageUnitId,
          conditionClass: dto.conditionClass,
          quantity: dto.quantity,
          adjustmentType: 'ADDITION',
        },
      });

      return this.toEntity(created);
    });
  }

  async findActive(specimenId: string): Promise<SpecimenLot[]> {
    await this.findSpecimenOrThrow(this.prisma, specimenId);
    const lots = await this.prisma.specimen_lot.findMany({
      where: { specimen_id: specimenId, is_active: true },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
    });

    return lots.map((lot) => this.toEntity(lot));
  }

  async findOne(specimenId: string, lotId: string): Promise<SpecimenLot> {
    await this.findSpecimenOrThrow(this.prisma, specimenId);
    return this.toEntity(
      await this.findLotOrThrow(this.prisma, specimenId, lotId),
    );
  }

  async summarize(specimenId: string): Promise<SpecimenLotSummary> {
    await this.findSpecimenOrThrow(this.prisma, specimenId);
    const aggregate = await this.prisma.specimen_lot.aggregate({
      where: { specimen_id: specimenId, is_active: true },
      _count: { id: true },
      _sum: { quantity: true },
    });

    return {
      specimenId,
      activeLotCount: aggregate._count.id,
      totalQuantity: aggregate._sum.quantity ?? 0,
    };
  }

  async findTransactions(
    specimenId: string,
    lotId: string,
    query: ListLotTransactionsQueryDto,
  ): Promise<SpecimenLotTransactionPage> {
    await this.findSpecimenOrThrow(this.prisma, specimenId);
    await this.findLotOrThrow(this.prisma, specimenId, lotId);

    const where: Prisma.specimen_lot_transactionWhereInput = {
      OR: [{ source_lot_id: lotId }, { target_lot_id: lotId }],
    };
    const [transactions, total] = await Promise.all([
      this.prisma.specimen_lot_transaction.findMany({
        where,
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.specimen_lot_transaction.count({ where }),
    ]);

    return {
      items: transactions.map((transaction) =>
        this.toTransactionEntity(transaction),
      ),
      page: query.page,
      limit: query.limit,
      total,
    };
  }

  async updateNotes(
    specimenId: string,
    lotId: string,
    dto: UpdateSpecimenLotNotesDto,
    actingCuratorAccountId: string,
  ): Promise<SpecimenLot> {
    return this.prisma.$transaction(async (transaction) => {
      const specimenRecord = await this.findSpecimenOrThrow(
        transaction,
        specimenId,
      );
      this.assertSpecimenEditable(specimenRecord);
      const existing = await this.findLotOrThrow(
        transaction,
        specimenId,
        lotId,
      );
      this.assertLotActive(existing);

      if (dto.storageNotes === existing.storage_notes) {
        throw new BadRequestException('Storage notes must change.');
      }

      const changedAt = new Date();
      const updated = await transaction.specimen_lot.update({
        where: { id: lotId },
        data: {
          storage_notes: dto.storageNotes,
          updated_by: actingCuratorAccountId,
          updated_at: changedAt,
        },
      });

      await this.touchSpecimen(
        transaction,
        specimenId,
        actingCuratorAccountId,
        changedAt,
      );
      await transaction.specimen_revision_history.create({
        data: {
          specimen_id: specimenId,
          changed_by: actingCuratorAccountId,
          field_changed: 'storage_notes',
          old_value: existing.storage_notes,
          new_value: dto.storageNotes,
          source_section: 'specimen_lot',
        },
      });
      await this.recordAudit(transaction, {
        userId: actingCuratorAccountId,
        lotId,
        action: 'UPDATE_SPECIMEN_LOT_NOTES',
        details: { specimenId },
      });

      return this.toEntity(updated);
    });
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

  private async findLotOrThrow(
    client: Pick<Prisma.TransactionClient, 'specimen_lot'>,
    specimenId: string,
    lotId: string,
  ): Promise<specimen_lot> {
    const lot = await client.specimen_lot.findFirst({
      where: { id: lotId, specimen_id: specimenId },
    });
    if (!lot) {
      throw new NotFoundException(
        `Lot ${lotId} not found for specimen ${specimenId}`,
      );
    }
    return lot;
  }

  private async assertAssignableStorageUnit(
    transaction: Prisma.TransactionClient,
    storageUnitId: string,
  ): Promise<void> {
    const unit = await transaction.storage_unit.findUnique({
      where: { id: storageUnitId },
      select: { id: true, holds_specimens: true, archived_at: true },
    });
    if (!unit) {
      throw new NotFoundException(`Storage unit ${storageUnitId} not found`);
    }
    if (unit.archived_at) {
      throw new BadRequestException(
        'Archived storage units cannot receive specimen lots.',
      );
    }
    if (!unit.holds_specimens) {
      throw new BadRequestException(
        'This storage unit is not configured to hold specimens.',
      );
    }
  }

  private assertSpecimenEditable(item: specimen): void {
    if (item.status === 'ARCHIVED' || item.archived_at) {
      throw new BadRequestException(
        'Lots cannot be added to or changed on an archived specimen.',
      );
    }
  }

  private assertLotActive(item: specimen_lot): void {
    if (!item.is_active) {
      throw new BadRequestException('Inactive specimen lots cannot be edited.');
    }
  }

  private matchingLotConflict(existingLotId?: string): ConflictException {
    const suffix = existingLotId ? ` Existing lot: ${existingLotId}.` : '';
    return new ConflictException(
      `An active lot already exists for this specimen, storage unit, and condition.${suffix} Use the quantity-adjustment workflow instead.`,
    );
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
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

  private async recordAudit(
    transaction: Prisma.TransactionClient,
    params: {
      userId: string;
      lotId: string;
      action: string;
      details: Prisma.InputJsonValue;
    },
  ): Promise<void> {
    await transaction.audit_log.create({
      data: {
        user_id: params.userId,
        affected_record_id: params.lotId,
        affected_record_type: 'specimen_lot',
        action: params.action,
        module: 'specimen_lots',
        details: params.details,
        status: 'SUCCESS',
      },
    });
  }

  private toEntity(item: specimen_lot): SpecimenLot {
    return {
      id: item.id,
      specimenId: item.specimen_id,
      storageUnitId: item.storage_unit_id,
      conditionClass: item.condition_class,
      quantity: item.quantity,
      storageNotes: item.storage_notes,
      isActive: item.is_active,
      createdBy: item.created_by,
      updatedBy: item.updated_by,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    };
  }

  private toTransactionEntity(
    item: specimen_lot_transaction,
  ): SpecimenLotTransaction {
    return {
      id: item.id,
      sourceLotId: item.source_lot_id,
      targetLotId: item.target_lot_id,
      transactionType: item.transaction_type as LotTransactionType,
      quantityAffected: item.quantity_affected,
      adjustmentType: item.adjustment_type as QuantityAdjustmentType | null,
      reason: item.reason,
      performedBy: item.performed_by,
      createdAt: item.created_at,
    };
  }
}
