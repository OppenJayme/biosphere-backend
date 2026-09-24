import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { SpecimenDetailsService } from './specimen-details.service';

const SPECIMEN_ID = '11111111-1111-4111-8111-111111111111';
const COLLECTION_ID = '22222222-2222-4222-8222-222222222222';
const ACCOUNT_ID = '33333333-3333-4333-8333-333333333333';
const LOT_ID = '44444444-4444-4444-8444-444444444444';
const STORAGE_ID = '55555555-5555-4555-8555-555555555555';
const MEDIA_ID = '66666666-6666-4666-8666-666666666666';
const ALPHA_TAG_ID = '77777777-7777-4777-8777-777777777777';
const ZOOLOGY_TAG_ID = '88888888-8888-4888-8888-888888888888';
const TEST_DATE = new Date('2026-09-01T00:00:00.000Z');

const specimenFindUnique = jest.fn();
const prismaMock = { specimen: { findUnique: specimenFindUnique } };

function detailRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: SPECIMEN_ID,
    collection_id: COLLECTION_ID,
    created_by: ACCOUNT_ID,
    updated_by: ACCOUNT_ID,
    archived_by: null,
    accession_number: 'USC-001',
    specimen_category: 'ZOOLOGY',
    scientific_name: 'Testus specimenus',
    common_name: 'Test specimen',
    gender: 'UNKNOWN',
    classification_status: 'IDENTIFIED',
    status: 'UNCATALOGED',
    public_display_allowed: false,
    remarks: null,
    created_at: TEST_DATE,
    updated_at: TEST_DATE,
    archived_at: null,
    collection: {
      id: COLLECTION_ID,
      collection_name: 'Zoology',
      created_at: TEST_DATE,
      updated_at: TEST_DATE,
    },
    specimen_taxonomy: {
      specimen_id: SPECIMEN_ID,
      kingdom: 'Animalia',
      phylum: null,
      class: null,
      order_name: null,
      family: null,
      genus: 'Testus',
      species: 'specimenus',
      habitat: null,
      ecological_role: null,
      conservation_status: null,
    },
    specimen_provenance: {
      specimen_id: SPECIMEN_ID,
      collector: 'Test Collector',
      donor: null,
      collection_date: new Date('2026-08-20T00:00:00.000Z'),
      collection_location: 'Cebu',
      preservation_type: null,
      preservation_method: null,
      updated_at: TEST_DATE,
    },
    specimen_lot: [
      {
        id: LOT_ID,
        specimen_id: SPECIMEN_ID,
        storage_unit_id: STORAGE_ID,
        condition_class: 'GOOD',
        quantity: 3,
        storage_notes: null,
        is_active: true,
        created_by: ACCOUNT_ID,
        updated_by: null,
        created_at: TEST_DATE,
        updated_at: TEST_DATE,
        storage_unit: {
          id: STORAGE_ID,
          parent_id: null,
          unit_type: 'CABINET',
          label: 'Cabinet 1',
          size: null,
          storage_type: 'DRY',
          holds_specimens: true,
          capacity: 100,
          archived_at: null,
          created_at: TEST_DATE,
          updated_at: TEST_DATE,
        },
      },
    ],
    specimen_media: [
      {
        id: MEDIA_ID,
        specimen_id: SPECIMEN_ID,
        storage_path: `${SPECIMEN_ID}/image.jpg`,
        display_order: 0,
        caption: 'Dorsal view',
        is_cover: true,
        created_at: TEST_DATE,
      },
    ],
    specimen_tag: [
      { tag: { id: ZOOLOGY_TAG_ID, tag_name: 'zoology' } },
      { tag: { id: ALPHA_TAG_ID, tag_name: 'Alpha' } },
    ],
    ...overrides,
  };
}

describe('SpecimenDetailsService', () => {
  let service: SpecimenDetailsService;

  beforeEach(async () => {
    jest.resetAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SpecimenDetailsService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    service = module.get(SpecimenDetailsService);
  });

  it('returns the integrated record with active quantity and stable tags', async () => {
    specimenFindUnique.mockResolvedValue(detailRecord());

    const result = await service.findOne(SPECIMEN_ID);

    expect(specimenFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: SPECIMEN_ID },
        include: expect.objectContaining({
          specimen_lot: expect.objectContaining({
            where: { is_active: true },
          }),
        }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        specimen: expect.objectContaining({
          id: SPECIMEN_ID,
          collectionId: COLLECTION_ID,
        }),
        collection: expect.objectContaining({
          id: COLLECTION_ID,
          collectionName: 'Zoology',
        }),
        taxonomy: expect.objectContaining({ kingdom: 'Animalia' }),
        provenance: expect.objectContaining({
          collectionDate: '2026-08-20',
        }),
        lotOverview: { activeLotCount: 1, totalQuantity: 3 },
        activeLots: [
          expect.objectContaining({
            id: LOT_ID,
            storageUnit: expect.objectContaining({
              id: STORAGE_ID,
              label: 'Cabinet 1',
            }),
          }),
        ],
        media: [expect.objectContaining({ id: MEDIA_ID, isCover: true })],
        tags: [
          { id: ALPHA_TAG_ID, name: 'Alpha' },
          { id: ZOOLOGY_TAG_ID, name: 'zoology' },
        ],
      }),
    );
  });

  it('returns nullable sections and empty collections without guessing data', async () => {
    specimenFindUnique.mockResolvedValue(
      detailRecord({
        collection_id: null,
        collection: null,
        specimen_taxonomy: null,
        specimen_provenance: null,
        specimen_lot: [],
        specimen_media: [],
        specimen_tag: [],
      }),
    );

    await expect(service.findOne(SPECIMEN_ID)).resolves.toEqual(
      expect.objectContaining({
        collection: null,
        taxonomy: null,
        provenance: null,
        activeLots: [],
        lotOverview: { activeLotCount: 0, totalQuantity: 0 },
        media: [],
        tags: [],
      }),
    );
  });

  it('returns a clear not-found error for a missing specimen', async () => {
    specimenFindUnique.mockResolvedValue(null);

    await expect(service.findOne(SPECIMEN_ID)).rejects.toThrow(
      new NotFoundException(`Specimen ${SPECIMEN_ID} not found`),
    );
  });
});
