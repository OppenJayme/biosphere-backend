/* eslint-disable @typescript-eslint/no-unsafe-assignment -- Jest asymmetric matchers are typed as any. */
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { SpecimenTaxonomyService } from './specimen-taxonomy.service';

const specimenDelegate = {
  findUnique: jest.fn(),
  update: jest.fn(),
};
const taxonomyDelegate = {
  create: jest.fn(),
  findUnique: jest.fn(),
  update: jest.fn(),
};
const revisionDelegate = { createMany: jest.fn() };
const auditDelegate = { create: jest.fn() };
const transactionMock = jest.fn();

const prismaMock = {
  specimen: specimenDelegate,
  specimen_taxonomy: taxonomyDelegate,
  specimen_revision_history: revisionDelegate,
  audit_log: auditDelegate,
  $transaction: transactionMock,
};

const ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';
const SPECIMEN_ID = '33333333-3333-4333-8333-333333333333';
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

function taxonomyRecord(overrides: Record<string, unknown> = {}) {
  return {
    specimen_id: SPECIMEN_ID,
    kingdom: 'Animalia',
    phylum: 'Chordata',
    class: 'Mammalia',
    order_name: null,
    family: null,
    genus: null,
    species: null,
    habitat: null,
    ecological_role: null,
    conservation_status: null,
    ...overrides,
  };
}

describe('SpecimenTaxonomyService', () => {
  let service: SpecimenTaxonomyService;

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
        SpecimenTaxonomyService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<SpecimenTaxonomyService>(SpecimenTaxonomyService);
  });

  it('creates taxonomy atomically with parent attribution, revisions, and audit', async () => {
    taxonomyDelegate.findUnique.mockResolvedValue(null);
    taxonomyDelegate.create.mockResolvedValue(taxonomyRecord());

    const result = await service.create(
      SPECIMEN_ID,
      { kingdom: 'Animalia', phylum: 'Chordata', class: 'Mammalia' },
      ACCOUNT_ID,
    );

    expect(taxonomyDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        specimen_id: SPECIMEN_ID,
        kingdom: 'Animalia',
        phylum: 'Chordata',
        class: 'Mammalia',
        order_name: null,
      }),
    });
    expect(specimenDelegate.update).toHaveBeenCalledWith({
      where: { id: SPECIMEN_ID },
      data: {
        updated_by: ACCOUNT_ID,
        updated_at: expect.any(Date),
      },
    });
    expect(revisionDelegate.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          specimen_id: SPECIMEN_ID,
          changed_by: ACCOUNT_ID,
          field_changed: 'kingdom',
          old_value: null,
          new_value: 'Animalia',
          source_section: 'specimen_taxonomy',
        }),
      ]),
    });
    expect(auditDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'CREATE_SPECIMEN_TAXONOMY',
        affected_record_id: SPECIMEN_ID,
        status: 'SUCCESS',
      }),
    });
    expect(result).toEqual(
      expect.objectContaining({
        specimenId: SPECIMEN_ID,
        orderName: null,
        kingdom: 'Animalia',
      }),
    );
  });

  it('rejects an empty taxonomy instead of creating an all-null row', async () => {
    taxonomyDelegate.findUnique.mockResolvedValue(null);

    await expect(service.create(SPECIMEN_ID, {}, ACCOUNT_ID)).rejects.toThrow(
      BadRequestException,
    );
    expect(taxonomyDelegate.create).not.toHaveBeenCalled();
  });

  it('rejects a second taxonomy row for the same specimen', async () => {
    taxonomyDelegate.findUnique.mockResolvedValue(taxonomyRecord());

    await expect(
      service.create(SPECIMEN_ID, { kingdom: 'Animalia' }, ACCOUNT_ID),
    ).rejects.toThrow(ConflictException);
    expect(taxonomyDelegate.create).not.toHaveBeenCalled();
  });

  it('rejects taxonomy creation for an archived specimen', async () => {
    specimenDelegate.findUnique.mockResolvedValue(
      specimenRecord({ status: 'ARCHIVED', archived_at: TEST_DATE }),
    );

    await expect(
      service.create(SPECIMEN_ID, { kingdom: 'Animalia' }, ACCOUNT_ID),
    ).rejects.toThrow(BadRequestException);
    expect(taxonomyDelegate.findUnique).not.toHaveBeenCalled();
  });

  it('retrieves and maps taxonomy for an existing specimen', async () => {
    taxonomyDelegate.findUnique.mockResolvedValue(
      taxonomyRecord({ order_name: 'Primates' }),
    );

    await expect(service.findOne(SPECIMEN_ID)).resolves.toEqual(
      expect.objectContaining({
        specimenId: SPECIMEN_ID,
        class: 'Mammalia',
        orderName: 'Primates',
      }),
    );
  });

  it('distinguishes a missing specimen from missing taxonomy', async () => {
    specimenDelegate.findUnique.mockResolvedValueOnce(null);
    await expect(service.findOne(SPECIMEN_ID)).rejects.toThrow(
      `Specimen ${SPECIMEN_ID} not found`,
    );

    specimenDelegate.findUnique.mockResolvedValueOnce(specimenRecord());
    taxonomyDelegate.findUnique.mockResolvedValueOnce(null);
    await expect(service.findOne(SPECIMEN_ID)).rejects.toThrow(
      `Taxonomy for specimen ${SPECIMEN_ID} not found`,
    );
  });

  it('updates changed fields, permits clearing a field, and records history', async () => {
    taxonomyDelegate.findUnique.mockResolvedValue(
      taxonomyRecord({ conservation_status: 'Vulnerable' }),
    );
    taxonomyDelegate.update.mockResolvedValue(
      taxonomyRecord({
        order_name: 'Primates',
        conservation_status: null,
      }),
    );

    const result = await service.update(
      SPECIMEN_ID,
      { orderName: 'Primates', conservationStatus: null },
      ACCOUNT_ID,
    );

    expect(taxonomyDelegate.update).toHaveBeenCalledWith({
      where: { specimen_id: SPECIMEN_ID },
      data: {
        order_name: 'Primates',
        conservation_status: null,
      },
    });
    expect(revisionDelegate.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          field_changed: 'order_name',
          old_value: null,
          new_value: 'Primates',
        }),
        expect.objectContaining({
          field_changed: 'conservation_status',
          old_value: 'Vulnerable',
          new_value: null,
        }),
      ]),
    });
    expect(auditDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'UPDATE_SPECIMEN_TAXONOMY' }),
    });
    expect(result).toEqual(
      expect.objectContaining({
        orderName: 'Primates',
        conservationStatus: null,
      }),
    );
  });

  it('rejects updates that do not change taxonomy', async () => {
    taxonomyDelegate.findUnique.mockResolvedValue(taxonomyRecord());

    await expect(
      service.update(SPECIMEN_ID, { kingdom: 'Animalia' }, ACCOUNT_ID),
    ).rejects.toThrow(BadRequestException);
    expect(taxonomyDelegate.update).not.toHaveBeenCalled();
  });

  it('rejects updates when taxonomy does not exist', async () => {
    taxonomyDelegate.findUnique.mockResolvedValue(null);

    await expect(
      service.update(SPECIMEN_ID, { kingdom: 'Animalia' }, ACCOUNT_ID),
    ).rejects.toThrow(NotFoundException);
    expect(taxonomyDelegate.update).not.toHaveBeenCalled();
  });
});
