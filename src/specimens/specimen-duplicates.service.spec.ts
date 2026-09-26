import { Logger, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import {
  DuplicateConfidence,
  DuplicateMatchField,
} from './entities/specimen-duplicate.entity';
import {
  MAX_POSSIBLE_DUPLICATES,
  SpecimenDuplicatesService,
  describeDuplicate,
  evaluateDuplicate,
} from './specimen-duplicates.service';

const specimenDelegate = { findMany: jest.fn(), findUnique: jest.fn() };
const prismaMock = { specimen: specimenDelegate };

const SPECIMEN_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_ID = '44444444-4444-4444-8444-444444444444';

function existingRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: OTHER_ID,
    accession_number: null,
    scientific_name: 'Passer domesticus',
    common_name: 'House sparrow',
    status: 'UNCATALOGED',
    specimen_provenance: null,
    ...overrides,
  };
}

describe('evaluateDuplicate', () => {
  const sparrow = {
    scientificName: 'Passer domesticus',
    commonName: 'House sparrow',
  };

  it('reports a shared accession number as HIGH even when other fields differ', () => {
    const result = evaluateDuplicate(
      { accessionNumber: ' abc-100 ', collector: 'A. Cruz' },
      { accessionNumber: 'ABC-100', collector: 'B. Santos' },
    );

    expect(result).toEqual({
      confidence: DuplicateConfidence.HIGH,
      matchedFields: [DuplicateMatchField.ACCESSION_NUMBER],
      differingFields: [DuplicateMatchField.COLLECTOR],
    });
  });

  it('reports matching scientific and common names as MEDIUM when there is no provenance to compare', () => {
    expect(
      evaluateDuplicate(sparrow, {
        scientificName: ' PASSER domesticus ',
        commonName: 'house sparrow',
      }),
    ).toEqual({
      confidence: DuplicateConfidence.MEDIUM,
      matchedFields: [
        DuplicateMatchField.SCIENTIFIC_NAME,
        DuplicateMatchField.COMMON_NAME,
      ],
      differingFields: [],
    });
  });

  it('does not collapse inner whitespace, matching the database lookup', () => {
    // The lookup is a trimmed, case-insensitive equality, so a stored
    // "Passer  domesticus" is never fetched for "Passer domesticus"; the
    // in-memory comparison must agree rather than imply otherwise.
    expect(
      evaluateDuplicate(sparrow, {
        scientificName: 'Passer  domesticus',
        commonName: 'House  sparrow',
      }),
    ).toBeNull();
  });

  it('does not report the same scientific name alone (BR-09)', () => {
    expect(
      evaluateDuplicate(
        { scientificName: 'Passer domesticus' },
        { scientificName: 'Passer domesticus', commonName: 'House sparrow' },
      ),
    ).toBeNull();
  });

  it('reports same species with matching provenance as HIGH', () => {
    const result = evaluateDuplicate(
      {
        scientificName: 'Passer domesticus',
        collector: 'A. Cruz',
        collectionLocation: 'Cebu City',
      },
      {
        scientificName: 'Passer domesticus',
        collector: 'a. cruz',
        collectionLocation: 'Cebu City',
        donor: 'Someone',
      },
    );

    expect(result?.confidence).toBe(DuplicateConfidence.HIGH);
    expect(result?.matchedFields).toEqual([
      DuplicateMatchField.SCIENTIFIC_NAME,
      DuplicateMatchField.COLLECTOR,
      DuplicateMatchField.COLLECTION_LOCATION,
    ]);
  });

  it.each([
    ['collector', { collector: 'A. Cruz' }, { collector: 'B. Santos' }],
    ['donor', { donor: 'Museum A' }, { donor: 'Museum B' }],
  ])(
    'allows separate same-species records with a different %s (BR-09)',
    (_label, a, b) => {
      expect(
        evaluateDuplicate(
          { ...sparrow, collectionLocation: 'Cebu', ...a },
          { ...sparrow, collectionLocation: 'Cebu', ...b },
        ),
      ).toBeNull();
    },
  );

  it.each([
    [
      'collection location',
      { collectionLocation: 'Cebu' },
      { collectionLocation: 'Bohol' },
      DuplicateMatchField.COLLECTION_LOCATION,
    ],
    [
      'collection date',
      { collectionDate: '2026-01-01' },
      { collectionDate: '2026-02-01' },
      DuplicateMatchField.COLLECTION_DATE,
    ],
  ])(
    'still warns when only the %s differs, since that is not an approved distinction',
    (_label, a, b, field) => {
      expect(
        evaluateDuplicate({ ...sparrow, ...a }, { ...sparrow, ...b }),
      ).toEqual({
        confidence: DuplicateConfidence.MEDIUM,
        matchedFields: [
          DuplicateMatchField.SCIENTIFIC_NAME,
          DuplicateMatchField.COMMON_NAME,
        ],
        differingFields: [field],
      });
    },
  );

  it('does not treat gender as a distinction', () => {
    expect(
      evaluateDuplicate(
        { ...sparrow, gender: 'MALE' } as never,
        { ...sparrow, gender: 'FEMALE' } as never,
      )?.confidence,
    ).toBe(DuplicateConfidence.MEDIUM);
  });

  it('falls back to common name only when a record has no scientific name', () => {
    expect(
      evaluateDuplicate(
        { commonName: 'House sparrow', collector: 'A. Cruz' },
        { ...sparrow, collector: 'A. Cruz' },
      )?.confidence,
    ).toBe(DuplicateConfidence.HIGH);
    expect(
      evaluateDuplicate(
        { scientificName: 'Passer montanus', commonName: 'House sparrow' },
        { ...sparrow },
      ),
    ).toBeNull();
  });

  it('never matches on empty values', () => {
    expect(
      evaluateDuplicate(
        { accessionNumber: '  ', scientificName: null },
        { accessionNumber: '', scientificName: null },
      ),
    ).toBeNull();
  });

  it('describes matched and differing fields for the curator', () => {
    expect(
      describeDuplicate({
        confidence: DuplicateConfidence.HIGH,
        matchedFields: [DuplicateMatchField.ACCESSION_NUMBER],
        differingFields: [DuplicateMatchField.COLLECTOR],
      }),
    ).toBe(
      'Possible duplicate: same accession number. Differs in collector. Confirm this is not the same specimen before continuing.',
    );
  });
});

describe('SpecimenDuplicatesService', () => {
  let service: SpecimenDuplicatesService;

  beforeEach(async () => {
    jest.resetAllMocks();
    specimenDelegate.findMany.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SpecimenDuplicatesService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get(SpecimenDuplicatesService);
  });

  it('skips the query when the candidate has nothing to match on', async () => {
    await expect(
      service.findForCandidate({ collector: 'A. Cruz' }),
    ).resolves.toEqual([]);
    expect(specimenDelegate.findMany).not.toHaveBeenCalled();
  });

  it('looks up active specimens by accession number and names, excluding given ids', async () => {
    await service.findForCandidate(
      {
        accessionNumber: 'ABC-100',
        scientificName: 'Passer domesticus',
        commonName: 'House sparrow',
      },
      [SPECIMEN_ID],
    );

    expect(specimenDelegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: { not: 'ARCHIVED' },
          id: { notIn: [SPECIMEN_ID] },
          OR: [
            {
              accession_number: { equals: 'ABC-100', mode: 'insensitive' },
            },
            {
              scientific_name: {
                equals: 'Passer domesticus',
                mode: 'insensitive',
              },
            },
            { common_name: { equals: 'House sparrow', mode: 'insensitive' } },
          ],
        },
      }),
    );
  });

  it('returns structured matches, comparing against stored provenance', async () => {
    specimenDelegate.findMany.mockResolvedValue([
      existingRecord({
        id: 'b-medium',
        specimen_provenance: null,
      }),
      existingRecord({
        id: 'a-separate',
        specimen_provenance: {
          collector: 'B. Santos',
          donor: null,
          collection_location: null,
          collection_date: null,
        },
      }),
      existingRecord({
        id: 'c-high',
        specimen_provenance: {
          collector: 'A. Cruz',
          donor: null,
          collection_location: null,
          collection_date: new Date('2026-01-05T00:00:00.000Z'),
        },
      }),
      existingRecord({ id: SPECIMEN_ID }),
    ]);

    const result = await service.findForCandidate(
      {
        scientificName: 'Passer domesticus',
        commonName: 'House sparrow',
        collector: 'A. Cruz',
        collectionDate: '2026-01-05',
      },
      [SPECIMEN_ID],
    );

    expect(result.map((match) => match.specimenId)).toEqual([
      'c-high',
      'b-medium',
    ]);
    expect(result[0]).toMatchObject({
      confidence: DuplicateConfidence.HIGH,
      matchedFields: [
        DuplicateMatchField.SCIENTIFIC_NAME,
        DuplicateMatchField.COMMON_NAME,
        DuplicateMatchField.COLLECTOR,
        DuplicateMatchField.COLLECTION_DATE,
      ],
      scientificName: 'Passer domesticus',
      status: 'UNCATALOGED',
    });
    expect(result[1].confidence).toBe(DuplicateConfidence.MEDIUM);
  });

  it(`caps each candidate at ${MAX_POSSIBLE_DUPLICATES} matches`, async () => {
    specimenDelegate.findMany.mockResolvedValue(
      Array.from({ length: MAX_POSSIBLE_DUPLICATES + 5 }, (_, index) =>
        existingRecord({ id: `id-${String(index).padStart(3, '0')}` }),
      ),
    );

    const result = await service.findForCandidate({
      scientificName: 'Passer domesticus',
      commonName: 'House sparrow',
    });

    expect(result).toHaveLength(MAX_POSSIBLE_DUPLICATES);
  });

  it('returns one result list per candidate from a single query', async () => {
    specimenDelegate.findMany.mockResolvedValue([
      existingRecord({ accession_number: 'ABC-100' }),
    ]);

    const result = await service.findForCandidates([
      { accessionNumber: 'abc-100' },
      { scientificName: 'Unrelated species', commonName: 'Other' },
    ]);

    expect(specimenDelegate.findMany).toHaveBeenCalledTimes(1);
    expect(result[0]).toHaveLength(1);
    expect(result[1]).toEqual([]);
  });

  it('compares candidates within a batch in both directions', () => {
    const result = service.compareWithinBatch([
      { accessionNumber: 'ABC-100' },
      { scientificName: 'Other' },
      { accessionNumber: 'abc-100' },
    ]);

    expect(result[0].map((match) => match.index)).toEqual([2]);
    expect(result[1]).toEqual([]);
    expect(result[2].map((match) => match.index)).toEqual([0]);
  });

  describe('findAfterCreate', () => {
    it('returns matches, excluding the created record', async () => {
      specimenDelegate.findMany.mockResolvedValue([existingRecord()]);

      const result = await service.findAfterCreate(
        { scientificName: 'Passer domesticus', commonName: 'House sparrow' },
        SPECIMEN_ID,
      );

      expect(result.duplicateCheckAvailable).toBe(true);
      expect(result.possibleDuplicates).toHaveLength(1);
      expect(specimenDelegate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: { notIn: [SPECIMEN_ID] } }),
        }),
      );
    });

    it('reports an unavailable check instead of throwing when the lookup fails', async () => {
      specimenDelegate.findMany.mockRejectedValue(
        new Error('connection reset'),
      );
      const logSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);

      await expect(
        service.findAfterCreate(
          { scientificName: 'Passer domesticus' },
          SPECIMEN_ID,
        ),
      ).resolves.toEqual({
        possibleDuplicates: [],
        duplicateCheckAvailable: false,
      });
      expect(logSpy).toHaveBeenCalled();
      logSpy.mockRestore();
    });
  });

  describe('findForSpecimen', () => {
    it('throws when the specimen does not exist', async () => {
      specimenDelegate.findUnique.mockResolvedValue(null);

      await expect(service.findForSpecimen(SPECIMEN_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('checks the saved record, including provenance, excluding itself', async () => {
      specimenDelegate.findUnique.mockResolvedValue(
        existingRecord({
          id: SPECIMEN_ID,
          specimen_provenance: {
            collector: 'A. Cruz',
            donor: null,
            collection_location: null,
            collection_date: null,
          },
        }),
      );
      specimenDelegate.findMany.mockResolvedValue([
        existingRecord({
          specimen_provenance: {
            collector: 'A. Cruz',
            donor: null,
            collection_location: null,
            collection_date: null,
          },
        }),
      ]);

      const result = await service.findForSpecimen(SPECIMEN_ID);

      expect(specimenDelegate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: { notIn: [SPECIMEN_ID] } }),
        }),
      );
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        specimenId: OTHER_ID,
        confidence: DuplicateConfidence.HIGH,
      });
    });
  });
});
