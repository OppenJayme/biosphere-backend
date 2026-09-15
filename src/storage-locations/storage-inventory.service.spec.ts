import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { ListStorageInventoryQueryDto } from './dto/list-storage-inventory-query.dto';
import { StorageInventoryService } from './storage-inventory.service';

const STORAGE_ID = '11111111-1111-4111-8111-111111111111';
const LOT_ID = '22222222-2222-4222-8222-222222222222';
const SPECIMEN_ID = '33333333-3333-4333-8333-333333333333';
const ACCOUNT_ID = '44444444-4444-4444-8444-444444444444';
const TEST_DATE = new Date('2026-09-01T00:00:00.000Z');

const storageFindUnique = jest.fn();
const lotFindMany = jest.fn();
const lotAggregate = jest.fn();
const transactionMock = jest.fn();

const prismaMock = {
  storage_unit: { findUnique: storageFindUnique },
  specimen_lot: {
    findMany: lotFindMany,
    aggregate: lotAggregate,
  },
  $transaction: transactionMock,
};

const storageUnitRecord = {
  id: STORAGE_ID,
  parent_id: null,
  unit_type: 'CABINET',
  label: 'Cabinet A',
  size: null,
  storage_type: 'DRY_STORAGE',
  holds_specimens: true,
  capacity: 100,
  archived_at: null,
  created_at: TEST_DATE,
  updated_at: TEST_DATE,
};

const specimenRecord = {
  id: SPECIMEN_ID,
  collection_id: null,
  created_by: ACCOUNT_ID,
  updated_by: ACCOUNT_ID,
  archived_by: null,
  accession_number: 'USC-001',
  specimen_category: 'ZOOLOGY',
  scientific_name: 'Testus specimenus',
  common_name: 'Test specimen',
  gender: 'UNKNOWN',
  classification_status: null,
  status: 'UNCATALOGED',
  public_display_allowed: false,
  remarks: null,
  archived_at: null,
  created_at: TEST_DATE,
  updated_at: TEST_DATE,
};

const lotRecord = {
  id: LOT_ID,
  specimen_id: SPECIMEN_ID,
  storage_unit_id: STORAGE_ID,
  condition_class: 'GOOD',
  quantity: 4,
  storage_notes: null,
  is_active: true,
  created_by: ACCOUNT_ID,
  updated_by: null,
  created_at: TEST_DATE,
  updated_at: TEST_DATE,
  specimen: specimenRecord,
};

describe('StorageInventoryService', () => {
  let service: StorageInventoryService;

  beforeEach(async () => {
    jest.resetAllMocks();
    transactionMock.mockImplementation((operations: unknown[]) =>
      Promise.all(operations),
    );
    storageFindUnique.mockResolvedValue(storageUnitRecord);
    lotFindMany.mockResolvedValue([lotRecord]);
    lotAggregate.mockResolvedValue({
      _count: { id: 1 },
      _sum: { quantity: 4 },
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageInventoryService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    service = module.get(StorageInventoryService);
  });

  it('returns paginated direct active-lot inventory and whole-unit totals', async () => {
    const query = Object.assign(new ListStorageInventoryQueryDto(), {
      page: 2,
      limit: 25,
    });

    const result = await service.findForStorageUnit(STORAGE_ID, query);

    expect(lotFindMany).toHaveBeenCalledWith({
      where: { storage_unit_id: STORAGE_ID, is_active: true },
      include: { specimen: true },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      skip: 25,
      take: 25,
    });
    expect(result).toEqual({
      storageUnit: expect.objectContaining({
        id: STORAGE_ID,
        label: 'Cabinet A',
      }),
      items: [
        {
          lot: expect.objectContaining({ id: LOT_ID, quantity: 4 }),
          specimen: expect.objectContaining({
            id: SPECIMEN_ID,
            scientificName: 'Testus specimenus',
          }),
        },
      ],
      totalLots: 1,
      totalQuantity: 4,
      page: 2,
      limit: 25,
    });
  });

  it('returns empty inventory and zero quantity without fabricating records', async () => {
    lotFindMany.mockResolvedValue([]);
    lotAggregate.mockResolvedValue({
      _count: { id: 0 },
      _sum: { quantity: null },
    });

    await expect(
      service.findForStorageUnit(
        STORAGE_ID,
        new ListStorageInventoryQueryDto(),
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        items: [],
        totalLots: 0,
        totalQuantity: 0,
        page: 1,
        limit: 50,
      }),
    );
  });

  it('returns a clear not-found error for an unknown storage unit', async () => {
    storageFindUnique.mockResolvedValue(null);

    await expect(
      service.findForStorageUnit(
        STORAGE_ID,
        new ListStorageInventoryQueryDto(),
      ),
    ).rejects.toThrow(
      new NotFoundException(`Storage unit ${STORAGE_ID} not found`),
    );
  });
});
