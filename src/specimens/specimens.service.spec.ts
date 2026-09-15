import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  SearchSpecimensQueryDto,
  SortDirection,
  SpecimenSortField,
} from './dto/search-specimens-query.dto';
import { ListSpecimenRevisionsQueryDto } from './dto/list-specimen-revisions-query.dto';
import { SpecimenGender, SpecimenStatus } from './entities/specimen.entity';
import { SpecimensService } from './specimens.service';

const specimenDelegate = {
  create: jest.fn(),
  findMany: jest.fn(),
  findUnique: jest.fn(),
  count: jest.fn(),
  update: jest.fn(),
};
const collectionDelegate = { findUnique: jest.fn() };
const specimenLotDelegate = { count: jest.fn() };
const revisionDelegate = {
  createMany: jest.fn(),
  findMany: jest.fn(),
  count: jest.fn(),
};
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
const REVISION_ID = '55555555-5555-4555-8555-555555555555';
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

function revisionRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: REVISION_ID,
    specimen_id: SPECIMEN_ID,
    changed_by: ACCOUNT_ID,
    field_changed: 'common_name',
    old_value: 'Old name',
    new_value: 'Test specimen',
    reason: 'Identification corrected',
    changed_at: TEST_DATE,
    source_section: 'specimen_core',
    user_account: {
      id: ACCOUNT_ID,
      full_name: 'Test Curator',
      role: 'CURATOR',
    },
    ...overrides,
  };
}

describe('SpecimensService', () => {
  let service: SpecimensService;

  beforeEach(async () => {
    jest.resetAllMocks();
    transactionMock.mockImplementation((operation: unknown) => {
      if (Array.isArray(operation)) return Promise.all(operation);
      return Promise.resolve(
        (operation as (transaction: typeof prismaMock) => unknown)(prismaMock),
      );
    });
    revisionDelegate.createMany.mockResolvedValue({ count: 1 });
    revisionDelegate.findMany.mockResolvedValue([]);
    revisionDelegate.count.mockResolvedValue(0);
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

  it('creates an offline draft through the same core writer with sync audit metadata', async () => {
    specimenDelegate.create.mockResolvedValue(specimenRecord());

    await expect(
      service.createOfflineDraft(
        prismaMock as unknown as Prisma.TransactionClient,
        { specimenCategory: 'ZOOLOGY' },
        ACCOUNT_ID,
        '55555555-5555-4555-8555-555555555555',
      ),
    ).resolves.toHaveProperty('status', SpecimenStatus.UNCATALOGED);

    expect(auditDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'SYNC_OFFLINE_SPECIMEN_DRAFT',
        details: {
          status: 'UNCATALOGED',
          clientDraftId: '55555555-5555-4555-8555-555555555555',
        },
      }),
    });
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

  it('searches active specimens with bounded filters, sorting, and pagination', async () => {
    specimenDelegate.findMany.mockResolvedValue([specimenRecord()]);
    specimenDelegate.count.mockResolvedValue(1);
    const query = Object.assign(new SearchSpecimensQueryDto(), {
      search: 'test',
      collectionId: COLLECTION_ID,
      specimenCategory: 'zoology',
      gender: SpecimenGender.UNKNOWN,
      publicDisplay: false,
      page: 2,
      limit: 10,
      sortBy: SpecimenSortField.SCIENTIFIC_NAME,
      sortDirection: SortDirection.ASC,
    });

    await expect(service.search(query)).resolves.toEqual({
      items: [expect.objectContaining({ id: SPECIMEN_ID })],
      total: 1,
      page: 2,
      limit: 10,
    });
    const expectedWhere = expect.objectContaining({
      status: { not: 'ARCHIVED' },
      collection_id: COLLECTION_ID,
      specimen_category: {
        equals: 'zoology',
        mode: Prisma.QueryMode.insensitive,
      },
      gender: SpecimenGender.UNKNOWN,
      public_display_allowed: false,
      OR: expect.arrayContaining([
        {
          scientific_name: {
            contains: 'test',
            mode: Prisma.QueryMode.insensitive,
          },
        },
      ]),
    });
    expect(specimenDelegate.findMany).toHaveBeenCalledWith({
      where: expectedWhere,
      orderBy: [
        { scientific_name: { sort: 'asc', nulls: 'last' } },
        { id: 'asc' },
      ],
      skip: 10,
      take: 10,
    });
    expect(specimenDelegate.count).toHaveBeenCalledWith({
      where: expectedWhere,
    });
  });

  it('includes archived records only when explicitly filtered and matches UUIDs exactly', async () => {
    specimenDelegate.findMany.mockResolvedValue([]);
    specimenDelegate.count.mockResolvedValue(0);
    const query = Object.assign(new SearchSpecimensQueryDto(), {
      search: SPECIMEN_ID,
      status: SpecimenStatus.ARCHIVED,
    });

    await service.search(query);

    expect(specimenDelegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: SpecimenStatus.ARCHIVED,
          OR: expect.arrayContaining([{ id: SPECIMEN_ID }]),
        }),
      }),
    );
  });

  it('returns filtered, stable, paginated specimen revision history', async () => {
    specimenDelegate.findUnique.mockResolvedValue({ id: SPECIMEN_ID });
    revisionDelegate.findMany.mockResolvedValue([revisionRecord()]);
    revisionDelegate.count.mockResolvedValue(1);
    const query = Object.assign(new ListSpecimenRevisionsQueryDto(), {
      fieldChanged: 'common_name',
      sourceSection: 'specimen_core',
      changedBy: ACCOUNT_ID,
      from: '2025-12-01T00:00:00.000Z',
      to: '2026-02-01T00:00:00.000Z',
      page: 2,
      limit: 10,
    });

    await expect(
      service.findRevisionHistory(SPECIMEN_ID, query),
    ).resolves.toEqual({
      items: [
        {
          id: REVISION_ID,
          specimenId: SPECIMEN_ID,
          changedBy: {
            id: ACCOUNT_ID,
            fullName: 'Test Curator',
            role: 'CURATOR',
          },
          fieldChanged: 'common_name',
          oldValue: 'Old name',
          newValue: 'Test specimen',
          reason: 'Identification corrected',
          sourceSection: 'specimen_core',
          changedAt: TEST_DATE,
        },
      ],
      total: 1,
      page: 2,
      limit: 10,
    });
    const expectedWhere = {
      specimen_id: SPECIMEN_ID,
      field_changed: {
        equals: 'common_name',
        mode: Prisma.QueryMode.insensitive,
      },
      source_section: {
        equals: 'specimen_core',
        mode: Prisma.QueryMode.insensitive,
      },
      changed_by: ACCOUNT_ID,
      changed_at: {
        gte: new Date('2025-12-01T00:00:00.000Z'),
        lte: new Date('2026-02-01T00:00:00.000Z'),
      },
    };
    expect(specimenDelegate.findUnique).toHaveBeenCalledWith({
      where: { id: SPECIMEN_ID },
      select: { id: true },
    });
    expect(revisionDelegate.findMany).toHaveBeenCalledWith({
      where: expectedWhere,
      include: {
        user_account: {
          select: { id: true, full_name: true, role: true },
        },
      },
      orderBy: [{ changed_at: 'desc' }, { id: 'desc' }],
      skip: 10,
      take: 10,
    });
    expect(revisionDelegate.count).toHaveBeenCalledWith({
      where: expectedWhere,
    });
  });

  it('rejects an inverted revision-history date range before querying', async () => {
    const query = Object.assign(new ListSpecimenRevisionsQueryDto(), {
      from: '2026-02-01T00:00:00.000Z',
      to: '2026-01-01T00:00:00.000Z',
    });

    await expect(
      service.findRevisionHistory(SPECIMEN_ID, query),
    ).rejects.toThrow(BadRequestException);
    expect(revisionDelegate.findMany).not.toHaveBeenCalled();
  });

  it('returns not found instead of an empty revision page for an unknown specimen', async () => {
    specimenDelegate.findUnique.mockResolvedValue(null);

    await expect(
      service.findRevisionHistory(
        SPECIMEN_ID,
        new ListSpecimenRevisionsQueryDto(),
      ),
    ).rejects.toThrow(NotFoundException);
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
