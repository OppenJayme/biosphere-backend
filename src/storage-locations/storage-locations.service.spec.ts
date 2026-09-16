import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageUnitLifecycleFilter } from './dto/search-storage-locations-query.dto';
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
const auditDelegate = {
  create: jest.fn(),
};
const transactionMock = jest.fn();

const prismaMock = {
  storage_unit: storageUnitDelegate,
  storage_movement_history: movementDelegate,
  specimen_lot: specimenLotDelegate,
  audit_log: auditDelegate,
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
      (
        operation:
          Promise<unknown>[] | ((transaction: typeof prismaMock) => unknown),
      ) =>
        Array.isArray(operation)
          ? Promise.all(operation)
          : Promise.resolve(operation(prismaMock)),
    );
    auditDelegate.create.mockResolvedValue({});

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
      service.create(
        {
          label: 'Cabinet A',
          unitType: 'CABINET',
          storageType: 'DRY_STORAGE',
          capacity: 100,
        },
        'account-1',
      ),
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
    expect(auditDelegate.create).toHaveBeenCalledWith({
      data: {
        user_id: 'account-1',
        affected_record_id: 'unit-1',
        affected_record_type: 'storage_unit',
        action: 'CREATE_STORAGE_UNIT',
        module: 'storage_locations',
        details: {
          parentId: null,
          unitType: 'CABINET',
          storageType: 'DRY_STORAGE',
        },
        status: 'SUCCESS',
      },
    });
  });

  it('rejects a missing parent during creation', async () => {
    storageUnitDelegate.findUnique.mockResolvedValue(null);

    await expect(
      service.create(
        {
          label: 'Drawer 1',
          unitType: 'DRAWER',
          storageType: 'DRY_STORAGE',
          parentId: 'missing-parent',
        },
        'account-1',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(storageUnitDelegate.create).not.toHaveBeenCalled();
  });

  it('rejects an archived parent during creation', async () => {
    storageUnitDelegate.findUnique.mockResolvedValue(
      storageUnitRecord({ id: 'parent-1', archived_at: TEST_DATE }),
    );

    await expect(
      service.create(
        {
          label: 'Drawer 1',
          unitType: 'DRAWER',
          storageType: 'DRY_STORAGE',
          parentId: 'parent-1',
        },
        'account-1',
      ),
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

  it('searches active storage units with bounded filters and stable ordering', async () => {
    storageUnitDelegate.findMany.mockResolvedValue([
      storageUnitRecord({ id: 'unit-2', label: 'Cabinet B' }),
    ]);
    storageUnitDelegate.count.mockResolvedValue(1);

    const result = await service.search({
      search: 'cabinet',
      unitType: 'cabinet',
      storageType: 'dry_storage',
      holdsSpecimens: true,
      lifecycle: StorageUnitLifecycleFilter.ACTIVE,
      page: 2,
      limit: 25,
    });

    const expectedWhere = {
      label: {
        contains: 'cabinet',
        mode: Prisma.QueryMode.insensitive,
      },
      unit_type: {
        equals: 'cabinet',
        mode: Prisma.QueryMode.insensitive,
      },
      storage_type: {
        equals: 'dry_storage',
        mode: Prisma.QueryMode.insensitive,
      },
      holds_specimens: true,
      archived_at: null,
    };
    expect(storageUnitDelegate.findMany).toHaveBeenCalledWith({
      where: expectedWhere,
      orderBy: [{ label: 'asc' }, { id: 'asc' }],
      skip: 25,
      take: 25,
    });
    expect(storageUnitDelegate.count).toHaveBeenCalledWith({
      where: expectedWhere,
    });
    expect(result).toEqual({
      items: [expect.objectContaining({ id: 'unit-2', label: 'Cabinet B' })],
      total: 1,
      page: 2,
      limit: 25,
    });
  });

  it('supports archived-only and all-lifecycle storage searches', async () => {
    storageUnitDelegate.findMany.mockResolvedValue([]);
    storageUnitDelegate.count.mockResolvedValue(0);

    await service.search({
      lifecycle: StorageUnitLifecycleFilter.ARCHIVED,
      page: 1,
      limit: 25,
    });
    expect(storageUnitDelegate.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          archived_at: { not: null },
        }) as object,
      }) as object,
    );

    await service.search({
      lifecycle: StorageUnitLifecycleFilter.ALL,
      page: 1,
      limit: 25,
    });
    expect(storageUnitDelegate.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ archived_at: undefined }) as object,
      }) as object,
    );
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

    const result = await service.update(
      'unit-1',
      { label: 'Cabinet A1' },
      'account-1',
    );

    expect(result.label).toBe('Cabinet A1');
    expect(storageUnitDelegate.update).toHaveBeenCalledWith({
      where: { id: 'unit-1' },
      data: {
        label: 'Cabinet A1',
        updated_at: expect.any(Date) as Date,
      },
    });
    expect(auditDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        user_id: 'account-1',
        affected_record_id: 'unit-1',
        action: 'UPDATE_STORAGE_UNIT',
        details: { fields: ['label'] },
      }) as Record<string, unknown>,
    });
  });

  it('rejects empty, identical, and archived-unit updates', async () => {
    storageUnitDelegate.findUnique.mockResolvedValueOnce(storageUnitRecord());
    await expect(
      service.update('unit-1', {}, 'account-1'),
    ).rejects.toBeInstanceOf(BadRequestException);

    storageUnitDelegate.findUnique.mockResolvedValueOnce(storageUnitRecord());
    await expect(
      service.update('unit-1', { label: 'Cabinet A' }, 'account-1'),
    ).rejects.toBeInstanceOf(BadRequestException);

    storageUnitDelegate.findUnique.mockResolvedValueOnce(
      storageUnitRecord({ archived_at: TEST_DATE }),
    );
    await expect(
      service.update('unit-1', { label: 'Changed' }, 'account-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(auditDelegate.create).not.toHaveBeenCalled();
  });

  it('does not disable specimen storage while active lots remain', async () => {
    storageUnitDelegate.findUnique.mockResolvedValue(
      storageUnitRecord({ holds_specimens: true }),
    );
    specimenLotDelegate.count.mockResolvedValue(1);

    await expect(
      service.update('unit-1', { holdsSpecimens: false }, 'account-1'),
    ).rejects.toThrow('active specimen lots before disabling');
    expect(storageUnitDelegate.update).not.toHaveBeenCalled();
    expect(auditDelegate.create).not.toHaveBeenCalled();
  });

  it('allows disabling specimen storage after active lots are cleared', async () => {
    storageUnitDelegate.findUnique.mockResolvedValue(
      storageUnitRecord({ holds_specimens: true }),
    );
    specimenLotDelegate.count.mockResolvedValue(0);
    storageUnitDelegate.update.mockImplementation(
      ({ data }: { data: { holds_specimens: boolean } }) =>
        storageUnitRecord({ holds_specimens: data.holds_specimens }),
    );

    await expect(
      service.update('unit-1', { holdsSpecimens: false }, 'account-1'),
    ).resolves.toHaveProperty('holdsSpecimens', false);
    expect(auditDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        details: { fields: ['holdsSpecimens'] },
      }) as Record<string, unknown>,
    });
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
    expect(auditDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        user_id: 'account-1',
        affected_record_id: 'unit-1',
        action: 'MOVE_STORAGE_UNIT',
        details: {
          fromParentId: 'old-parent',
          toParentId: 'new-parent',
          reason: 'Reorganized collection',
        },
      }) as Record<string, unknown>,
    });
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(transactionMock).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
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

    await expect(service.archive('unit-1', 'account-1')).rejects.toThrow(
      'active children first',
    );
    expect(specimenLotDelegate.count).not.toHaveBeenCalled();

    storageUnitDelegate.count.mockResolvedValueOnce(0);
    specimenLotDelegate.count.mockResolvedValueOnce(1);

    await expect(service.archive('unit-1', 'account-1')).rejects.toThrow(
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

    const archived = await service.archive('unit-1', 'account-1');
    expect(archived.archivedAt).toBeInstanceOf(Date);

    storageUnitDelegate.findUnique.mockResolvedValueOnce(
      storageUnitRecord({ archived_at: TEST_DATE }),
    );
    await expect(
      service.archive('unit-1', 'account-1'),
    ).resolves.toHaveProperty('archivedAt', TEST_DATE);
    expect(storageUnitDelegate.update).toHaveBeenCalledTimes(1);
    expect(auditDelegate.create).toHaveBeenCalledTimes(1);
    expect(auditDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        user_id: 'account-1',
        affected_record_id: 'unit-1',
        action: 'ARCHIVE_STORAGE_UNIT',
        details: { previousParentId: null },
      }) as Record<string, unknown>,
    });
  });

  it('returns a conflict after exhausting serializable transaction retries', async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError(
      'Write conflict',
      { code: 'P2034', clientVersion: '7.10.0' },
    );
    transactionMock.mockRejectedValue(conflict);

    await expect(service.archive('unit-1', 'account-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(transactionMock).toHaveBeenCalledTimes(3);
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
