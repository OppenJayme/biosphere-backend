import { StorageCapacityWarning } from './entities/storage-capacity.entity';

export interface StorageCapacitySnapshot {
  id: string;
  label: string;
  capacity: number | null;
}

/**
 * Returns a warning when a unit's active quantity is above its optional
 * capacity. Units without a configured capacity never warn.
 */
export function evaluateStorageCapacity(
  unit: StorageCapacitySnapshot,
  occupiedQuantity: number,
): StorageCapacityWarning | null {
  if (unit.capacity === null || occupiedQuantity <= unit.capacity) {
    return null;
  }

  return {
    storageUnitId: unit.id,
    storageUnitLabel: unit.label,
    capacity: unit.capacity,
    occupiedQuantity,
    exceededBy: occupiedQuantity - unit.capacity,
  };
}
