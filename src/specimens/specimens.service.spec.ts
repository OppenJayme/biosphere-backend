import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
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
import { SpecimenAccessionService } from './specimen-accession.service';
import { SpecimenCatalogingService } from './specimen-cataloging.service';
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
const storageUnitDelegate = { findMany: jest.fn() };
const revisionDelegate = {
  createMany: jest.fn(),
  findMany: jest.fn(),
  count: jest.fn(),
};
const auditDelegate = { create: jest.fn() };
const transactionMock = jest.fn();
const queryRawMock = jest.fn();

const prismaMock = {
  specimen: specimenDelegate,
  collection: collectionDelegate,
  specimen_lot: specimenLotDelegate,
  storage_unit: storageUnitDelegate,
  specimen_revision_history: revisionDelegate,
  audit_log: auditDelegate,
  $transaction: transactionMock,
  $queryRaw: queryRawMock,
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

function searchRecord(overrides: Record<string, unknown> = {}) {
  return {
    ...specimenRecord(),
    specimen_taxonomy: null,
    specimen_provenance: null,
    specimen_lot: [],
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
    queryRawMock.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SpecimensService,
        SpecimenCatalogingService,
        SpecimenAccessionService,
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

  describe('accession-number uniqueness (REQ-4.4-04, BR-01)', () => {
    const holder = (overrides: Record<string, unknown> = {}) => ({
      id: '66666666-6666-4666-8666-666666666666',
      accession_number: '2026.1.1',
      scientific_name: 'Other specimen',
      common_name: null,
      status: 'CATALOGED',
      ...overrides,
    });

    it('looks the number up trimmed, case-insensitively, across all statuses', async () => {
      specimenDelegate.create.mockResolvedValue(
        specimenRecord({ accession_number: '2026.1.1' }),
      );

      await service.create({ accessionNumber: '2026.1.1' }, ACCOUNT_ID);

      const [sql] = queryRawMock.mock.calls[0] as [Prisma.Sql];
      expect(sql.text.replace(/\s+/g, ' ')).toContain(
        'lower(btrim(s.accession_number)) = lower(btrim($1))',
      );
      expect(sql.values).toEqual(['2026.1.1']);
      expect(specimenDelegate.create).toHaveBeenCalled();
    });

    it('rejects a number a legacy record stores with surrounding spaces', async () => {
      queryRawMock.mockResolvedValue([
        holder({ accession_number: ' 2026.1.1 ' }),
      ]);

      await expect(
        service.create({ accessionNumber: '2026.1.1' }, ACCOUNT_ID),
      ).rejects.toThrow(ConflictException);
      expect(specimenDelegate.create).not.toHaveBeenCalled();
    });

    it('rejects a create whose number is already assigned', async () => {
      queryRawMock.mockResolvedValue([holder()]);

      const error = await service
        .create({ accessionNumber: '2026.1.1' }, ACCOUNT_ID)
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: 'ACCESSION_NUMBER_TAKEN',
        accessionNumber: '2026.1.1',
        conflictingSpecimen: {
          id: '66666666-6666-4666-8666-666666666666',
          status: 'CATALOGED',
        },
      });
      expect(specimenDelegate.create).not.toHaveBeenCalled();
      expect(auditDelegate.create).not.toHaveBeenCalled();
    });

    it('explains that an Archived record keeps its number', async () => {
      queryRawMock.mockResolvedValue([holder({ status: 'ARCHIVED' })]);

      await expect(
        service.create({ accessionNumber: '2026.1.1' }, ACCOUNT_ID),
      ).rejects.toThrow(/Archived record; archived numbers are not reused/);
    });

    it('maps a unique-index race on create to the same conflict', async () => {
      specimenDelegate.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '7.10.0',
        }),
      );

      await expect(
        service.create({ accessionNumber: '2026.1.1' }, ACCOUNT_ID),
      ).rejects.toThrow(ConflictException);
    });

    it('skips the lookup when no number is given', async () => {
      specimenDelegate.create.mockResolvedValue(specimenRecord());

      await service.create({ commonName: 'Test specimen' }, ACCOUNT_ID);

      expect(queryRawMock).not.toHaveBeenCalled();
    });

    it('excludes the edited record so it can keep or re-case its own number', async () => {
      specimenDelegate.findUnique.mockResolvedValue(
        specimenRecord({ accession_number: 'abc-1' }),
      );
      specimenDelegate.update.mockResolvedValue(
        specimenRecord({ accession_number: 'ABC-1' }),
      );

      await service.update(
        SPECIMEN_ID,
        { accessionNumber: 'ABC-1' },
        ACCOUNT_ID,
      );

      const [sql] = queryRawMock.mock.calls[0] as [Prisma.Sql];
      expect(sql.values).toEqual(['ABC-1', SPECIMEN_ID]);
      expect(specimenDelegate.update).toHaveBeenCalled();
    });

    it('rejects an update to a number held by another record', async () => {
      specimenDelegate.findUnique.mockResolvedValue(specimenRecord());
      queryRawMock.mockResolvedValue([holder()]);

      await expect(
        service.update(
          SPECIMEN_ID,
          { accessionNumber: '2026.1.1' },
          ACCOUNT_ID,
        ),
      ).rejects.toThrow(ConflictException);
      expect(specimenDelegate.update).not.toHaveBeenCalled();
      expect(revisionDelegate.createMany).not.toHaveBeenCalled();
    });

    it('allows clearing an Uncataloged record number without a lookup', async () => {
      specimenDelegate.findUnique.mockResolvedValue(
        specimenRecord({ accession_number: '2026.1.1' }),
      );
      specimenDelegate.update.mockResolvedValue(specimenRecord());

      await service.update(SPECIMEN_ID, { accessionNumber: null }, ACCOUNT_ID);

      expect(queryRawMock).not.toHaveBeenCalled();
      expect(specimenDelegate.update).toHaveBeenCalled();
    });

    it('maps a unique-index race on update to the same conflict', async () => {
      specimenDelegate.findUnique.mockResolvedValue(specimenRecord());
      specimenDelegate.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '7.10.0',
        }),
      );

      await expect(
        service.update(
          SPECIMEN_ID,
          { accessionNumber: '2026.1.1' },
          ACCOUNT_ID,
        ),
      ).rejects.toThrow(ConflictException);
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
    specimenDelegate.findMany.mockResolvedValue([searchRecord()]);
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
      include: expect.objectContaining({
        specimen_lot: expect.objectContaining({
          where: { is_active: true },
        }),
      }),
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

  it('requires reopening before a Cataloged core requirement is removed', async () => {
    specimenDelegate.findUnique.mockResolvedValue(
      specimenRecord({ status: 'CATALOGED', accession_number: '2026.1.1' }),
    );

    await expect(
      service.update(SPECIMEN_ID, { commonName: null }, ACCOUNT_ID),
    ).rejects.toThrow('Reopen cataloging before removing it');
    expect(specimenDelegate.update).not.toHaveBeenCalled();
  });

  it('reports missing requirements instead of completing an invalid record', async () => {
    specimenDelegate.findUnique
      .mockResolvedValueOnce(specimenRecord())
      .mockResolvedValueOnce({
        id: SPECIMEN_ID,
        status: 'UNCATALOGED',
        archived_at: null,
        collection_id: null,
        accession_number: null,
        common_name: 'Test specimen',
        specimen_taxonomy: null,
        specimen_provenance: null,
        specimen_lot: [],
      });

    await expect(
      service.completeCataloging(SPECIMEN_ID, ACCOUNT_ID),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        missingRequirements: expect.arrayContaining([
          'Collection is assigned',
          'Accession number is assigned',
          'Taxonomic kingdom is recorded',
        ]),
      }),
    });
    expect(specimenDelegate.update).not.toHaveBeenCalled();
  });

  it('completes a ready specimen with revision and audit attribution', async () => {
    specimenDelegate.findUnique
      .mockResolvedValueOnce(
        specimenRecord({
          collection_id: COLLECTION_ID,
          accession_number: '2026.1.1',
        }),
      )
      .mockResolvedValueOnce({
        id: SPECIMEN_ID,
        status: 'UNCATALOGED',
        archived_at: null,
        collection_id: COLLECTION_ID,
        accession_number: '2026.1.1',
        common_name: 'Test specimen',
        specimen_taxonomy: { kingdom: 'Animalia' },
        specimen_provenance: {
          collection_date: TEST_DATE,
          preservation_type: 'Wet specimen',
          preservation_method: '70% ethanol',
        },
        specimen_lot: [{ id: '66666666-6666-4666-8666-666666666666' }],
      });
    specimenDelegate.update.mockResolvedValue(
      specimenRecord({
        collection_id: COLLECTION_ID,
        accession_number: '2026.1.1',
        status: 'CATALOGED',
      }),
    );

    await expect(
      service.completeCataloging(SPECIMEN_ID, ACCOUNT_ID),
    ).resolves.toHaveProperty('status', SpecimenStatus.CATALOGED);
    expect(revisionDelegate.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          field_changed: 'status',
          old_value: 'UNCATALOGED',
          new_value: 'CATALOGED',
        }),
      ],
    });
    expect(auditDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'COMPLETE_SPECIMEN_CATALOGING',
      }),
    });
  });

  it('validates and promotes inside one SERIALIZABLE transaction', async () => {
    specimenDelegate.findUnique.mockResolvedValue(
      specimenRecord({ status: 'CATALOGED' }),
    );

    await service.completeCataloging(SPECIMEN_ID, ACCOUNT_ID);

    expect(transactionMock).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });

  it('returns an already Cataloged specimen without duplicating history', async () => {
    specimenDelegate.findUnique.mockResolvedValue(
      specimenRecord({ status: 'CATALOGED' }),
    );

    await expect(
      service.completeCataloging(SPECIMEN_ID, ACCOUNT_ID),
    ).resolves.toHaveProperty('status', SpecimenStatus.CATALOGED);
    expect(specimenDelegate.update).not.toHaveBeenCalled();
    expect(revisionDelegate.createMany).not.toHaveBeenCalled();
    expect(auditDelegate.create).not.toHaveBeenCalled();
  });

  it('rejects completion for an archived specimen', async () => {
    specimenDelegate.findUnique.mockResolvedValue(
      specimenRecord({ status: 'ARCHIVED', archived_at: TEST_DATE }),
    );

    await expect(
      service.completeCataloging(SPECIMEN_ID, ACCOUNT_ID),
    ).rejects.toThrow('Archived specimens cannot complete cataloging.');
    expect(specimenDelegate.update).not.toHaveBeenCalled();
  });

  it('reopens Cataloged work with a reason and disables public eligibility', async () => {
    specimenDelegate.findUnique.mockResolvedValue(
      specimenRecord({
        status: 'CATALOGED',
        public_display_allowed: true,
      }),
    );
    specimenDelegate.update.mockResolvedValue(
      specimenRecord({ status: 'UNCATALOGED' }),
    );

    await expect(
      service.reopenCataloging(
        SPECIMEN_ID,
        { reason: 'Taxonomy needs correction' },
        ACCOUNT_ID,
      ),
    ).resolves.toHaveProperty('status', SpecimenStatus.UNCATALOGED);
    expect(specimenDelegate.update).toHaveBeenCalledWith({
      where: { id: SPECIMEN_ID },
      data: expect.objectContaining({
        status: 'UNCATALOGED',
        public_display_allowed: false,
      }),
    });
    expect(revisionDelegate.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          field_changed: 'status',
          reason: 'Taxonomy needs correction',
        }),
      ]),
    });
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
  describe('catalog search filters (REQ-4.7-01/02/03)', () => {
    const insensitive = (value: string) => ({
      equals: value,
      mode: Prisma.QueryMode.insensitive,
    });
    const searchQuery = (values: Partial<SearchSpecimensQueryDto>) =>
      Object.assign(new SearchSpecimensQueryDto(), values);
    const whereOfLastSearch = () => {
      const [[args]] = specimenDelegate.findMany.mock.calls as [
        [{ where: Prisma.specimenWhereInput }],
      ];
      return args.where;
    };

    beforeEach(() => {
      specimenDelegate.findMany.mockResolvedValue([]);
      specimenDelegate.count.mockResolvedValue(0);
    });

    it('returns the table columns for each row', async () => {
      specimenDelegate.findMany.mockResolvedValue([
        searchRecord({
          specimen_taxonomy: { family: 'Felidae' },
          specimen_provenance: { collector: 'J. Cruz' },
          specimen_lot: [
            {
              quantity: 3,
              condition_class: 'GOOD',
              storage_unit: {
                id: 'd1',
                label: 'Drawer 1',
                unit_type: 'DRAWER',
              },
            },
            {
              quantity: 2,
              condition_class: 'FAIR',
              storage_unit: {
                id: 'd1',
                label: 'Drawer 1',
                unit_type: 'DRAWER',
              },
            },
            {
              quantity: 1,
              condition_class: 'GOOD',
              storage_unit: {
                id: 'd2',
                label: 'Drawer 2',
                unit_type: 'DRAWER',
              },
            },
          ],
        }),
      ]);
      specimenDelegate.count.mockResolvedValue(1);
      storageUnitDelegate.findMany
        .mockResolvedValueOnce([
          {
            id: 'd1',
            parent_id: 'cab',
            label: 'Drawer 1',
            unit_type: 'DRAWER',
          },
          {
            id: 'd2',
            parent_id: 'cab',
            label: 'Drawer 2',
            unit_type: 'DRAWER',
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 'cab',
            parent_id: null,
            label: 'Cabinet A',
            unit_type: 'CABINET',
          },
        ]);

      const page = await service.search(searchQuery({}));

      expect(page.items[0]).toEqual(
        expect.objectContaining({
          id: SPECIMEN_ID,
          family: 'Felidae',
          collector: 'J. Cruz',
          totalQuantity: 6,
          conditionClasses: ['GOOD', 'FAIR'],
          storageUnits: [
            {
              id: 'd1',
              label: 'Drawer 1',
              unitType: 'DRAWER',
              pathLabel: 'Cabinet A › Drawer 1',
            },
            {
              id: 'd2',
              label: 'Drawer 2',
              unitType: 'DRAWER',
              pathLabel: 'Cabinet A › Drawer 2',
            },
          ],
        }),
      );
    });

    it('filters by taxonomy, classification status, and tag without regard to case', async () => {
      await service.search(
        searchQuery({
          kingdom: 'Animalia',
          taxonClass: 'Mammalia',
          taxonOrder: 'Carnivora',
          family: 'felidae',
          classificationStatus: 'identified',
          tag: 'Endemic',
        }),
      );

      expect(whereOfLastSearch()).toEqual(
        expect.objectContaining({
          classification_status: insensitive('identified'),
          specimen_taxonomy: {
            is: {
              kingdom: insensitive('Animalia'),
              phylum: undefined,
              class: insensitive('Mammalia'),
              order_name: insensitive('Carnivora'),
              family: insensitive('felidae'),
              genus: undefined,
              species: undefined,
            },
          },
          specimen_tag: { some: { tag: { tag_name: insensitive('Endemic') } } },
        }),
      );
      expect(whereOfLastSearch().specimen_lot).toBeUndefined();
    });

    it('matches condition and storage location on the same active lot, including child units', async () => {
      storageUnitDelegate.findMany
        .mockResolvedValueOnce([{ id: 'drawer-1' }, { id: 'drawer-2' }])
        .mockResolvedValueOnce([{ id: 'box-1' }])
        .mockResolvedValueOnce([]);

      await service.search(
        searchQuery({ storageUnitId: 'cabinet', conditionClass: 'good' }),
      );

      expect(storageUnitDelegate.findMany).toHaveBeenNthCalledWith(1, {
        where: { parent_id: { in: ['cabinet'] } },
        select: { id: true },
      });
      expect(whereOfLastSearch().specimen_lot).toEqual({
        some: {
          is_active: true,
          condition_class: insensitive('good'),
          storage_unit_id: {
            in: ['cabinet', 'drawer-1', 'drawer-2', 'box-1'],
          },
        },
      });
    });

    it('can restrict a storage filter to the unit itself', async () => {
      await service.search(
        searchQuery({
          storageUnitId: 'cabinet',
          includeDescendantUnits: false,
        }),
      );

      expect(storageUnitDelegate.findMany).not.toHaveBeenCalled();
      expect(whereOfLastSearch().specimen_lot).toEqual({
        some: {
          is_active: true,
          condition_class: undefined,
          storage_unit_id: { in: ['cabinet'] },
        },
      });
    });

    it('filters by date added, treating a plain end date as the whole day', async () => {
      await service.search(
        searchQuery({ createdFrom: '2026-01-01', createdTo: '2026-01-31' }),
      );

      expect(whereOfLastSearch().created_at).toEqual({
        gte: new Date('2026-01-01T00:00:00.000Z'),
        lte: undefined,
        lt: new Date('2026-02-01T00:00:00.000Z'),
      });

      specimenDelegate.findMany.mockClear();
      await service.search(
        searchQuery({ createdTo: '2026-01-31T08:00:00.000Z' }),
      );
      expect(whereOfLastSearch().created_at).toEqual({
        gte: undefined,
        lte: new Date('2026-01-31T08:00:00.000Z'),
        lt: undefined,
      });
    });

    it('rejects a date range that ends before it starts', async () => {
      await expect(
        service.search(
          searchQuery({ createdFrom: '2026-02-01', createdTo: '2026-01-01' }),
        ),
      ).rejects.toThrow(BadRequestException);
      expect(specimenDelegate.findMany).not.toHaveBeenCalled();
    });

    it('also searches taxonomy, collector, and tag names', async () => {
      await service.search(searchQuery({ search: 'felis' }));

      const contains = {
        contains: 'felis',
        mode: Prisma.QueryMode.insensitive,
      };
      expect(whereOfLastSearch().OR).toEqual(
        expect.arrayContaining([
          {
            specimen_taxonomy: {
              is: {
                OR: expect.arrayContaining([
                  { family: contains },
                  { genus: contains },
                  { species: contains },
                ]),
              },
            },
          },
          { specimen_provenance: { is: { collector: contains } } },
          { specimen_tag: { some: { tag: { tag_name: contains } } } },
        ]),
      );
    });

    it('sorts by family and by category with empty values last', async () => {
      await service.search(
        searchQuery({
          sortBy: SpecimenSortField.FAMILY,
          sortDirection: SortDirection.ASC,
        }),
      );
      expect(specimenDelegate.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          orderBy: [
            { specimen_taxonomy: { family: { sort: 'asc', nulls: 'last' } } },
            { id: 'asc' },
          ],
        }),
      );

      await service.search(
        searchQuery({
          sortBy: SpecimenSortField.SPECIMEN_CATEGORY,
          sortDirection: SortDirection.DESC,
        }),
      );
      expect(specimenDelegate.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          orderBy: [
            { specimen_category: { sort: 'desc', nulls: 'last' } },
            { id: 'asc' },
          ],
        }),
      );
    });
  });
});
