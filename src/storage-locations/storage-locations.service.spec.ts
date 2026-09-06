import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { StorageLocationsService } from './storage-locations.service';

const storageUnitDelegate = {
  create: jest.fn(),
  findMany: jest.fn(),
  findUnique: jest.fn(),
  update: jest.fn(),
  count: jest.fn(),
};
const movementDelegate = {
  create: jest.fn(),
  findMany: jest.fn(),
};
const specimenLotDelegate = {
  count: jest.fn(),
};
const transactionMock = jest.fn();

const prismaMock = {
  storage_unit: storageUnitDelegate,
  storage_movement_history: movementDelegate,
  specimen_lot: specimenLotDelegate,
  $transaction: transactionMock,
};

const TEST_DATE = new Date('2026-01-01T00:00:00.000Z');

function storageUnitRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'unit-1',
    parent_id: null,
    unit_type: 'CABINET',
    label: 'Cabinet A',
    size: null,
    storage_type: 'DRY_STORAGE',
    created_at: TEST_DATE,
    updated_at: TEST_DATE,
    holds_specimens: false,
    capacity: 100,
    archived_at: null,
    ...overrides,
  };
}

describe('StorageLocationsService', () => {
  let service: StorageLocationsService;

  beforeEach(async () => {
    jest.resetAllMocks();
    transactionMock.mockImplementation(
      (callback: (transaction: typeof prismaMock) => unknown) =>
        Promise.resolve(callback(prismaMock)),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageLocationsService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<StorageLocationsService>(StorageLocationsService);
  });

  it('creates and maps a root storage unit', async () => {
    storageUnitDelegate.create.mockResolvedValue(storageUnitRecord());

    await expect(
      service.create({
        label: 'Cabinet A',
        unitType: 'CABINET',
        storageType: 'DRY_STORAGE',
        capacity: 100,
      }),
    ).resolves.toEqual({
      id: 'unit-1',
      parentId: null,
      unitType: 'CABINET',
      label: 'Cabinet A',
      size: null,
      storageType: 'DRY_STORAGE',
      holdsSpecimens: false,
      capacity: 100,
      archivedAt: null,
      createdAt: TEST_DATE,
      updatedAt: TEST_DATE,
    });
    expect(storageUnitDelegate.create).toHaveBeenCalledWith({
      data: {
        parent_id: undefined,
        unit_type: 'CABINET',
        label: 'Cabinet A',
        size: undefined,
        storage_type: 'DRY_STORAGE',
        holds_specimens: undefined,
        capacity: 100,
      },
    });
  });

  it('rejects a missing parent during creation', async () => {
    storageUnitDelegate.findUnique.mockResolvedValue(null);

    await expect(
      service.create({
        label: 'Drawer 1',
        unitType: 'DRAWER',
        storageType: 'DRY_STORAGE',
        parentId: 'missing-parent',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(storageUnitDelegate.create).not.toHaveBeenCalled();
  });

  it('rejects an archived parent during creation', async () => {
    storageUnitDelegate.findUnique.mockResolvedValue(
      storageUnitRecord({ id: 'parent-1', archived_at: TEST_DATE }),
    );

    await expect(
      service.create({
        label: 'Drawer 1',
        unitType: 'DRAWER',
        storageType: 'DRY_STORAGE',
        parentId: 'parent-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lists units using stable ordering and camelCase responses', async () => {
    storageUnitDelegate.findMany.mockResolvedValue([
      storageUnitRecord(),
      storageUnitRecord({ id: 'unit-2', label: 'Cabinet B' }),
    ]);

    const result = await service.findAll();

    expect(storageUnitDelegate.findMany).toHaveBeenCalledWith({
      orderBy: [{ label: 'asc' }, { created_at: 'asc' }],
    });
    expect(result.map((unit) => unit.id)).toEqual(['unit-1', 'unit-2']);
    expect(result[0]).toHaveProperty('storageType', 'DRY_STORAGE');
    expect(result[0]).not.toHaveProperty('storage_type');
  });

  it('lists direct children after confirming the parent exists', async () => {
    storageUnitDelegate.findUnique.mockResolvedValue(storageUnitRecord());
    storageUnitDelegate.findMany.mockResolvedValue([
      storageUnitRecord({ id: 'child-1', parent_id: 'unit-1' }),
    ]);

    const result = await service.findChildren('unit-1');

    expect(storageUnitDelegate.findMany).toHaveBeenCalledWith({
      where: { parent_id: 'unit-1' },
      orderBy: [{ label: 'asc' }, { created_at: 'asc' }],
    });
    expect(result[0].parentId).toBe('unit-1');
  });

  it('updates an active unit and refreshes updated_at', async () => {
    storageUnitDelegate.findUnique.mockResolvedValue(storageUnitRecord());
    storageUnitDelegate.update.mockImplementation(
      ({ data }: { data: { label: string; updated_at: Date } }) =>
        storageUnitRecord({ label: data.label, updated_at: data.updated_at }),
    );

    const result = await service.update('unit-1', { label: 'Cabinet A1' });

    expect(result.label).toBe('Cabinet A1');
    expect(storageUnitDelegate.update).toHaveBeenCalledWith({
      where: { id: 'unit-1' },
      data: {
        label: 'Cabinet A1',
        updated_at: expect.any(Date) as Date,
      },
    });
  });

  it('rejects empty updates and changes to archived units', async () => {
    storageUnitDelegate.findUnique.mockResolvedValueOnce(storageUnitRecord());
    await expect(service.update('unit-1', {})).rejects.toBeInstanceOf(
      BadRequestException,
    );

    storageUnitDelegate.findUnique.mockResolvedValueOnce(
      storageUnitRecord({ archived_at: TEST_DATE }),
    );
    await expect(
      service.update('unit-1', { label: 'Changed' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('moves a unit atomically and records the internal account id', async () => {
    storageUnitDelegate.findUnique
      .mockResolvedValueOnce(storageUnitRecord({ parent_id: 'old-parent' }))
      .mockResolvedValueOnce(storageUnitRecord({ id: 'new-parent' }))
      .mockResolvedValueOnce({ parent_id: null });
    storageUnitDelegate.update.mockResolvedValue(
      storageUnitRecord({ parent_id: 'new-parent' }),
    );
    movementDelegate.create.mockResolvedValue({});

    const result = await service.move(
      'unit-1',
      { newParentId: 'new-parent', reason: 'Reorganized collection' },
      'account-1',
    );

    expect(result.parentId).toBe('new-parent');
    expect(movementDelegate.create).toHaveBeenCalledWith({
      data: {
        storage_unit_id: 'unit-1',
        from_storage_unit_id: 'old-parent',
        to_storage_unit_id: 'new-parent',
        moved_by: 'account-1',
        reason: 'Reorganized collection',
      },
    });
    expect(transactionMock).toHaveBeenCalledTimes(1);
  });

  it('allows moving a unit to the hierarchy root', async () => {
    storageUnitDelegate.findUnique.mockResolvedValue(
      storageUnitRecord({ parent_id: 'old-parent' }),
    );
    storageUnitDelegate.update.mockResolvedValue(
      storageUnitRecord({ parent_id: null }),
    );
    movementDelegate.create.mockResolvedValue({});

    await expect(
      service.move('unit-1', { newParentId: null }, 'account-1'),
    ).resolves.toHaveProperty('parentId', null);
    expect(movementDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        from_storage_unit_id: 'old-parent',
        to_storage_unit_id: null,
      }) as Record<string, unknown>,
    });
  });

  it('rejects self-parenting, no-op moves, and descendant-parenting', async () => {
    storageUnitDelegate.findUnique.mockResolvedValueOnce(storageUnitRecord());
    await expect(
      service.move('unit-1', { newParentId: 'unit-1' }, 'account-1'),
    ).rejects.toBeInstanceOf(BadRequestException);

    storageUnitDelegate.findUnique.mockResolvedValueOnce(
      storageUnitRecord({ parent_id: 'parent-1' }),
    );
    await expect(
      service.move('unit-1', { newParentId: 'parent-1' }, 'account-1'),
    ).rejects.toBeInstanceOf(BadRequestException);

    storageUnitDelegate.findUnique
      .mockResolvedValueOnce(storageUnitRecord())
      .mockResolvedValueOnce(storageUnitRecord({ id: 'descendant-1' }))
      .mockResolvedValueOnce({ parent_id: 'unit-1' });
    await expect(
      service.move('unit-1', { newParentId: 'descendant-1' }, 'account-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(movementDelegate.create).not.toHaveBeenCalled();
  });

  it('blocks archiving while active children or specimen lots remain', async () => {
    storageUnitDelegate.findUnique.mockResolvedValue(storageUnitRecord());
    storageUnitDelegate.count.mockResolvedValueOnce(1);

    await expect(service.archive('unit-1')).rejects.toThrow(
      'active children first',
    );
    expect(specimenLotDelegate.count).not.toHaveBeenCalled();

    storageUnitDelegate.count.mockResolvedValueOnce(0);
    specimenLotDelegate.count.mockResolvedValueOnce(1);

    await expect(service.archive('unit-1')).rejects.toThrow(
      'active specimen lots first',
    );
    expect(storageUnitDelegate.update).not.toHaveBeenCalled();
  });

  it('archives an empty unit and treats repeated archive calls as idempotent', async () => {
    storageUnitDelegate.findUnique.mockResolvedValueOnce(storageUnitRecord());
    storageUnitDelegate.count.mockResolvedValue(0);
    specimenLotDelegate.count.mockResolvedValue(0);
    storageUnitDelegate.update.mockImplementation(
      ({ data }: { data: { archived_at: Date; updated_at: Date } }) =>
        storageUnitRecord({
          archived_at: data.archived_at,
          updated_at: data.updated_at,
        }),
    );

    const archived = await service.archive('unit-1');
    expect(archived.archivedAt).toBeInstanceOf(Date);

    storageUnitDelegate.findUnique.mockResolvedValueOnce(
      storageUnitRecord({ archived_at: TEST_DATE }),
    );
    await expect(service.archive('unit-1')).resolves.toHaveProperty(
      'archivedAt',
      TEST_DATE,
    );
    expect(storageUnitDelegate.update).toHaveBeenCalledTimes(1);
  });

  it('returns movement history as camelCase', async () => {
    storageUnitDelegate.findUnique.mockResolvedValue(storageUnitRecord());
    movementDelegate.findMany.mockResolvedValue([
      {
        id: 'movement-1',
        storage_unit_id: 'unit-1',
        from_storage_unit_id: 'old-parent',
        to_storage_unit_id: 'new-parent',
        moved_by: 'account-1',
        moved_at: TEST_DATE,
        reason: 'Reorganized collection',
      },
    ]);

    await expect(service.findMovementHistory('unit-1')).resolves.toEqual([
      {
        id: 'movement-1',
        storageUnitId: 'unit-1',
        fromStorageUnitId: 'old-parent',
        toStorageUnitId: 'new-parent',
        movedBy: 'account-1',
        movedAt: TEST_DATE,
        reason: 'Reorganized collection',
      },
    ]);
  });
});
