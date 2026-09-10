/* eslint-disable @typescript-eslint/no-unsafe-assignment -- Jest asymmetric matchers are typed as any. */
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { SpecimenProvenanceService } from './specimen-provenance.service';

const specimenDelegate = {
  findUnique: jest.fn(),
  update: jest.fn(),
};
const provenanceDelegate = {
  create: jest.fn(),
  findUnique: jest.fn(),
  update: jest.fn(),
};
const revisionDelegate = { createMany: jest.fn() };
const auditDelegate = { create: jest.fn() };
const transactionMock = jest.fn();

const prismaMock = {
  specimen: specimenDelegate,
  specimen_provenance: provenanceDelegate,
  specimen_revision_history: revisionDelegate,
  audit_log: auditDelegate,
  $transaction: transactionMock,
};

const ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';
const SPECIMEN_ID = '33333333-3333-4333-8333-333333333333';
const TEST_DATE = new Date('2026-01-01T00:00:00.000Z');
const COLLECTION_DATE = new Date('2020-05-17T00:00:00.000Z');

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

function provenanceRecord(overrides: Record<string, unknown> = {}) {
  return {
    specimen_id: SPECIMEN_ID,
    collector: 'Dr. Maria Santos',
    donor: null,
    collection_date: COLLECTION_DATE,
    collection_location: 'Cebu, Philippines',
    preservation_type: 'Wet specimen',
    preservation_method: '70% ethanol',
    updated_at: TEST_DATE,
    ...overrides,
  };
}

describe('SpecimenProvenanceService', () => {
  let service: SpecimenProvenanceService;

  beforeEach(async () => {
    jest.resetAllMocks();
    transactionMock.mockImplementation(
      (callback: (transaction: typeof prismaMock) => unknown) =>
        Promise.resolve(callback(prismaMock)),
    );
    specimenDelegate.findUnique.mockResolvedValue(specimenRecord());
    specimenDelegate.update.mockResolvedValue(specimenRecord());
    revisionDelegate.createMany.mockResolvedValue({ count: 1 });
    auditDelegate.create.mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SpecimenProvenanceService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<SpecimenProvenanceService>(SpecimenProvenanceService);
  });

  it('creates provenance atomically with normalized date, attribution, revisions, and audit', async () => {
    provenanceDelegate.findUnique.mockResolvedValue(null);
    provenanceDelegate.create.mockResolvedValue(provenanceRecord());

    const result = await service.create(
      SPECIMEN_ID,
      {
        collector: 'Dr. Maria Santos',
        collectionDate: '2020-05-17',
        collectionLocation: 'Cebu, Philippines',
        preservationType: 'Wet specimen',
        preservationMethod: '70% ethanol',
      },
      ACCOUNT_ID,
    );

    expect(provenanceDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        specimen_id: SPECIMEN_ID,
        collector: 'Dr. Maria Santos',
        collection_date: COLLECTION_DATE,
        collection_location: 'Cebu, Philippines',
        preservation_type: 'Wet specimen',
        preservation_method: '70% ethanol',
        updated_at: expect.any(Date),
      }),
    });
    expect(specimenDelegate.update).toHaveBeenCalledWith({
      where: { id: SPECIMEN_ID },
      data: { updated_by: ACCOUNT_ID, updated_at: expect.any(Date) },
    });
    expect(revisionDelegate.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          field_changed: 'collector',
          new_value: 'Dr. Maria Santos',
          source_section: 'specimen_provenance',
        }),
        expect.objectContaining({
          field_changed: 'collection_date',
          old_value: null,
          new_value: '2020-05-17',
        }),
      ]),
    });
    expect(auditDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'CREATE_SPECIMEN_PROVENANCE',
        affected_record_id: SPECIMEN_ID,
        status: 'SUCCESS',
      }),
    });
    expect(result).toEqual(
      expect.objectContaining({
        specimenId: SPECIMEN_ID,
        collectionDate: '2020-05-17',
        preservationMethod: '70% ethanol',
      }),
    );
  });

  it('rejects an empty provenance instead of creating an all-null row', async () => {
    provenanceDelegate.findUnique.mockResolvedValue(null);

    await expect(service.create(SPECIMEN_ID, {}, ACCOUNT_ID)).rejects.toThrow(
      BadRequestException,
    );
    expect(provenanceDelegate.create).not.toHaveBeenCalled();
  });

  it('rejects a second provenance row for the same specimen', async () => {
    provenanceDelegate.findUnique.mockResolvedValue(provenanceRecord());

    await expect(
      service.create(
        SPECIMEN_ID,
        { collector: 'Another collector' },
        ACCOUNT_ID,
      ),
    ).rejects.toThrow(ConflictException);
    expect(provenanceDelegate.create).not.toHaveBeenCalled();
  });

  it('rejects provenance creation for an archived specimen', async () => {
    specimenDelegate.findUnique.mockResolvedValue(
      specimenRecord({ status: 'ARCHIVED', archived_at: TEST_DATE }),
    );

    await expect(
      service.create(
        SPECIMEN_ID,
        { collector: 'Dr. Maria Santos' },
        ACCOUNT_ID,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(provenanceDelegate.findUnique).not.toHaveBeenCalled();
  });

  it('retrieves provenance and returns a date-only API value', async () => {
    provenanceDelegate.findUnique.mockResolvedValue(provenanceRecord());

    await expect(service.findOne(SPECIMEN_ID)).resolves.toEqual(
      expect.objectContaining({
        specimenId: SPECIMEN_ID,
        collector: 'Dr. Maria Santos',
        collectionDate: '2020-05-17',
      }),
    );
  });

  it('distinguishes a missing specimen from missing provenance', async () => {
    specimenDelegate.findUnique.mockResolvedValueOnce(null);
    await expect(service.findOne(SPECIMEN_ID)).rejects.toThrow(
      `Specimen ${SPECIMEN_ID} not found`,
    );

    specimenDelegate.findUnique.mockResolvedValueOnce(specimenRecord());
    provenanceDelegate.findUnique.mockResolvedValueOnce(null);
    await expect(service.findOne(SPECIMEN_ID)).rejects.toThrow(
      `Provenance for specimen ${SPECIMEN_ID} not found`,
    );
  });

  it('updates changed fields and permits clearing nullable data', async () => {
    provenanceDelegate.findUnique.mockResolvedValue(provenanceRecord());
    provenanceDelegate.update.mockResolvedValue(
      provenanceRecord({ donor: 'USC Alumni', collection_date: null }),
    );

    const result = await service.update(
      SPECIMEN_ID,
      { donor: 'USC Alumni', collectionDate: null },
      ACCOUNT_ID,
    );

    expect(provenanceDelegate.update).toHaveBeenCalledWith({
      where: { specimen_id: SPECIMEN_ID },
      data: {
        donor: 'USC Alumni',
        collection_date: null,
        updated_at: expect.any(Date),
      },
    });
    expect(revisionDelegate.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          field_changed: 'donor',
          old_value: null,
          new_value: 'USC Alumni',
        }),
        expect.objectContaining({
          field_changed: 'collection_date',
          old_value: '2020-05-17',
          new_value: null,
        }),
      ]),
    });
    expect(auditDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'UPDATE_SPECIMEN_PROVENANCE' }),
    });
    expect(result).toEqual(
      expect.objectContaining({ donor: 'USC Alumni', collectionDate: null }),
    );
  });

  it('rejects updates that do not change provenance', async () => {
    provenanceDelegate.findUnique.mockResolvedValue(provenanceRecord());

    await expect(
      service.update(
        SPECIMEN_ID,
        { collector: 'Dr. Maria Santos', collectionDate: '2020-05-17' },
        ACCOUNT_ID,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(provenanceDelegate.update).not.toHaveBeenCalled();
  });

  it('rejects updates when provenance does not exist', async () => {
    provenanceDelegate.findUnique.mockResolvedValue(null);

    await expect(
      service.update(
        SPECIMEN_ID,
        { collector: 'Dr. Maria Santos' },
        ACCOUNT_ID,
      ),
    ).rejects.toThrow(NotFoundException);
    expect(provenanceDelegate.update).not.toHaveBeenCalled();
  });

  it('rejects provenance updates for an archived specimen', async () => {
    specimenDelegate.findUnique.mockResolvedValue(
      specimenRecord({ status: 'ARCHIVED', archived_at: TEST_DATE }),
    );

    await expect(
      service.update(
        SPECIMEN_ID,
        { collector: 'Another collector' },
        ACCOUNT_ID,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(provenanceDelegate.findUnique).not.toHaveBeenCalled();
  });
});
