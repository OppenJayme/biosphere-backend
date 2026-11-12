import { Test } from '@nestjs/testing';
import { loadExportSheets } from '../backup/excel/export-sheets';
import { WeeklyExportService } from '../backup/excel/weekly-export.service';
import { PrismaService } from '../prisma/prisma.service';
import { SpecimenLotsService } from '../specimen-lots/specimen-lots.service';
import { SpecimenAccessionService } from './specimen-accession.service';
import { SpecimenDuplicatesService } from './specimen-duplicates.service';
import { SpecimenImportService } from './specimen-import.service';
import { SpecimenProvenanceService } from './specimen-provenance.service';
import { SpecimenTaxonomyService } from './specimen-taxonomy.service';
import { SpecimensService } from './specimens.service';

/**
 * A weekly backup workbook (built by the real export code) must import as
 * it is (museum requirement, 2026-11-12). This covers restoring into a
 * system where collections and storage units were recreated with new IDs,
 * so they are matched by name and by storage path.
 */

const OLD_COLLECTION = '11111111-1111-4111-8111-111111111111';
const NEW_COLLECTION = '22222222-2222-4222-8222-222222222222';
const OLD = {
  room: '31111111-1111-4111-8111-111111111111',
  cabinet: '32222222-2222-4222-8222-222222222222',
  drawer1: '33333333-3333-4333-8333-333333333333',
  drawer2: '34444444-4444-4444-8444-444444444444',
};
const NEW = {
  room: '41111111-1111-4111-8111-111111111111',
  cabinet: '42222222-2222-4222-8222-222222222222',
  drawer1: '43333333-3333-4333-8333-333333333333',
  drawer2: '44444444-4444-4444-8444-444444444444',
};

const unit = (
  id: string,
  parent_id: string | null,
  label: string,
  holds_specimens: boolean,
) => ({ id, parent_id, label, holds_specimens, archived_at: null });

const specimen = (overrides: Record<string, unknown>) => ({
  specimen_category: null,
  scientific_name: null,
  common_name: null,
  gender: null,
  classification_status: null,
  status: 'UNCATALOGED',
  public_display_allowed: false,
  collection_id: null,
  collection: null,
  specimen_taxonomy: null,
  specimen_provenance: null,
  specimen_tag: [],
  remarks: null,
  created_at: new Date('2026-10-01T02:00:00Z'),
  updated_at: new Date('2026-10-02T02:00:00Z'),
  archived_at: null,
  ...overrides,
});

const lot = (
  id: string,
  specimen_id: string,
  accession_number: string,
  storage_unit_id: string,
  quantity: number,
  is_active = true,
) => ({
  id,
  specimen_id,
  specimen: { accession_number },
  storage_unit_id,
  condition_class: 'Good',
  quantity,
  storage_notes: id === 'lot-1' ? 'Top shelf' : null,
  is_active,
  created_at: new Date('2026-10-01T02:00:00Z'),
  updated_at: new Date('2026-10-01T02:00:00Z'),
});

/** The backed-up system, as the export's snapshot transaction reads it. */
const BACKED_UP: Record<string, unknown[]> = {
  specimen: [
    specimen({
      id: 's-1',
      accession_number: 'USC-BM-2026-0001',
      specimen_category: 'Mammal',
      scientific_name: 'Paradoxurus hermaphroditus',
      common_name: 'Asian palm civet',
      gender: 'MALE',
      status: 'CATALOGED',
      collection_id: OLD_COLLECTION,
      collection: { collection_name: 'Mammals' },
      specimen_taxonomy: {
        kingdom: 'Animalia',
        phylum: 'Chordata',
        class: 'Mammalia',
        order_name: 'Carnivora',
        family: 'Viverridae',
        genus: 'Paradoxurus',
        species: 'hermaphroditus',
      },
      specimen_provenance: {
        collector: 'J. Cruz',
        collection_date: new Date('2026-03-14T00:00:00Z'),
        collection_location: 'Cebu City',
        preservation_type: 'Dry',
        preservation_method: 'Skin mount',
      },
    }),
    specimen({
      id: 's-2',
      accession_number: '000123',
      common_name: 'Rhinoceros beetle',
      archived_at: new Date('2026-10-05T02:00:00Z'),
    }),
    specimen({
      id: 's-3',
      accession_number: 'USC-BM-2026-0003',
      scientific_name: 'Rana sp.',
    }),
  ],
  specimen_lot: [
    lot('lot-1', 's-1', 'USC-BM-2026-0001', OLD.drawer1, 2),
    lot('lot-2', 's-1', 'USC-BM-2026-0001', OLD.drawer2, 1),
    lot('lot-3', 's-1', 'USC-BM-2026-0001', OLD.drawer2, 4, false),
    lot('lot-4', 's-3', 'USC-BM-2026-0003', OLD.drawer1, 7),
  ],
  storage_unit: [
    unit(OLD.room, null, 'Zoology Room', false),
    unit(OLD.cabinet, OLD.room, 'Cabinet A', false),
    unit(OLD.drawer1, OLD.cabinet, 'Drawer 1', true),
    unit(OLD.drawer2, OLD.cabinet, 'Drawer 2', true),
  ],
  collection: [
    { id: OLD_COLLECTION, collection_name: 'Mammals', _count: { specimen: 1 } },
  ],
  // More rows than one import allows: sheets the import does not read must
  // not block it.
  inquiry: Array.from({ length: 600 }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    created_at: new Date('2026-10-01T02:00:00Z'),
  })),
};

const snapshot = new Proxy(
  {},
  {
    get: (_, model: string) => ({
      findMany: () => Promise.resolve(BACKED_UP[model] ?? []),
      count: () => Promise.resolve((BACKED_UP[model] ?? []).length),
    }),
  },
);

async function backupWorkbook(): Promise<Buffer> {
  const sheets = await loadExportSheets(snapshot as never);
  const exporter = Object.create(
    WeeklyExportService.prototype,
  ) as WeeklyExportService;
  Object.assign(exporter, { config: { get: () => 'test' } });
  return exporter.buildWorkbook(
    sheets,
    '2026-11-14',
    new Date('2026-11-14T10:00:00Z'),
  ).workbook;
}

describe('importing a weekly backup workbook', () => {
  const prismaMock = {
    specimen: { findMany: jest.fn().mockResolvedValue([]) },
    // Restored system: same names and labels, new IDs.
    collection: {
      findMany: jest
        .fn()
        .mockResolvedValue([
          { id: NEW_COLLECTION, collection_name: 'Mammals' },
        ]),
    },
    storage_unit: {
      findMany: jest
        .fn()
        .mockResolvedValue([
          unit(NEW.room, null, 'Zoology Room', false),
          unit(NEW.cabinet, NEW.room, 'Cabinet A', false),
          unit(NEW.drawer1, NEW.cabinet, 'Drawer 1', true),
          unit(NEW.drawer2, NEW.cabinet, 'Drawer 2', true),
        ]),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn(),
  };
  const specimensMock = {
    createUncatalogedRecordFor: jest.fn(),
    findOneInTransaction: jest.fn(),
  };
  const taxonomyMock = { createInTransaction: jest.fn() };
  const provenanceMock = { createInTransaction: jest.fn() };
  const lotsMock = { createInTransaction: jest.fn() };
  let service: SpecimenImportService;
  let file: Express.Multer.File;

  beforeAll(async () => {
    file = {
      originalname: 'biosphere-weekly-export-2026-11-14.xlsx',
      buffer: await backupWorkbook(),
    } as Express.Multer.File;
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation(
      (operation: (tx: typeof prismaMock) => unknown) =>
        Promise.resolve(operation(prismaMock)),
    );
    specimensMock.createUncatalogedRecordFor.mockImplementation(
      (_tx: unknown, dto: { accessionNumber: string }) =>
        Promise.resolve({ id: `new-${dto.accessionNumber}` }),
    );
    specimensMock.findOneInTransaction.mockImplementation(
      (_tx: unknown, id: string) => Promise.resolve({ id }),
    );
    const module = await Test.createTestingModule({
      providers: [
        SpecimenImportService,
        SpecimenDuplicatesService,
        SpecimenAccessionService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: SpecimensService, useValue: specimensMock },
        { provide: SpecimenTaxonomyService, useValue: taxonomyMock },
        { provide: SpecimenProvenanceService, useValue: provenanceMock },
        { provide: SpecimenLotsService, useValue: lotsMock },
      ],
    }).compile();
    service = module.get(SpecimenImportService);
  });

  it('previews every backed-up specimen with its details and active lots', async () => {
    const preview = await service.previewImport(file, 'curator-1');

    expect(preview.totalRows).toBe(3);
    expect(preview.invalidRows).toBe(0);
    expect(preview.rows.every((row) => row.fieldWarnings.length === 0)).toBe(
      true,
    );
    expect(preview.lotSheet).toEqual({ matched: 3, inactive: 1, unmatched: 0 });
    expect(preview.unmappedColumns).toEqual(
      expect.arrayContaining(['Status', 'Tags', 'Created', 'Updated']),
    );

    const [civet, beetle, frog] = preview.rows;
    expect(civet.data).toMatchObject({
      accessionNumber: 'USC-BM-2026-0001',
      specimenCategory: 'Mammal',
      gender: 'MALE',
      kingdom: 'Animalia',
      collectionDate: '2026-03-14',
    });
    // Collection matched by name, lots by storage path: catalog-ready again.
    expect(civet.catalogReadiness.requirementsMet).toBe(true);
    expect(beetle.archivedInSource).toBe(true);
    expect(beetle.data.accessionNumber).toBe('000123');
    expect(frog.archivedInSource).toBe(false);
    expect(preview.archivedRows).toBe(1);
  });

  it('restores the active specimens, leaving the archived one out by default', async () => {
    const preview = await service.previewImport(file, 'curator-1');
    const result = await service.commitImport(
      preview.previewId,
      undefined,
      'curator-1',
    );

    expect(result.createdCount).toBe(2);
    const created = specimensMock.createUncatalogedRecordFor.mock.calls.map(
      ([, dto]) => dto as { accessionNumber: string; collectionId?: string },
    );
    expect(created.map((dto) => dto.accessionNumber)).toEqual([
      'USC-BM-2026-0001',
      'USC-BM-2026-0003',
    ]);
    expect(created[0].collectionId).toBe(NEW_COLLECTION);
    expect(taxonomyMock.createInTransaction).toHaveBeenCalledWith(
      prismaMock,
      'new-USC-BM-2026-0001',
      expect.objectContaining({ family: 'Viverridae', orderName: 'Carnivora' }),
      'curator-1',
    );
    expect(
      lotsMock.createInTransaction.mock.calls.map((call: unknown[]) => call[2]),
    ).toEqual([
      expect.objectContaining({
        storageUnitId: NEW.drawer1,
        quantity: 2,
        storageNotes: 'Top shelf',
      }),
      expect.objectContaining({ storageUnitId: NEW.drawer2, quantity: 1 }),
      expect.objectContaining({ storageUnitId: NEW.drawer1, quantity: 7 }),
    ]);
  });

  it('imports the archived specimen too when the curator selects it', async () => {
    const preview = await service.previewImport(file, 'curator-1');
    const result = await service.commitImport(
      preview.previewId,
      [2],
      'curator-1',
    );

    expect(result.createdCount).toBe(1);
    expect(specimensMock.createUncatalogedRecordFor).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({
        accessionNumber: '000123',
        commonName: 'Rhinoceros beetle',
      }),
      'curator-1',
      'IMPORT_SPECIMEN',
      expect.anything(),
    );
  });
});
