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
  updateMany: jest.fn(),
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
const TARGET_STORAGE_UNIT_ID = '66666666-6666-4666-8666-666666666666';
const TARGET_LOT_ID = '77777777-7777-4777-8777-777777777777';
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
    lotDelegate.updateMany.mockResolvedValue({ count: 1 });
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

  it('partially moves a lot into a new target while preserving quantity and history', async () => {
    const source = lotRecord({ quantity: 10 });
    const sourceAfter = lotRecord({ quantity: 6 });
    const target = lotRecord({
      id: TARGET_LOT_ID,
      storage_unit_id: TARGET_STORAGE_UNIT_ID,
      quantity: 4,
      storage_notes: null,
    });
    lotDelegate.findFirst
      .mockResolvedValueOnce(source)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(sourceAfter);
    lotDelegate.create.mockResolvedValueOnce(target);
    lotTransactionDelegate.create.mockResolvedValueOnce(
      transactionRecord({
        source_lot_id: LOT_ID,
        target_lot_id: TARGET_LOT_ID,
        transaction_type: 'MOVEMENT',
        quantity_affected: 4,
        adjustment_type: null,
        reason: 'Reorganized freezer inventory',
      }),
    );

    const result = await service.move(
      SPECIMEN_ID,
      LOT_ID,
      {
        targetStorageUnitId: TARGET_STORAGE_UNIT_ID,
        quantity: 4,
        reason: 'Reorganized freezer inventory',
      },
      ACCOUNT_ID,
    );

    expect(storageUnitDelegate.findUnique).toHaveBeenCalledWith({
      where: { id: TARGET_STORAGE_UNIT_ID },
      select: { id: true, holds_specimens: true, archived_at: true },
    });
    expect(lotDelegate.updateMany).toHaveBeenCalledWith({
      where: {
        id: LOT_ID,
        specimen_id: SPECIMEN_ID,
        is_active: true,
        quantity: 10,
      },
      data: {
        quantity: { decrement: 4 },
        updated_by: ACCOUNT_ID,
        updated_at: expect.any(Date),
      },
    });
    expect(lotDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        specimen_id: SPECIMEN_ID,
        storage_unit_id: TARGET_STORAGE_UNIT_ID,
        condition_class: 'GOOD',
        quantity: 4,
        storage_notes: null,
        is_active: true,
      }),
    });
    expect(lotTransactionDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        source_lot_id: LOT_ID,
        target_lot_id: TARGET_LOT_ID,
        transaction_type: 'MOVEMENT',
        quantity_affected: 4,
        adjustment_type: null,
        performed_by: ACCOUNT_ID,
      }),
    });
    expect(revisionDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        field_changed: 'storage_unit_id',
        old_value: STORAGE_UNIT_ID,
        new_value: TARGET_STORAGE_UNIT_ID,
        source_section: 'specimen_lot',
      }),
    });
    expect(result).toEqual(
      expect.objectContaining({
        operation: 'MOVEMENT',
        sourceLot: expect.objectContaining({ quantity: 6, isActive: true }),
        targetLot: expect.objectContaining({
          id: TARGET_LOT_ID,
          quantity: 4,
        }),
        sourceDeactivated: false,
        mergedIntoExistingTarget: false,
      }),
    );
    expect(transactionMock).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
  });

  it('fully moves a source into an existing target while retaining its history', async () => {
    const source = lotRecord({ quantity: 10 });
    const matchingTarget = lotRecord({
      id: TARGET_LOT_ID,
      storage_unit_id: TARGET_STORAGE_UNIT_ID,
      quantity: 5,
    });
    const targetAfter = { ...matchingTarget, quantity: 15 };
    const sourceAfter = { ...source, is_active: false };
    lotDelegate.findFirst
      .mockResolvedValueOnce(source)
      .mockResolvedValueOnce(matchingTarget)
      .mockResolvedValueOnce(targetAfter)
      .mockResolvedValueOnce(sourceAfter);
    lotTransactionDelegate.create.mockResolvedValueOnce(
      transactionRecord({
        source_lot_id: LOT_ID,
        target_lot_id: TARGET_LOT_ID,
        transaction_type: 'MOVEMENT',
        quantity_affected: 10,
        adjustment_type: null,
      }),
    );

    const result = await service.move(
      SPECIMEN_ID,
      LOT_ID,
      { targetStorageUnitId: TARGET_STORAGE_UNIT_ID, quantity: 10 },
      ACCOUNT_ID,
    );

    expect(lotDelegate.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        id: LOT_ID,
        specimen_id: SPECIMEN_ID,
        is_active: true,
        quantity: 10,
      },
      data: {
        is_active: false,
        updated_by: ACCOUNT_ID,
        updated_at: expect.any(Date),
      },
    });
    expect(lotDelegate.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: TARGET_LOT_ID,
        specimen_id: SPECIMEN_ID,
        is_active: true,
        quantity: { lte: 2147483637 },
      },
      data: {
        quantity: { increment: 10 },
        updated_by: ACCOUNT_ID,
        updated_at: expect.any(Date),
      },
    });
    expect(lotDelegate.create).not.toHaveBeenCalled();
    expect(result.sourceDeactivated).toBe(true);
    expect(result.mergedIntoExistingTarget).toBe(true);
    expect(result.sourceLot.isActive).toBe(false);
    expect(result.targetLot.quantity).toBe(15);
  });

  it('partially changes condition and preserves storage notes on a new lot', async () => {
    const source = lotRecord({
      quantity: 10,
      storage_notes: 'Drawer 2, rear compartment',
    });
    const sourceAfter = { ...source, quantity: 7 };
    const target = lotRecord({
      id: TARGET_LOT_ID,
      condition_class: 'FAIR',
      quantity: 3,
      storage_notes: 'Drawer 2, rear compartment',
    });
    lotDelegate.findFirst
      .mockResolvedValueOnce(source)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(sourceAfter);
    lotDelegate.create.mockResolvedValueOnce(target);
    lotTransactionDelegate.create.mockResolvedValueOnce(
      transactionRecord({
        source_lot_id: LOT_ID,
        target_lot_id: TARGET_LOT_ID,
        transaction_type: 'CONDITION_CHANGE',
        quantity_affected: 3,
        adjustment_type: null,
        reason: 'Minor preservation damage observed',
      }),
    );

    const result = await service.changeCondition(
      SPECIMEN_ID,
      LOT_ID,
      {
        targetConditionClass: 'FAIR',
        quantity: 3,
        reason: 'Minor preservation damage observed',
      },
      ACCOUNT_ID,
    );

    expect(lotDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        storage_unit_id: STORAGE_UNIT_ID,
        condition_class: 'FAIR',
        quantity: 3,
        storage_notes: 'Drawer 2, rear compartment',
      }),
    });
    expect(revisionDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        field_changed: 'condition_class',
        old_value: 'GOOD',
        new_value: 'FAIR',
      }),
    });
    expect(result.operation).toBe('CONDITION_CHANGE');
    expect(result.sourceLot.quantity).toBe(7);
    expect(result.targetLot.conditionClass).toBe('FAIR');
  });

  it('rejects overdraw and unchanged dimensions before mutating quantity', async () => {
    lotDelegate.findFirst.mockResolvedValueOnce(lotRecord({ quantity: 5 }));
    await expect(
      service.move(
        SPECIMEN_ID,
        LOT_ID,
        { targetStorageUnitId: TARGET_STORAGE_UNIT_ID, quantity: 6 },
        ACCOUNT_ID,
      ),
    ).rejects.toThrow(BadRequestException);

    lotDelegate.findFirst.mockResolvedValueOnce(lotRecord());
    await expect(
      service.move(
        SPECIMEN_ID,
        LOT_ID,
        { targetStorageUnitId: STORAGE_UNIT_ID, quantity: 1 },
        ACCOUNT_ID,
      ),
    ).rejects.toThrow(BadRequestException);

    lotDelegate.findFirst.mockResolvedValueOnce(lotRecord());
    await expect(
      service.changeCondition(
        SPECIMEN_ID,
        LOT_ID,
        { targetConditionClass: 'GOOD', quantity: 1 },
        ACCOUNT_ID,
      ),
    ).rejects.toThrow(BadRequestException);

    expect(lotDelegate.updateMany).not.toHaveBeenCalled();
    expect(lotTransactionDelegate.create).not.toHaveBeenCalled();
  });

  it('rejects stale concurrent lot changes instead of risking an overdraw', async () => {
    lotDelegate.findFirst
      .mockResolvedValueOnce(lotRecord({ quantity: 10 }))
      .mockResolvedValueOnce(null);
    lotDelegate.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      service.move(
        SPECIMEN_ID,
        LOT_ID,
        { targetStorageUnitId: TARGET_STORAGE_UNIT_ID, quantity: 4 },
        ACCOUNT_ID,
      ),
    ).rejects.toThrow(ConflictException);

    expect(lotDelegate.create).not.toHaveBeenCalled();
    expect(lotTransactionDelegate.create).not.toHaveBeenCalled();
  });

  it('retries a serializable write conflict before applying the operation', async () => {
    transactionMock
      .mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('Write conflict', {
          code: 'P2034',
          clientVersion: '7.10.0',
        }),
      )
      .mockImplementationOnce(
        (callback: (transaction: typeof prismaMock) => unknown) =>
          Promise.resolve(callback(prismaMock)),
      );
    const source = lotRecord({ quantity: 10 });
    const sourceAfter = lotRecord({ quantity: 8 });
    const target = lotRecord({
      id: TARGET_LOT_ID,
      storage_unit_id: TARGET_STORAGE_UNIT_ID,
      quantity: 2,
      storage_notes: null,
    });
    lotDelegate.findFirst
      .mockResolvedValueOnce(source)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(sourceAfter);
    lotDelegate.create.mockResolvedValueOnce(target);
    lotTransactionDelegate.create.mockResolvedValueOnce(
      transactionRecord({
        source_lot_id: LOT_ID,
        target_lot_id: TARGET_LOT_ID,
        transaction_type: 'MOVEMENT',
        quantity_affected: 2,
        adjustment_type: null,
      }),
    );

    await expect(
      service.move(
        SPECIMEN_ID,
        LOT_ID,
        { targetStorageUnitId: TARGET_STORAGE_UNIT_ID, quantity: 2 },
        ACCOUNT_ID,
      ),
    ).resolves.toEqual(expect.objectContaining({ operation: 'MOVEMENT' }));
    expect(transactionMock).toHaveBeenCalledTimes(2);
    expect(lotTransactionDelegate.create).toHaveBeenCalledTimes(1);
  });

  it('retries a concurrent target-creation race and merges into the winner', async () => {
    const source = lotRecord({ quantity: 10 });
    const matchingTarget = lotRecord({
      id: TARGET_LOT_ID,
      storage_unit_id: TARGET_STORAGE_UNIT_ID,
      quantity: 2,
    });
    const targetAfter = { ...matchingTarget, quantity: 5 };
    const sourceAfter = { ...source, quantity: 7 };
    lotDelegate.findFirst
      // First attempt: another transaction creates the target after this read.
      .mockResolvedValueOnce(source)
      .mockResolvedValueOnce(null)
      // Retry: the winning target is now visible and receives the quantity.
      .mockResolvedValueOnce(source)
      .mockResolvedValueOnce(matchingTarget)
      .mockResolvedValueOnce(targetAfter)
      .mockResolvedValueOnce(sourceAfter);
    lotDelegate.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '7.10.0',
      }),
    );
    lotTransactionDelegate.create.mockResolvedValueOnce(
      transactionRecord({
        source_lot_id: LOT_ID,
        target_lot_id: TARGET_LOT_ID,
        transaction_type: 'MOVEMENT',
        quantity_affected: 3,
        adjustment_type: null,
      }),
    );

    const result = await service.move(
      SPECIMEN_ID,
      LOT_ID,
      { targetStorageUnitId: TARGET_STORAGE_UNIT_ID, quantity: 3 },
      ACCOUNT_ID,
    );

    expect(transactionMock).toHaveBeenCalledTimes(2);
    expect(result.mergedIntoExistingTarget).toBe(true);
    expect(result.sourceLot.quantity).toBe(7);
    expect(result.targetLot.quantity).toBe(5);
  });

  it('adds quantity with target-side history and complete audit attribution', async () => {
    const existing = lotRecord({ quantity: 10 });
    const updated = lotRecord({ quantity: 15 });
    lotDelegate.findFirst
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce(updated);
    lotTransactionDelegate.create.mockResolvedValueOnce(
      transactionRecord({
        source_lot_id: null,
        target_lot_id: LOT_ID,
        quantity_affected: 5,
        adjustment_type: 'ADDITION',
        reason: 'Newly verified specimens',
      }),
    );

    const result = await service.adjustQuantity(
      SPECIMEN_ID,
      LOT_ID,
      {
        adjustmentType: 'ADDITION',
        quantityDelta: 5,
        expectedQuantity: 10,
        reason: 'Newly verified specimens',
      },
      ACCOUNT_ID,
    );

    expect(lotDelegate.updateMany).toHaveBeenCalledWith({
      where: {
        id: LOT_ID,
        specimen_id: SPECIMEN_ID,
        is_active: true,
        quantity: 10,
      },
      data: {
        quantity: 15,
        updated_by: ACCOUNT_ID,
        updated_at: expect.any(Date),
      },
    });
    expect(lotTransactionDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        source_lot_id: null,
        target_lot_id: LOT_ID,
        transaction_type: 'QUANTITY_ADJUSTMENT',
        quantity_affected: 5,
        adjustment_type: 'ADDITION',
        reason: 'Newly verified specimens',
      }),
    });
    expect(revisionDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        field_changed: 'quantity',
        old_value: '10',
        new_value: '15',
        reason: 'Newly verified specimens',
      }),
    });
    expect(auditDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'ADJUST_SPECIMEN_LOT_QUANTITY',
        details: expect.objectContaining({
          quantityDelta: 5,
          previousQuantity: 10,
          resultingQuantity: 15,
        }),
      }),
    });
    expect(result).toEqual(
      expect.objectContaining({
        adjustmentType: 'ADDITION',
        quantityDelta: 5,
        previousQuantity: 10,
        resultingQuantity: 15,
        lotDeactivated: false,
      }),
    );
    expect(storageUnitDelegate.findUnique).toHaveBeenCalledWith({
      where: { id: STORAGE_UNIT_ID },
      select: { id: true, holds_specimens: true, archived_at: true },
    });
  });

  it('rejects increases in storage that no longer accepts specimens', async () => {
    lotDelegate.findFirst.mockResolvedValueOnce(lotRecord({ quantity: 10 }));
    storageUnitDelegate.findUnique.mockResolvedValueOnce({
      id: STORAGE_UNIT_ID,
      holds_specimens: false,
      archived_at: null,
    });

    await expect(
      service.adjustQuantity(
        SPECIMEN_ID,
        LOT_ID,
        {
          adjustmentType: 'ADDITION',
          quantityDelta: 1,
          expectedQuantity: 10,
          reason: 'New specimens received',
        },
        ACCOUNT_ID,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(lotDelegate.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a stale expected quantity before applying an adjustment', async () => {
    lotDelegate.findFirst.mockResolvedValueOnce(lotRecord({ quantity: 10 }));

    await expect(
      service.adjustQuantity(
        SPECIMEN_ID,
        LOT_ID,
        {
          adjustmentType: 'REMOVAL',
          quantityDelta: -2,
          expectedQuantity: 12,
          reason: 'Remove duplicate records',
        },
        ACCOUNT_ID,
      ),
    ).rejects.toThrow(ConflictException);
    expect(storageUnitDelegate.findUnique).not.toHaveBeenCalled();
    expect(lotDelegate.updateMany).not.toHaveBeenCalled();
    expect(lotTransactionDelegate.create).not.toHaveBeenCalled();
  });

  it('partially removes quantity with source-side history', async () => {
    const existing = lotRecord({ quantity: 10 });
    const updated = lotRecord({ quantity: 7 });
    lotDelegate.findFirst
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce(updated);
    lotTransactionDelegate.create.mockResolvedValueOnce(
      transactionRecord({
        source_lot_id: LOT_ID,
        target_lot_id: null,
        quantity_affected: 3,
        adjustment_type: 'REMOVAL',
      }),
    );

    const result = await service.adjustQuantity(
      SPECIMEN_ID,
      LOT_ID,
      {
        adjustmentType: 'REMOVAL',
        quantityDelta: -3,
        expectedQuantity: 10,
        reason: 'Duplicate count removed',
      },
      ACCOUNT_ID,
    );

    expect(lotDelegate.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ quantity: 7 }),
      }),
    );
    expect(lotTransactionDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        source_lot_id: LOT_ID,
        target_lot_id: null,
        quantity_affected: 3,
        adjustment_type: 'REMOVAL',
      }),
    });
    expect(result.resultingQuantity).toBe(7);
    expect(result.lotDeactivated).toBe(false);
    expect(storageUnitDelegate.findUnique).not.toHaveBeenCalled();
  });

  it('deactivates a fully depleted lot while retaining its stored historical quantity', async () => {
    const existing = lotRecord({ quantity: 10 });
    const updated = lotRecord({ quantity: 10, is_active: false });
    lotDelegate.findFirst
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce(updated);
    lotTransactionDelegate.create.mockResolvedValueOnce(
      transactionRecord({
        source_lot_id: LOT_ID,
        target_lot_id: null,
        quantity_affected: 10,
        adjustment_type: 'DEACCESSION',
      }),
    );

    const result = await service.adjustQuantity(
      SPECIMEN_ID,
      LOT_ID,
      {
        adjustmentType: 'DEACCESSION',
        quantityDelta: -10,
        expectedQuantity: 10,
        reason: 'Approved deaccession',
      },
      ACCOUNT_ID,
    );

    expect(lotDelegate.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          is_active: false,
          updated_by: ACCOUNT_ID,
          updated_at: expect.any(Date),
        },
      }),
    );
    expect(result.resultingQuantity).toBe(0);
    expect(result.lot.quantity).toBe(10);
    expect(result.lot.isActive).toBe(false);
    expect(result.lotDeactivated).toBe(true);
  });

  it('allows a verified data correction to adjust quantity downward', async () => {
    const existing = lotRecord({ quantity: 10 });
    const updated = lotRecord({ quantity: 8 });
    lotDelegate.findFirst
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce(updated);
    lotTransactionDelegate.create.mockResolvedValueOnce(
      transactionRecord({
        source_lot_id: LOT_ID,
        target_lot_id: null,
        quantity_affected: 2,
        adjustment_type: 'DATA_CORRECTION',
        reason: 'Verified physical recount',
      }),
    );

    const result = await service.adjustQuantity(
      SPECIMEN_ID,
      LOT_ID,
      {
        adjustmentType: 'DATA_CORRECTION',
        quantityDelta: -2,
        expectedQuantity: 10,
        reason: 'Verified physical recount',
      },
      ACCOUNT_ID,
    );

    expect(lotTransactionDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        source_lot_id: LOT_ID,
        target_lot_id: null,
        quantity_affected: 2,
        adjustment_type: 'DATA_CORRECTION',
      }),
    });
    expect(result.resultingQuantity).toBe(8);
  });

  it('enforces adjustment direction, quantity bounds, and active-lot state', async () => {
    await expect(
      service.adjustQuantity(
        SPECIMEN_ID,
        LOT_ID,
        {
          adjustmentType: 'ADDITION',
          quantityDelta: -1,
          expectedQuantity: 10,
          reason: 'Invalid direction',
        },
        ACCOUNT_ID,
      ),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.adjustQuantity(
        SPECIMEN_ID,
        LOT_ID,
        {
          adjustmentType: 'DESTRUCTION',
          quantityDelta: 1,
          expectedQuantity: 10,
          reason: 'Invalid direction',
        },
        ACCOUNT_ID,
      ),
    ).rejects.toThrow(BadRequestException);

    lotDelegate.findFirst.mockResolvedValueOnce(lotRecord({ quantity: 2 }));
    await expect(
      service.adjustQuantity(
        SPECIMEN_ID,
        LOT_ID,
        {
          adjustmentType: 'MISSING_LOSS',
          quantityDelta: -3,
          expectedQuantity: 2,
          reason: 'Inventory check',
        },
        ACCOUNT_ID,
      ),
    ).rejects.toThrow(BadRequestException);

    lotDelegate.findFirst.mockResolvedValueOnce(
      lotRecord({ quantity: 2_147_483_647 }),
    );
    await expect(
      service.adjustQuantity(
        SPECIMEN_ID,
        LOT_ID,
        {
          adjustmentType: 'DATA_CORRECTION',
          quantityDelta: 1,
          expectedQuantity: 2_147_483_647,
          reason: 'Correct verified count',
        },
        ACCOUNT_ID,
      ),
    ).rejects.toThrow(BadRequestException);

    lotDelegate.findFirst.mockResolvedValueOnce(
      lotRecord({ is_active: false }),
    );
    await expect(
      service.adjustQuantity(
        SPECIMEN_ID,
        LOT_ID,
        {
          adjustmentType: 'DATA_CORRECTION',
          quantityDelta: -1,
          expectedQuantity: 10,
          reason: 'Correct verified count',
        },
        ACCOUNT_ID,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(lotDelegate.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a stale concurrent quantity adjustment', async () => {
    lotDelegate.findFirst.mockResolvedValueOnce(lotRecord({ quantity: 10 }));
    lotDelegate.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      service.adjustQuantity(
        SPECIMEN_ID,
        LOT_ID,
        {
          adjustmentType: 'TRANSFER_OUT',
          quantityDelta: -2,
          expectedQuantity: 10,
          reason: 'Approved external transfer',
        },
        ACCOUNT_ID,
      ),
    ).rejects.toThrow(ConflictException);
    expect(lotTransactionDelegate.create).not.toHaveBeenCalled();
  });

  it('retries a serialization failure without duplicating an adjustment', async () => {
    transactionMock
      .mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('Write conflict', {
          code: 'P2034',
          clientVersion: '7.10.0',
        }),
      )
      .mockImplementationOnce(
        (callback: (transaction: typeof prismaMock) => unknown) =>
          Promise.resolve(callback(prismaMock)),
      );
    lotDelegate.findFirst
      .mockResolvedValueOnce(lotRecord({ quantity: 10 }))
      .mockResolvedValueOnce(lotRecord({ quantity: 8 }));
    lotTransactionDelegate.create.mockResolvedValueOnce(
      transactionRecord({
        source_lot_id: LOT_ID,
        target_lot_id: null,
        quantity_affected: 2,
        adjustment_type: 'REMOVAL',
      }),
    );

    await expect(
      service.adjustQuantity(
        SPECIMEN_ID,
        LOT_ID,
        {
          adjustmentType: 'REMOVAL',
          quantityDelta: -2,
          expectedQuantity: 10,
          reason: 'Verified duplicate count',
        },
        ACCOUNT_ID,
      ),
    ).resolves.toEqual(expect.objectContaining({ resultingQuantity: 8 }));
    expect(transactionMock).toHaveBeenCalledTimes(2);
    expect(lotDelegate.updateMany).toHaveBeenCalledTimes(1);
    expect(lotTransactionDelegate.create).toHaveBeenCalledTimes(1);
  });

  it('returns Conflict after the serializable retry limit is exhausted', async () => {
    transactionMock.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Write conflict', {
        code: 'P2034',
        clientVersion: '7.10.0',
      }),
    );

    await expect(
      service.adjustQuantity(
        SPECIMEN_ID,
        LOT_ID,
        {
          adjustmentType: 'REMOVAL',
          quantityDelta: -2,
          expectedQuantity: 10,
          reason: 'Verified duplicate count',
        },
        ACCOUNT_ID,
      ),
    ).rejects.toThrow(ConflictException);
    expect(transactionMock).toHaveBeenCalledTimes(3);
    expect(lotDelegate.updateMany).not.toHaveBeenCalled();
    expect(lotTransactionDelegate.create).not.toHaveBeenCalled();
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
