import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  SpecimenAccessionService,
  accessionNumberKey,
} from './specimen-accession.service';

const queryRawMock = jest.fn();
const prismaMock = { $queryRaw: queryRawMock };

const SPECIMEN_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_ID = '44444444-4444-4444-8444-444444444444';

function lastSql(): Prisma.Sql {
  const calls = queryRawMock.mock.calls;
  return calls[calls.length - 1][0] as Prisma.Sql;
}

function normalizedText(sql: Prisma.Sql): string {
  return sql.text.replace(/\s+/g, ' ');
}

describe('SpecimenAccessionService', () => {
  let service: SpecimenAccessionService;

  beforeEach(async () => {
    jest.resetAllMocks();
    queryRawMock.mockResolvedValue([]);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SpecimenAccessionService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get(SpecimenAccessionService);
  });

  it('mirrors btrim: strips only surrounding spaces and case-folds', () => {
    expect(accessionNumberKey('  ABC-100 ')).toBe('abc-100');
    expect(accessionNumberKey('ABC-100\t')).toBe('abc-100\t');
    expect(accessionNumberKey('   ')).toBeUndefined();
    expect(accessionNumberKey(null)).toBeUndefined();
    expect(accessionNumberKey(undefined)).toBeUndefined();
  });

  it('compares both the stored and the input value as the unique index does', async () => {
    await service.checkAvailability('ABC-100');

    const sql = normalizedText(lastSql());
    expect(sql).toContain(
      'lower(btrim(s.accession_number)) = lower(btrim($1))',
    );
    // The index's partial predicate, so PostgreSQL can use it.
    expect(sql).toContain(
      "s.accession_number IS NOT NULL AND btrim(s.accession_number) <> ''",
    );
    expect(sql).not.toContain('s.id <>');
    expect(lastSql().values).toEqual(['ABC-100']);
  });

  it('reports a free number as available', async () => {
    await expect(service.checkAvailability(' ABC-100 ')).resolves.toEqual({
      accessionNumber: 'ABC-100',
      available: true,
      conflictingSpecimen: null,
    });
  });

  it('reports a legacy whitespace-padded stored number as taken, excluding the edited record', async () => {
    queryRawMock.mockResolvedValue([
      {
        id: SPECIMEN_ID,
        accession_number: ' ABC-100 ',
        scientific_name: 'Testus specimenus',
        common_name: null,
        status: 'ARCHIVED',
      },
    ]);

    const result = await service.checkAvailability('abc-100', OTHER_ID);

    expect(normalizedText(lastSql())).toContain('AND s.id <> $2::uuid');
    expect(lastSql().values).toEqual(['abc-100', OTHER_ID]);
    expect(result).toEqual({
      accessionNumber: 'abc-100',
      available: false,
      conflictingSpecimen: {
        id: SPECIMEN_ID,
        accessionNumber: ' ABC-100 ',
        scientificName: 'Testus specimenus',
        commonName: null,
        status: 'ARCHIVED',
      },
    });
  });

  it('rejects a write when the lookup finds a holder, and skips blank numbers', async () => {
    queryRawMock.mockResolvedValue([
      {
        id: SPECIMEN_ID,
        accession_number: ' ABC-100 ',
        scientific_name: null,
        common_name: null,
        status: 'CATALOGED',
      },
    ]);

    await expect(
      service.assertAvailable(prismaMock, 'ABC-100'),
    ).rejects.toMatchObject({
      response: {
        code: 'ACCESSION_NUMBER_TAKEN',
        conflictingSpecimen: expect.objectContaining({ id: SPECIMEN_ID }),
      },
    });

    queryRawMock.mockClear();
    await service.assertAvailable(prismaMock, '  ');
    await service.assertAvailable(prismaMock, null);
    expect(queryRawMock).not.toHaveBeenCalled();
  });

  it('finds holders for a batch in one query, keyed by the input value', async () => {
    queryRawMock.mockResolvedValue([
      {
        input_value: 'abc-100',
        id: SPECIMEN_ID,
        accession_number: ' ABC-100 ',
        scientific_name: null,
        common_name: null,
        status: 'CATALOGED',
      },
    ]);

    const holders = await service.findHolders([
      'abc-100',
      'abc-100',
      'XYZ-9',
      null,
      '  ',
    ]);

    expect(queryRawMock).toHaveBeenCalledTimes(1);
    const sql = normalizedText(lastSql());
    expect(sql).toContain('unnest($1::text[])');
    expect(sql).toContain(
      'lower(btrim(s.accession_number)) = lower(btrim(input.value))',
    );
    expect(lastSql().values).toEqual([['abc-100', 'XYZ-9']]);
    expect([...holders.keys()]).toEqual(['abc-100']);
    expect(holders.get('abc-100')?.accessionNumber).toBe(' ABC-100 ');
  });

  it('skips the query when a batch has no numbers', async () => {
    await expect(service.findHolders([null, ' '])).resolves.toEqual(new Map());
    expect(queryRawMock).not.toHaveBeenCalled();
  });
});
