import { Prisma } from '../generated/prisma/client';
import {
  LotTransactionType,
  QuantityAdjustmentType,
} from './entities/specimen-lot-transaction.entity';
import { SpecimenLotHistoryEntry } from './entities/specimen-lot-history.entity';

const LOT_SIDE_SELECT = {
  select: { specimen_id: true, storage_unit_id: true, condition_class: true },
} satisfies Prisma.specimen_lotDefaultArgs;

export const LOT_HISTORY_INCLUDE = {
  user_account: { select: { full_name: true } },
  specimen_lot_specimen_lot_transaction_source_lot_idTospecimen_lot:
    LOT_SIDE_SELECT,
  specimen_lot_specimen_lot_transaction_target_lot_idTospecimen_lot:
    LOT_SIDE_SELECT,
} satisfies Prisma.specimen_lot_transactionInclude;

export type LotHistoryRecord = Prisma.specimen_lot_transactionGetPayload<{
  include: typeof LOT_HISTORY_INCLUDE;
}>;

export const LOT_HISTORY_ORDER_BY = [
  { created_at: 'desc' },
  { id: 'desc' },
] satisfies Prisma.specimen_lot_transactionOrderByWithRelationInput[];

/** Transactions whose source or target lot matches the lot filter. */
export function touchingLots(
  lotFilter: Prisma.specimen_lotWhereInput,
): Prisma.specimen_lot_transactionWhereInput {
  return {
    OR: [
      {
        specimen_lot_specimen_lot_transaction_source_lot_idTospecimen_lot: {
          is: lotFilter,
        },
      },
      {
        specimen_lot_specimen_lot_transaction_target_lot_idTospecimen_lot: {
          is: lotFilter,
        },
      },
    ],
  };
}

/**
 * A lot never changes its storage unit or condition after creation (moves
 * and condition changes produce or merge into another lot), so the source
 * and target lots give the before and after location and condition.
 */
export function toLotHistoryEntry(
  item: LotHistoryRecord,
): SpecimenLotHistoryEntry {
  const source =
    item.specimen_lot_specimen_lot_transaction_source_lot_idTospecimen_lot;
  const target =
    item.specimen_lot_specimen_lot_transaction_target_lot_idTospecimen_lot;

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
    specimenId: (source ?? target)?.specimen_id ?? null,
    performedByName: item.user_account.full_name,
    fromStorageUnitId: source?.storage_unit_id ?? null,
    toStorageUnitId: target?.storage_unit_id ?? null,
    fromConditionClass: source?.condition_class ?? null,
    toConditionClass: target?.condition_class ?? null,
  };
}
