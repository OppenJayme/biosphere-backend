import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { SpecimenCatalogingService } from './specimen-cataloging.service';

const SPECIMEN_ID = '33333333-3333-4333-8333-333333333333';
const COLLECTION_ID = '44444444-4444-4444-8444-444444444444';
const LOT_ID = '55555555-5555-4555-8555-555555555555';

const specimenDelegate = { findUnique: jest.fn() };
const prismaMock = { specimen: specimenDelegate };

function readinessRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: SPECIMEN_ID,
    status: 'UNCATALOGED',
    archived_at: null,
    collection_id: COLLECTION_ID,
    accession_number: '2026.1.1',
    common_name: 'Test specimen',
    specimen_taxonomy: { kingdom: 'Animalia' },
    specimen_provenance: {
      collection_date: new Date('2020-05-17T00:00:00.000Z'),
      preservation_type: 'Wet specimen',
      preservation_method: '70% ethanol',
    },
    specimen_lot: [{ id: LOT_ID }],
    ...overrides,
  };
}

describe('SpecimenCatalogingService', () => {
  let service: SpecimenCatalogingService;

  beforeEach(async () => {
    jest.resetAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SpecimenCatalogingService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get(SpecimenCatalogingService);
  });

  it('marks an Uncataloged specimen ready only when every rule passes', async () => {
    specimenDelegate.findUnique.mockResolvedValue(readinessRecord());

    const result = await service.getReadiness(SPECIMEN_ID);

    expect(result).toMatchObject({
      specimenId: SPECIMEN_ID,
      currentStatus: 'UNCATALOGED',
      requirementsMet: true,
      canComplete: true,
      missingRequirements: [],
    });
    expect(result.checks).toHaveLength(8);
    expect(result.checks.every((check) => check.passed)).toBe(true);
    expect(specimenDelegate.findUnique).toHaveBeenCalledWith({
      where: { id: SPECIMEN_ID },
      select: expect.objectContaining({
        specimen_taxonomy: expect.any(Object),
        specimen_provenance: expect.any(Object),
        specimen_lot: expect.objectContaining({
          where: expect.objectContaining({
            is_active: true,
            quantity: { gt: 0 },
          }),
          take: 1,
        }),
      }),
    });
  });

  it('returns exact missing requirements without guessing completeness', async () => {
    specimenDelegate.findUnique.mockResolvedValue(
      readinessRecord({
        accession_number: null,
        common_name: '   ',
        specimen_taxonomy: { kingdom: null },
        specimen_lot: [],
      }),
    );

    const result = await service.getReadiness(SPECIMEN_ID);

    expect(result.requirementsMet).toBe(false);
    expect(result.canComplete).toBe(false);
    expect(result.missingRequirements).toEqual([
      'Accession number is assigned',
      'Common name is recorded',
      'Taxonomic kingdom is recorded',
      'An active lot has positive quantity in a specimen-holding storage location',
    ]);
  });

  it('does not offer completion again for a Cataloged record', async () => {
    specimenDelegate.findUnique.mockResolvedValue(
      readinessRecord({ status: 'CATALOGED' }),
    );

    const result = await service.getReadiness(SPECIMEN_ID);

    expect(result.requirementsMet).toBe(true);
    expect(result.canComplete).toBe(false);
  });

  it('throws for an unknown specimen', async () => {
    specimenDelegate.findUnique.mockResolvedValue(null);

    await expect(service.getReadiness(SPECIMEN_ID)).rejects.toThrow(
      NotFoundException,
    );
  });
});
