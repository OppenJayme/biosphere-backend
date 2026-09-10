/* eslint-disable @typescript-eslint/no-unsafe-assignment -- Jest asymmetric matchers are typed as any. */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { SpecimenGender, SpecimenStatus } from './entities/specimen.entity';
import { SpecimensService } from './specimens.service';

const specimenDelegate = {
  create: jest.fn(),
  findMany: jest.fn(),
  findUnique: jest.fn(),
  update: jest.fn(),
};
const collectionDelegate = { findUnique: jest.fn() };
const specimenLotDelegate = { count: jest.fn() };
const revisionDelegate = { createMany: jest.fn() };
const auditDelegate = { create: jest.fn() };
const transactionMock = jest.fn();

const prismaMock = {
  specimen: specimenDelegate,
  collection: collectionDelegate,
  specimen_lot: specimenLotDelegate,
  specimen_revision_history: revisionDelegate,
  audit_log: auditDelegate,
  $transaction: transactionMock,
};

const ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';
const SPECIMEN_ID = '33333333-3333-4333-8333-333333333333';
const COLLECTION_ID = '44444444-4444-4444-8444-444444444444';
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

describe('SpecimensService', () => {
  let service: SpecimensService;

  beforeEach(async () => {
    jest.resetAllMocks();
    transactionMock.mockImplementation(
      (callback: (transaction: typeof prismaMock) => unknown) =>
        Promise.resolve(callback(prismaMock)),
    );
    revisionDelegate.createMany.mockResolvedValue({ count: 1 });
    auditDelegate.create.mockResolvedValue({});
    specimenLotDelegate.count.mockResolvedValue(0);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SpecimensService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<SpecimensService>(SpecimensService);
  });

  it('creates an Uncataloged specimen with account attribution and an audit event', async () => {
    collectionDelegate.findUnique.mockResolvedValue({ id: COLLECTION_ID });
    specimenDelegate.create.mockResolvedValue(
      specimenRecord({ collection_id: COLLECTION_ID }),
    );

    const result = await service.create(
      {
        collectionId: COLLECTION_ID,
        specimenCategory: 'ZOOLOGY',
        scientificName: 'Testus specimenus',
        gender: SpecimenGender.UNKNOWN,
      },
      ACCOUNT_ID,
    );

    expect(collectionDelegate.findUnique).toHaveBeenCalledWith({
      where: { id: COLLECTION_ID },
      select: { id: true },
    });
    expect(specimenDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        collection_id: COLLECTION_ID,
        created_by: ACCOUNT_ID,
        updated_by: ACCOUNT_ID,
        status: 'UNCATALOGED',
        public_display_allowed: false,
      }),
    });
    expect(auditDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        user_id: ACCOUNT_ID,
        affected_record_id: SPECIMEN_ID,
        action: 'CREATE_SPECIMEN',
        status: 'SUCCESS',
      }),
    });
    expect(result).toEqual(
      expect.objectContaining({
        id: SPECIMEN_ID,
        collectionId: COLLECTION_ID,
        status: SpecimenStatus.UNCATALOGED,
      }),
    );
  });

  it('rejects a missing collection before creating the specimen', async () => {
    collectionDelegate.findUnique.mockResolvedValue(null);

    await expect(
      service.create({ collectionId: COLLECTION_ID }, ACCOUNT_ID),
    ).rejects.toThrow(NotFoundException);
    expect(specimenDelegate.create).not.toHaveBeenCalled();
  });

  it('lists active specimens newest first and maps database fields', async () => {
    specimenDelegate.findMany.mockResolvedValue([specimenRecord()]);

    await expect(service.findAll()).resolves.toEqual([
      expect.objectContaining({
        id: SPECIMEN_ID,
        specimenCategory: 'ZOOLOGY',
        scientificName: 'Testus specimenus',
      }),
    ]);
    expect(specimenDelegate.findMany).toHaveBeenCalledWith({
      where: { status: { not: 'ARCHIVED' } },
      orderBy: { created_at: 'desc' },
    });
  });

  it('throws when a specimen does not exist', async () => {
    specimenDelegate.findUnique.mockResolvedValue(null);
    await expect(service.findOne(SPECIMEN_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('persists updates with the acting account and one revision per changed field', async () => {
    specimenDelegate.findUnique.mockResolvedValue(specimenRecord());
    specimenDelegate.update.mockResolvedValue(
      specimenRecord({
        common_name: 'Updated common name',
        remarks: 'Checked',
      }),
    );

    const result = await service.update(
      SPECIMEN_ID,
      { commonName: 'Updated common name', remarks: 'Checked' },
      ACCOUNT_ID,
    );

    expect(specimenDelegate.update).toHaveBeenCalledWith({
      where: { id: SPECIMEN_ID },
      data: expect.objectContaining({
        common_name: 'Updated common name',
        remarks: 'Checked',
        updated_by: ACCOUNT_ID,
        updated_at: expect.any(Date),
      }),
    });
    expect(revisionDelegate.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          field_changed: 'common_name',
          old_value: 'Test specimen',
          new_value: 'Updated common name',
          changed_by: ACCOUNT_ID,
        }),
        expect.objectContaining({
          field_changed: 'remarks',
          old_value: null,
          new_value: 'Checked',
        }),
      ],
    });
    expect(auditDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'UPDATE_SPECIMEN' }),
    });
    expect(result.commonName).toBe('Updated common name');
  });

  it('rejects an update that does not change a value', async () => {
    specimenDelegate.findUnique.mockResolvedValue(specimenRecord());

    await expect(
      service.update(SPECIMEN_ID, { commonName: 'Test specimen' }, ACCOUNT_ID),
    ).rejects.toThrow(BadRequestException);
    expect(specimenDelegate.update).not.toHaveBeenCalled();
  });

  it('rejects edits to an archived specimen', async () => {
    specimenDelegate.findUnique.mockResolvedValue(
      specimenRecord({ status: 'ARCHIVED', archived_at: TEST_DATE }),
    );

    await expect(
      service.update(SPECIMEN_ID, { remarks: 'Changed' }, ACCOUNT_ID),
    ).rejects.toThrow(BadRequestException);
  });

  it('blocks archive while active specimen lots exist', async () => {
    specimenDelegate.findUnique.mockResolvedValue(specimenRecord());
    specimenLotDelegate.count.mockResolvedValue(1);

    await expect(service.archive(SPECIMEN_ID, ACCOUNT_ID)).rejects.toThrow(
      BadRequestException,
    );
    expect(specimenDelegate.update).not.toHaveBeenCalled();
  });

  it('archives atomically, disables public eligibility, and records history', async () => {
    specimenDelegate.findUnique.mockResolvedValue(
      specimenRecord({
        status: 'CATALOGED',
        public_display_allowed: true,
      }),
    );
    specimenDelegate.update.mockResolvedValue(
      specimenRecord({
        status: 'ARCHIVED',
        public_display_allowed: false,
        archived_by: ACCOUNT_ID,
        archived_at: TEST_DATE,
      }),
    );

    const result = await service.archive(SPECIMEN_ID, ACCOUNT_ID);

    expect(specimenDelegate.update).toHaveBeenCalledWith({
      where: { id: SPECIMEN_ID },
      data: expect.objectContaining({
        status: 'ARCHIVED',
        public_display_allowed: false,
        archived_by: ACCOUNT_ID,
        updated_by: ACCOUNT_ID,
      }),
    });
    expect(revisionDelegate.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ field_changed: 'status' }),
        expect.objectContaining({
          field_changed: 'public_display_allowed',
        }),
      ]),
    });
    expect(auditDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'ARCHIVE_SPECIMEN' }),
    });
    expect(result.status).toBe(SpecimenStatus.ARCHIVED);
  });

  it('returns an already archived specimen without rewriting its attribution', async () => {
    specimenDelegate.findUnique.mockResolvedValue(
      specimenRecord({ status: 'ARCHIVED', archived_at: TEST_DATE }),
    );

    const result = await service.archive(SPECIMEN_ID, ACCOUNT_ID);

    expect(result.status).toBe(SpecimenStatus.ARCHIVED);
    expect(specimenDelegate.update).not.toHaveBeenCalled();
    expect(auditDelegate.create).not.toHaveBeenCalled();
  });

  it('rejects public eligibility for an Uncataloged specimen', async () => {
    specimenDelegate.findUnique.mockResolvedValue(specimenRecord());

    await expect(
      service.setPublicDisplay(
        SPECIMEN_ID,
        { publicDisplay: true },
        ACCOUNT_ID,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('changes public eligibility for a Cataloged specimen and records history', async () => {
    specimenDelegate.findUnique.mockResolvedValue(
      specimenRecord({ status: 'CATALOGED' }),
    );
    specimenDelegate.update.mockResolvedValue(
      specimenRecord({ status: 'CATALOGED', public_display_allowed: true }),
    );

    const result = await service.setPublicDisplay(
      SPECIMEN_ID,
      { publicDisplay: true },
      ACCOUNT_ID,
    );

    expect(specimenDelegate.update).toHaveBeenCalledWith({
      where: { id: SPECIMEN_ID },
      data: expect.objectContaining({
        public_display_allowed: true,
        updated_by: ACCOUNT_ID,
      }),
    });
    expect(revisionDelegate.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          field_changed: 'public_display_allowed',
          old_value: 'false',
          new_value: 'true',
        }),
      ],
    });
    expect(result.publicDisplay).toBe(true);
  });
});
