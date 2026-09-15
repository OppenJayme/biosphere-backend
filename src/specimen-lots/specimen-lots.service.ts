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
import { AdjustSpecimenLotQuantityDto } from './dto/adjust-specimen-lot-quantity.dto';
import { ChangeSpecimenLotConditionDto } from './dto/change-specimen-lot-condition.dto';
import { CreateSpecimenLotDto } from './dto/create-specimen-lot.dto';
import { ListLotTransactionsQueryDto } from './dto/list-lot-transactions-query.dto';
import { MoveSpecimenLotDto } from './dto/move-specimen-lot.dto';
import { UpdateSpecimenLotNotesDto } from './dto/update-specimen-lot-notes.dto';
import { SpecimenLotOperationResult } from './entities/specimen-lot-operation-result.entity';
import { SpecimenLotQuantityAdjustmentResult } from './entities/specimen-lot-quantity-adjustment-result.entity';
import {
  LotTransactionType,
  QuantityAdjustmentType,
  SpecimenLotTransaction,
  SpecimenLotTransactionPage,
} from './entities/specimen-lot-transaction.entity';
import { SpecimenLotSummary } from './entities/specimen-lot-summary.entity';
import { SpecimenLot } from './entities/specimen-lot.entity';

const POSTGRES_INTEGER_MAX = 2_147_483_647;
const SERIALIZABLE_RETRY_LIMIT = 3;
const DECREASE_ONLY_ADJUSTMENTS = new Set<QuantityAdjustmentType>([
  QuantityAdjustmentType.REMOVAL,
  QuantityAdjustmentType.TRANSFER_OUT,
  QuantityAdjustmentType.DEACCESSION,
  QuantityAdjustmentType.MISSING_LOSS,
  QuantityAdjustmentType.DESTRUCTION,
]);

type LotDimensionOperation =
  LotTransactionType.MOVEMENT | LotTransactionType.CONDITION_CHANGE;

type LotDimensionChange = {
  operation: LotDimensionOperation;
  targetStorageUnitId: string;
  targetConditionClass: string;
  quantity: number;
  reason?: string | null;
  revisionField: 'storage_unit_id' | 'condition_class';
  revisionOldValue: string;
  revisionNewValue: string;
  newLotStorageNotes: string | null;
};

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

  async move(
    specimenId: string,
    lotId: string,
    dto: MoveSpecimenLotDto,
    actingCuratorAccountId: string,
  ): Promise<SpecimenLotOperationResult> {
    return this.runSerializableLotMutation(async (transaction) => {
      const specimenRecord = await this.findSpecimenOrThrow(
        transaction,
        specimenId,
      );
      this.assertSpecimenEditable(specimenRecord);
      const source = await this.findLotOrThrow(transaction, specimenId, lotId);
      this.assertLotActive(source);

      if (dto.targetStorageUnitId === source.storage_unit_id) {
        throw new BadRequestException(
          'The lot is already assigned to that storage unit.',
        );
      }

      await this.assertAssignableStorageUnit(
        transaction,
        dto.targetStorageUnitId,
      );

      return this.applyDimensionChange(
        transaction,
        specimenId,
        source,
        {
          operation: LotTransactionType.MOVEMENT,
          targetStorageUnitId: dto.targetStorageUnitId,
          targetConditionClass: source.condition_class,
          quantity: dto.quantity,
          reason: dto.reason,
          revisionField: 'storage_unit_id',
          revisionOldValue: source.storage_unit_id,
          revisionNewValue: dto.targetStorageUnitId,
          // Storage notes describe the old physical placement and should not
          // silently follow a lot into a different storage unit.
          newLotStorageNotes: null,
        },
        actingCuratorAccountId,
      );
    });
  }

  async changeCondition(
    specimenId: string,
    lotId: string,
    dto: ChangeSpecimenLotConditionDto,
    actingCuratorAccountId: string,
  ): Promise<SpecimenLotOperationResult> {
    return this.runSerializableLotMutation(async (transaction) => {
      const specimenRecord = await this.findSpecimenOrThrow(
        transaction,
        specimenId,
      );
      this.assertSpecimenEditable(specimenRecord);
      const source = await this.findLotOrThrow(transaction, specimenId, lotId);
      this.assertLotActive(source);

      if (dto.targetConditionClass === source.condition_class) {
        throw new BadRequestException(
          'The lot already has that condition classification.',
        );
      }

      // A condition change can create a replacement lot at the same physical
      // location, so that location must still be active and usable.
      await this.assertAssignableStorageUnit(
        transaction,
        source.storage_unit_id,
      );

      return this.applyDimensionChange(
        transaction,
        specimenId,
        source,
        {
          operation: LotTransactionType.CONDITION_CHANGE,
          targetStorageUnitId: source.storage_unit_id,
          targetConditionClass: dto.targetConditionClass,
          quantity: dto.quantity,
          reason: dto.reason,
          revisionField: 'condition_class',
          revisionOldValue: source.condition_class,
          revisionNewValue: dto.targetConditionClass,
          // The physical location is unchanged, so its storage notes remain
          // meaningful when a new target lot is created.
          newLotStorageNotes: source.storage_notes,
        },
        actingCuratorAccountId,
      );
    });
  }

  async adjustQuantity(
    specimenId: string,
    lotId: string,
    dto: AdjustSpecimenLotQuantityDto,
    actingCuratorAccountId: string,
  ): Promise<SpecimenLotQuantityAdjustmentResult> {
    this.assertAdjustmentDirection(dto.adjustmentType, dto.quantityDelta);

    return this.runSerializableLotMutation(async (transaction) => {
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

      if (existing.quantity !== dto.expectedQuantity) {
        throw new ConflictException(
          `The lot quantity is ${existing.quantity}, not the expected ${dto.expectedQuantity}. Reload the lot and review the adjustment before trying again.`,
        );
      }

      // Increasing inventory is equivalent to assigning more specimens to
      // this location. Reductions remain allowed so an invalid legacy
      // placement can still be emptied and retired safely.
      if (dto.quantityDelta > 0) {
        await this.assertAssignableStorageUnit(
          transaction,
          existing.storage_unit_id,
        );
      }

      const resultingQuantity = existing.quantity + dto.quantityDelta;
      if (resultingQuantity < 0) {
        throw new BadRequestException(
          `Adjustment exceeds the active lot quantity of ${existing.quantity}.`,
        );
      }
      if (resultingQuantity > POSTGRES_INTEGER_MAX) {
        throw new BadRequestException(
          'This adjustment would exceed the maximum supported lot quantity.',
        );
      }

      const changedAt = new Date();
      const lotDeactivated = resultingQuantity === 0;
      const mutation = await transaction.specimen_lot.updateMany({
        where: {
          id: lotId,
          specimen_id: specimenId,
          is_active: true,
          quantity: existing.quantity,
        },
        data: lotDeactivated
          ? {
              is_active: false,
              updated_by: actingCuratorAccountId,
              updated_at: changedAt,
            }
          : {
              quantity: resultingQuantity,
              updated_by: actingCuratorAccountId,
              updated_at: changedAt,
            },
      });
      if (mutation.count !== 1) {
        throw this.concurrentLotConflict();
      }

      const updated = await this.findLotOrThrow(transaction, specimenId, lotId);
      const quantityAffected = Math.abs(dto.quantityDelta);
      const isIncrease = dto.quantityDelta > 0;
      const transactionRecord =
        await transaction.specimen_lot_transaction.create({
          data: {
            source_lot_id: isIncrease ? null : lotId,
            target_lot_id: isIncrease ? lotId : null,
            transaction_type: LotTransactionType.QUANTITY_ADJUSTMENT,
            quantity_affected: quantityAffected,
            adjustment_type: dto.adjustmentType,
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
      await transaction.specimen_revision_history.create({
        data: {
          specimen_id: specimenId,
          changed_by: actingCuratorAccountId,
          field_changed: 'quantity',
          old_value: String(existing.quantity),
          new_value: String(resultingQuantity),
          reason: dto.reason,
          changed_at: changedAt,
          source_section: 'specimen_lot',
        },
      });
      await this.recordAudit(transaction, {
        userId: actingCuratorAccountId,
        lotId,
        action: 'ADJUST_SPECIMEN_LOT_QUANTITY',
        details: {
          specimenId,
          lotId,
          adjustmentType: dto.adjustmentType,
          quantityDelta: dto.quantityDelta,
          quantityAffected,
          previousQuantity: existing.quantity,
          resultingQuantity,
          lotDeactivated,
        },
      });

      return {
        adjustmentType: dto.adjustmentType,
        quantityDelta: dto.quantityDelta,
        previousQuantity: existing.quantity,
        resultingQuantity,
        lot: this.toEntity(updated),
        transaction: this.toTransactionEntity(transactionRecord),
        lotDeactivated,
      };
    });
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

  private async applyDimensionChange(
    transaction: Prisma.TransactionClient,
    specimenId: string,
    source: specimen_lot,
    change: LotDimensionChange,
    actingCuratorAccountId: string,
  ): Promise<SpecimenLotOperationResult> {
    if (change.quantity > source.quantity) {
      throw new BadRequestException(
        `Quantity ${change.quantity} exceeds the source lot quantity of ${source.quantity}.`,
      );
    }

    const matchingTarget = await transaction.specimen_lot.findFirst({
      where: {
        specimen_id: specimenId,
        storage_unit_id: change.targetStorageUnitId,
        condition_class: change.targetConditionClass,
        is_active: true,
        id: { not: source.id },
      },
    });

    if (
      matchingTarget &&
      matchingTarget.quantity > POSTGRES_INTEGER_MAX - change.quantity
    ) {
      throw new BadRequestException(
        'This operation would exceed the maximum supported lot quantity.',
      );
    }

    const changedAt = new Date();
    const sourceDeactivated = change.quantity === source.quantity;
    const sourceMutation = await transaction.specimen_lot.updateMany({
      where: {
        id: source.id,
        specimen_id: specimenId,
        is_active: true,
        // Match the exact value read earlier so a concurrent quantity change
        // can never be silently decremented from a stale snapshot.
        quantity: source.quantity,
      },
      data: sourceDeactivated
        ? {
            is_active: false,
            updated_by: actingCuratorAccountId,
            updated_at: changedAt,
          }
        : {
            quantity: { decrement: change.quantity },
            updated_by: actingCuratorAccountId,
            updated_at: changedAt,
          },
    });

    if (sourceMutation.count !== 1) {
      throw this.concurrentLotConflict();
    }

    let target: specimen_lot;
    if (matchingTarget) {
      const targetMutation = await transaction.specimen_lot.updateMany({
        where: {
          id: matchingTarget.id,
          specimen_id: specimenId,
          is_active: true,
          quantity: { lte: POSTGRES_INTEGER_MAX - change.quantity },
        },
        data: {
          quantity: { increment: change.quantity },
          updated_by: actingCuratorAccountId,
          updated_at: changedAt,
        },
      });
      if (targetMutation.count !== 1) {
        throw this.concurrentLotConflict();
      }
      target = await this.findLotOrThrow(
        transaction,
        specimenId,
        matchingTarget.id,
      );
    } else {
      target = await transaction.specimen_lot.create({
        data: {
          specimen_id: specimenId,
          storage_unit_id: change.targetStorageUnitId,
          condition_class: change.targetConditionClass,
          quantity: change.quantity,
          storage_notes: change.newLotStorageNotes,
          is_active: true,
          created_by: actingCuratorAccountId,
          updated_by: actingCuratorAccountId,
          created_at: changedAt,
          updated_at: changedAt,
        },
      });
    }

    const sourceAfterChange = await this.findLotOrThrow(
      transaction,
      specimenId,
      source.id,
    );
    const transactionRecord = await transaction.specimen_lot_transaction.create(
      {
        data: {
          source_lot_id: source.id,
          target_lot_id: target.id,
          transaction_type: change.operation,
          quantity_affected: change.quantity,
          adjustment_type: null,
          reason: change.reason,
          performed_by: actingCuratorAccountId,
          created_at: changedAt,
        },
      },
    );

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
        field_changed: change.revisionField,
        old_value: change.revisionOldValue,
        new_value: change.revisionNewValue,
        reason: change.reason,
        changed_at: changedAt,
        source_section: 'specimen_lot',
      },
    });
    await this.recordAudit(transaction, {
      userId: actingCuratorAccountId,
      lotId: source.id,
      action:
        change.operation === LotTransactionType.MOVEMENT
          ? 'MOVE_SPECIMEN_LOT'
          : 'CHANGE_SPECIMEN_LOT_CONDITION',
      details: {
        specimenId,
        sourceLotId: source.id,
        targetLotId: target.id,
        quantity: change.quantity,
        fromStorageUnitId: source.storage_unit_id,
        toStorageUnitId: change.targetStorageUnitId,
        fromConditionClass: source.condition_class,
        toConditionClass: change.targetConditionClass,
        sourceDeactivated,
        mergedIntoExistingTarget: Boolean(matchingTarget),
      },
    });

    return {
      operation: change.operation,
      sourceLot: this.toEntity(sourceAfterChange),
      targetLot: this.toEntity(target),
      transaction: this.toTransactionEntity(transactionRecord),
      sourceDeactivated,
      mergedIntoExistingTarget: Boolean(matchingTarget),
    };
  }

  private async runSerializableLotMutation<T>(
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= SERIALIZABLE_RETRY_LIMIT; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (!this.isRetryableTransactionError(error)) {
          throw error;
        }
        if (attempt === SERIALIZABLE_RETRY_LIMIT) {
          throw this.concurrentLotConflict();
        }
      }
    }

    throw this.concurrentLotConflict();
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

  private assertAdjustmentDirection(
    adjustmentType: QuantityAdjustmentType,
    quantityDelta: number,
  ): void {
    if (
      adjustmentType === QuantityAdjustmentType.ADDITION &&
      quantityDelta < 0
    ) {
      throw new BadRequestException(
        'ADDITION requires a positive quantityDelta.',
      );
    }
    if (DECREASE_ONLY_ADJUSTMENTS.has(adjustmentType) && quantityDelta > 0) {
      throw new BadRequestException(
        `${adjustmentType} requires a negative quantityDelta.`,
      );
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

  private isRetryableTransactionError(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === 'P2002' || error.code === 'P2034')
    );
  }

  private concurrentLotConflict(): ConflictException {
    return new ConflictException(
      'This specimen lot changed during the operation. Reload the current lots and try again.',
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
