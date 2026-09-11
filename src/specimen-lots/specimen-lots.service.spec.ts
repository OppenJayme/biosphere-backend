/* eslint-disable @typescript-eslint/no-unsafe-assignment -- Jest asymmetric matchers are typed as any. */
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SpecimenLotsService } from './specimen-lots.service';

const specimenDelegate = { findUnique: jest.fn(), update: jest.fn() };
const storageUnitDelegate = { findUnique: jest.fn() };
const lotDelegate = {
  aggregate: jest.fn(),
  create: jest.fn(),
  findFirst: jest.fn(),
  findMany: jest.fn(),
  update: jest.fn(),
};
const lotTransactionDelegate = {
  count: jest.fn(),
  create: jest.fn(),
  findMany: jest.fn(),
};
const revisionDelegate = { create: jest.fn() };
const auditDelegate = { create: jest.fn() };
const transactionMock = jest.fn();

const prismaMock = {
  specimen: specimenDelegate,
  storage_unit: storageUnitDelegate,
  specimen_lot: lotDelegate,
  specimen_lot_transaction: lotTransactionDelegate,
  specimen_revision_history: revisionDelegate,
  audit_log: auditDelegate,
  $transaction: transactionMock,
};

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const SPECIMEN_ID = '22222222-2222-4222-8222-222222222222';
const STORAGE_UNIT_ID = '33333333-3333-4333-8333-333333333333';
const LOT_ID = '44444444-4444-4444-8444-444444444444';
const TRANSACTION_ID = '55555555-5555-4555-8555-555555555555';
const TEST_DATE = new Date('2026-01-01T00:00:00.000Z');

function specimenRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: SPECIMEN_ID,
    collection_id: null,
    created_by: ACCOUNT_ID,
    updated_by: ACCOUNT_ID,
    archived_by: null,
    accession_number: null,
    specimen_category: 'ZOOLOGY',
    scientific_name: 'Testus specimenus',
    common_name: 'Test specimen',
    gender: 'UNKNOWN',
    classification_status: null,
    status: 'UNCATALOGED',
    public_display_allowed: false,
    remarks: null,
    created_at: TEST_DATE,
    updated_at: TEST_DATE,
    archived_at: null,
    ...overrides,
  };
}

function lotRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: LOT_ID,
    specimen_id: SPECIMEN_ID,
    storage_unit_id: STORAGE_UNIT_ID,
    condition_class: 'GOOD',
    quantity: 10,
    storage_notes: null,
    is_active: true,
    created_by: ACCOUNT_ID,
    updated_by: ACCOUNT_ID,
    created_at: TEST_DATE,
    updated_at: TEST_DATE,
    ...overrides,
  };
}

function transactionRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: TRANSACTION_ID,
    source_lot_id: null,
    target_lot_id: LOT_ID,
    transaction_type: 'QUANTITY_ADJUSTMENT',
    quantity_affected: 10,
    adjustment_type: 'ADDITION',
    reason: 'Initial inventory count',
    performed_by: ACCOUNT_ID,
    created_at: TEST_DATE,
    ...overrides,
  };
}

describe('SpecimenLotsService', () => {
  let service: SpecimenLotsService;

  beforeEach(async () => {
    jest.resetAllMocks();
    transactionMock.mockImplementation(
      (callback: (transaction: typeof prismaMock) => unknown) =>
        Promise.resolve(callback(prismaMock)),
    );
    specimenDelegate.findUnique.mockResolvedValue(specimenRecord());
    specimenDelegate.update.mockResolvedValue(specimenRecord());
    storageUnitDelegate.findUnique.mockResolvedValue({
      id: STORAGE_UNIT_ID,
      holds_specimens: true,
      archived_at: null,
    });
    lotDelegate.findFirst.mockResolvedValue(null);
    lotDelegate.create.mockResolvedValue(lotRecord());
    lotTransactionDelegate.create.mockResolvedValue(transactionRecord());
    auditDelegate.create.mockResolvedValue({});
    revisionDelegate.create.mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SpecimenLotsService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<SpecimenLotsService>(SpecimenLotsService);
  });

  it('creates an active lot with an initial Addition transaction and attribution', async () => {
    const result = await service.create(
      SPECIMEN_ID,
      {
        storageUnitId: STORAGE_UNIT_ID,
        conditionClass: 'GOOD',
        quantity: 10,
        storageNotes: 'Cabinet inventory count',
        reason: 'Initial inventory count',
      },
      ACCOUNT_ID,
    );

    expect(storageUnitDelegate.findUnique).toHaveBeenCalledWith({
      where: { id: STORAGE_UNIT_ID },
      select: { id: true, holds_specimens: true, archived_at: true },
    });
    expect(lotDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        specimen_id: SPECIMEN_ID,
        storage_unit_id: STORAGE_UNIT_ID,
        condition_class: 'GOOD',
        quantity: 10,
        is_active: true,
        created_by: ACCOUNT_ID,
        updated_by: ACCOUNT_ID,
      }),
    });
    expect(lotTransactionDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        source_lot_id: null,
        target_lot_id: LOT_ID,
        transaction_type: 'QUANTITY_ADJUSTMENT',
        adjustment_type: 'ADDITION',
        quantity_affected: 10,
        reason: 'Initial inventory count',
        performed_by: ACCOUNT_ID,
      }),
    });
    expect(specimenDelegate.update).toHaveBeenCalledWith({
      where: { id: SPECIMEN_ID },
      data: {
        updated_by: ACCOUNT_ID,
        updated_at: expect.any(Date),
      },
    });
    expect(auditDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        affected_record_id: LOT_ID,
        affected_record_type: 'specimen_lot',
        action: 'CREATE_SPECIMEN_LOT',
        status: 'SUCCESS',
      }),
    });
    expect(result).toEqual(
      expect.objectContaining({
        id: LOT_ID,
        specimenId: SPECIMEN_ID,
        storageUnitId: STORAGE_UNIT_ID,
        quantity: 10,
        isActive: true,
      }),
    );
  });

  it('rejects a missing or archived specimen', async () => {
    specimenDelegate.findUnique.mockResolvedValueOnce(null);
    await expect(
      service.create(
        SPECIMEN_ID,
        {
          storageUnitId: STORAGE_UNIT_ID,
          conditionClass: 'GOOD',
          quantity: 1,
        },
        ACCOUNT_ID,
      ),
    ).rejects.toThrow(NotFoundException);

    specimenDelegate.findUnique.mockResolvedValueOnce(
      specimenRecord({ status: 'ARCHIVED', archived_at: TEST_DATE }),
    );
    await expect(
      service.create(
        SPECIMEN_ID,
        {
          storageUnitId: STORAGE_UNIT_ID,
          conditionClass: 'GOOD',
          quantity: 1,
        },
        ACCOUNT_ID,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(lotDelegate.create).not.toHaveBeenCalled();
  });

  it('rejects a missing, archived, or non-holding storage unit', async () => {
    storageUnitDelegate.findUnique.mockResolvedValueOnce(null);
    await expect(
      service.create(
        SPECIMEN_ID,
        {
          storageUnitId: STORAGE_UNIT_ID,
          conditionClass: 'GOOD',
          quantity: 1,
        },
        ACCOUNT_ID,
      ),
    ).rejects.toThrow(NotFoundException);

    storageUnitDelegate.findUnique.mockResolvedValueOnce({
      id: STORAGE_UNIT_ID,
      holds_specimens: true,
      archived_at: TEST_DATE,
    });
    await expect(
      service.create(
        SPECIMEN_ID,
        {
          storageUnitId: STORAGE_UNIT_ID,
          conditionClass: 'GOOD',
          quantity: 1,
        },
        ACCOUNT_ID,
      ),
    ).rejects.toThrow(BadRequestException);

    storageUnitDelegate.findUnique.mockResolvedValueOnce({
      id: STORAGE_UNIT_ID,
      holds_specimens: false,
      archived_at: null,
    });
    await expect(
      service.create(
        SPECIMEN_ID,
        {
          storageUnitId: STORAGE_UNIT_ID,
          conditionClass: 'GOOD',
          quantity: 1,
        },
        ACCOUNT_ID,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(lotDelegate.create).not.toHaveBeenCalled();
  });

  it('rejects a matching active lot instead of bypassing adjustment history', async () => {
    lotDelegate.findFirst.mockResolvedValue({ id: LOT_ID });

    await expect(
      service.create(
        SPECIMEN_ID,
        {
          storageUnitId: STORAGE_UNIT_ID,
          conditionClass: 'GOOD',
          quantity: 2,
        },
        ACCOUNT_ID,
      ),
    ).rejects.toThrow(ConflictException);
    expect(lotDelegate.create).not.toHaveBeenCalled();
    expect(lotTransactionDelegate.create).not.toHaveBeenCalled();
  });

  it('maps a concurrent active-lot uniqueness race to Conflict', async () => {
    lotDelegate.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '7.10.0',
      }),
    );

    await expect(
      service.create(
        SPECIMEN_ID,
        {
          storageUnitId: STORAGE_UNIT_ID,
          conditionClass: 'GOOD',
          quantity: 2,
        },
        ACCOUNT_ID,
      ),
    ).rejects.toThrow(ConflictException);
    expect(lotTransactionDelegate.create).not.toHaveBeenCalled();
  });

  it('lists only active lots in stable order', async () => {
    lotDelegate.findMany.mockResolvedValue([lotRecord()]);

    await expect(service.findActive(SPECIMEN_ID)).resolves.toEqual([
      expect.objectContaining({ id: LOT_ID, quantity: 10 }),
    ]);
    expect(lotDelegate.findMany).toHaveBeenCalledWith({
      where: { specimen_id: SPECIMEN_ID, is_active: true },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
    });
  });

  it('retrieves a lot only when it belongs to the specimen', async () => {
    lotDelegate.findFirst.mockResolvedValue(lotRecord({ is_active: false }));

    await expect(service.findOne(SPECIMEN_ID, LOT_ID)).resolves.toEqual(
      expect.objectContaining({ id: LOT_ID, isActive: false }),
    );
    expect(lotDelegate.findFirst).toHaveBeenCalledWith({
      where: { id: LOT_ID, specimen_id: SPECIMEN_ID },
    });

    lotDelegate.findFirst.mockResolvedValueOnce(null);
    await expect(service.findOne(SPECIMEN_ID, LOT_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('calculates total quantity from active lots instead of storing it', async () => {
    lotDelegate.aggregate.mockResolvedValue({
      _count: { id: 3 },
      _sum: { quantity: 27 },
    });

    await expect(service.summarize(SPECIMEN_ID)).resolves.toEqual({
      specimenId: SPECIMEN_ID,
      activeLotCount: 3,
      totalQuantity: 27,
    });
    expect(lotDelegate.aggregate).toHaveBeenCalledWith({
      where: { specimen_id: SPECIMEN_ID, is_active: true },
      _count: { id: true },
      _sum: { quantity: true },
    });
  });

  it('returns zero totals when no active lots exist', async () => {
    lotDelegate.aggregate.mockResolvedValue({
      _count: { id: 0 },
      _sum: { quantity: null },
    });

    await expect(service.summarize(SPECIMEN_ID)).resolves.toEqual({
      specimenId: SPECIMEN_ID,
      activeLotCount: 0,
      totalQuantity: 0,
    });
  });

  it('returns paginated source-or-target transaction history', async () => {
    lotDelegate.findFirst.mockResolvedValue(lotRecord());
    lotTransactionDelegate.findMany.mockResolvedValue([transactionRecord()]);
    lotTransactionDelegate.count.mockResolvedValue(1);

    await expect(
      service.findTransactions(SPECIMEN_ID, LOT_ID, { page: 2, limit: 10 }),
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: TRANSACTION_ID,
          targetLotId: LOT_ID,
          transactionType: 'QUANTITY_ADJUSTMENT',
          adjustmentType: 'ADDITION',
        }),
      ],
      page: 2,
      limit: 10,
      total: 1,
    });
    expect(lotTransactionDelegate.findMany).toHaveBeenCalledWith({
      where: {
        OR: [{ source_lot_id: LOT_ID }, { target_lot_id: LOT_ID }],
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      skip: 10,
      take: 10,
    });
  });

  it('updates notes atomically without exposing quantity, condition, or location edits', async () => {
    lotDelegate.findFirst.mockResolvedValue(lotRecord());
    lotDelegate.update.mockResolvedValue(
      lotRecord({ storage_notes: 'Shelf checked' }),
    );

    const result = await service.updateNotes(
      SPECIMEN_ID,
      LOT_ID,
      { storageNotes: 'Shelf checked' },
      ACCOUNT_ID,
    );

    expect(lotDelegate.update).toHaveBeenCalledWith({
      where: { id: LOT_ID },
      data: {
        storage_notes: 'Shelf checked',
        updated_by: ACCOUNT_ID,
        updated_at: expect.any(Date),
      },
    });
    expect(revisionDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        specimen_id: SPECIMEN_ID,
        changed_by: ACCOUNT_ID,
        field_changed: 'storage_notes',
        old_value: null,
        new_value: 'Shelf checked',
        source_section: 'specimen_lot',
      }),
    });
    expect(auditDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'UPDATE_SPECIMEN_LOT_NOTES' }),
    });
    expect(result.storageNotes).toBe('Shelf checked');
  });

  it('rejects unchanged notes and edits to inactive lots', async () => {
    lotDelegate.findFirst.mockResolvedValueOnce(
      lotRecord({ storage_notes: 'Already checked' }),
    );
    await expect(
      service.updateNotes(
        SPECIMEN_ID,
        LOT_ID,
        { storageNotes: 'Already checked' },
        ACCOUNT_ID,
      ),
    ).rejects.toThrow(BadRequestException);

    lotDelegate.findFirst.mockResolvedValueOnce(
      lotRecord({ is_active: false }),
    );
    await expect(
      service.updateNotes(
        SPECIMEN_ID,
        LOT_ID,
        { storageNotes: 'Changed' },
        ACCOUNT_ID,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(lotDelegate.update).not.toHaveBeenCalled();
  });
});
