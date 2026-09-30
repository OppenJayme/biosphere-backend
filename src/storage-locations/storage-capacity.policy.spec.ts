import { evaluateStorageCapacity } from './storage-capacity.policy';

describe('evaluateStorageCapacity', () => {
  const unit = { id: 'unit-1', label: 'Drawer 3', capacity: 10 };

  it('warns only when occupancy is above the capacity', () => {
    expect(evaluateStorageCapacity(unit, 9)).toBeNull();
    expect(evaluateStorageCapacity(unit, 10)).toBeNull();
    expect(evaluateStorageCapacity(unit, 12)).toEqual({
      storageUnitId: 'unit-1',
      storageUnitLabel: 'Drawer 3',
      capacity: 10,
      occupiedQuantity: 12,
      exceededBy: 2,
    });
  });

  it('never warns for a unit without a configured capacity', () => {
    expect(
      evaluateStorageCapacity({ ...unit, capacity: null }, 1_000_000),
    ).toBeNull();
  });
});
