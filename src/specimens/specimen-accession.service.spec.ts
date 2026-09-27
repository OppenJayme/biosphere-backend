import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import {
  SpecimenAccessionService,
  accessionNumberKey,
} from './specimen-accession.service';

const specimenDelegate = { findFirst: jest.fn(), findMany: jest.fn() };
const prismaMock = { specimen: specimenDelegate };

const SPECIMEN_ID = '33333333-3333-4333-8333-333333333333';

describe('SpecimenAccessionService', () => {
  let service: SpecimenAccessionService;

  beforeEach(async () => {
    jest.resetAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SpecimenAccessionService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get(SpecimenAccessionService);
  });

  it('keys numbers trimmed and case-folded, treating blank as unassigned', () => {
    expect(accessionNumberKey('  ABC-100 ')).toBe('abc-100');
    expect(accessionNumberKey('   ')).toBeUndefined();
    expect(accessionNumberKey(null)).toBeUndefined();
    expect(accessionNumberKey(undefined)).toBeUndefined();
  });

  it('reports a free number as available', async () => {
    specimenDelegate.findFirst.mockResolvedValue(null);

    await expect(service.checkAvailability(' ABC-100 ')).resolves.toEqual({
      accessionNumber: 'ABC-100',
      available: true,
      conflictingSpecimen: null,
    });
  });

  it('reports the record holding a number, excluding the edited one', async () => {
    specimenDelegate.findFirst.mockResolvedValue({
      id: SPECIMEN_ID,
      accession_number: 'abc-100',
      scientific_name: 'Testus specimenus',
      common_name: null,
      status: 'ARCHIVED',
    });

    const result = await service.checkAvailability(
      'ABC-100',
      '44444444-4444-4444-8444-444444444444',
    );

    expect(specimenDelegate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          accession_number: { equals: 'ABC-100', mode: 'insensitive' },
          id: { not: '44444444-4444-4444-8444-444444444444' },
        },
      }),
    );
    expect(result).toEqual({
      accessionNumber: 'ABC-100',
      available: false,
      conflictingSpecimen: {
        id: SPECIMEN_ID,
        accessionNumber: 'abc-100',
        scientificName: 'Testus specimenus',
        commonName: null,
        status: 'ARCHIVED',
      },
    });
  });

  it('finds holders for a batch in one query, keyed case-insensitively', async () => {
    specimenDelegate.findMany.mockResolvedValue([
      {
        id: SPECIMEN_ID,
        accession_number: 'ABC-100',
        scientific_name: null,
        common_name: null,
        status: 'CATALOGED',
      },
    ]);

    const holders = await service.findHolders([
      'abc-100',
      ' ABC-100 ',
      'XYZ-9',
      null,
      '  ',
    ]);

    expect(specimenDelegate.findMany).toHaveBeenCalledTimes(1);
    expect(specimenDelegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { accession_number: { equals: 'ABC-100', mode: 'insensitive' } },
            { accession_number: { equals: 'XYZ-9', mode: 'insensitive' } },
          ],
        },
      }),
    );
    expect([...holders.keys()]).toEqual(['abc-100']);
  });

  it('skips the query when a batch has no numbers', async () => {
    await expect(service.findHolders([null, ' '])).resolves.toEqual(new Map());
    expect(specimenDelegate.findMany).not.toHaveBeenCalled();
  });
});
