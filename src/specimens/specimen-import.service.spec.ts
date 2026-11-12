import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { readSheet } from 'read-excel-file/node';
import { parse } from 'csv-parse/sync';
import { buildXlsx, type XlsxSheet } from '../common/excel/xlsx-writer';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SpecimenLotsService } from '../specimen-lots/specimen-lots.service';
import { SpecimenAccessionService } from './specimen-accession.service';
import { SpecimenDuplicatesService } from './specimen-duplicates.service';
import {
  parseArchivedValue,
  SpecimenImportService,
} from './specimen-import.service';
import {
  IMPORT_TEMPLATE_COLUMNS,
  buildImportTemplate,
} from './import-template';
import { SpecimenProvenanceService } from './specimen-provenance.service';
import { SpecimenTaxonomyService } from './specimen-taxonomy.service';
import { SpecimensService } from './specimens.service';

const specimenDelegate = { findMany: jest.fn() };
const collectionDelegate = { findMany: jest.fn() };
const storageUnitDelegate = { findMany: jest.fn() };
const transactionMock = jest.fn();
const queryRawMock = jest.fn();

const prismaMock = {
  specimen: specimenDelegate,
  collection: collectionDelegate,
  storage_unit: storageUnitDelegate,
  $transaction: transactionMock,
  $queryRaw: queryRawMock,
};

/** A row of the accession-holder lookup, as PostgreSQL returns it. */
function accessionHolderRow(overrides: Record<string, unknown> = {}) {
  return {
    input_value: 'ABC-100',
    id: 'existing-1',
    accession_number: 'ABC-100',
    scientific_name: null,
    common_name: null,
    status: 'UNCATALOGED',
    ...overrides,
  };
}

const specimensServiceMock = {
  createUncatalogedRecordFor: jest.fn(),
  findOneInTransaction: jest.fn(),
};
const taxonomyServiceMock = { createInTransaction: jest.fn() };
const provenanceServiceMock = { createInTransaction: jest.fn() };
const lotsServiceMock = { createInTransaction: jest.fn() };

const ROOM_ID = '55555555-5555-4555-8555-555555555555';
const CABINET_ID = '66666666-6666-4666-8666-666666666666';
const DRAWER_ID = '77777777-7777-4777-8777-777777777777';
const OTHER_DRAWER_ID = '88888888-8888-4888-8888-888888888888';

function storageUnits() {
  const unit = (
    id: string,
    parent_id: string | null,
    label: string,
    holds_specimens: boolean,
  ) => ({ id, parent_id, label, holds_specimens, archived_at: null });
  return [
    unit(ROOM_ID, null, 'Zoology Room', false),
    unit(CABINET_ID, ROOM_ID, 'Cabinet A', false),
    unit(DRAWER_ID, CABINET_ID, 'Drawer 1', true),
    unit(OTHER_DRAWER_ID, ROOM_ID, 'Drawer 1', true),
  ];
}

const COLLECTION_ID = '44444444-4444-4444-8444-444444444444';
const CURATOR_ID = 'curator-1';
const OTHER_CURATOR_ID = 'curator-2';

/**
 * Test rows are written as CSV text for readability, then turned into the
 * .xlsx workbook the import accepts (one "Specimens" sheet, all text cells).
 * `extraSheets` adds further sheets, such as a backup's "Lots" sheet.
 */
function csvFile(
  content: string,
  extraSheets: { name: string; csv: string }[] = [],
): Express.Multer.File {
  const sheet = (name: string, csv: string): XlsxSheet => {
    const [header, ...rows] = parse(csv, {
      relax_column_count: true,
      skip_empty_lines: true,
    });
    return {
      name,
      header,
      rows: rows.map((row) => row.map((cell) => (cell === '' ? null : cell))),
    };
  };
  return {
    originalname: 'specimens.xlsx',
    buffer: buildXlsx([
      sheet('Specimens', content),
      ...extraSheets.map((extra) => sheet(extra.name, extra.csv)),
    ]).body,
  } as Express.Multer.File;
}

describe('SpecimenImportService', () => {
  let service: SpecimenImportService;

  beforeEach(async () => {
    jest.resetAllMocks();
    specimenDelegate.findMany.mockResolvedValue([]);
    collectionDelegate.findMany.mockResolvedValue([]);
    queryRawMock.mockResolvedValue([]);
    transactionMock.mockImplementation(
      (operation: (transaction: typeof prismaMock) => unknown) =>
        Promise.resolve(operation(prismaMock)),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SpecimenImportService,
        SpecimenDuplicatesService,
        SpecimenAccessionService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: SpecimensService, useValue: specimensServiceMock },
        { provide: SpecimenTaxonomyService, useValue: taxonomyServiceMock },
        { provide: SpecimenProvenanceService, useValue: provenanceServiceMock },
        { provide: SpecimenLotsService, useValue: lotsServiceMock },
      ],
    }).compile();

    service = module.get<SpecimenImportService>(SpecimenImportService);
  });

  it('leaves a future collection date blank with a warning, without creating records', async () => {
    const result = await service.previewImport(
      csvFile(
        'commonName,collectionDate\nValid specimen,2020-01-01\nFuture specimen,2099-01-01',
      ),
      CURATOR_ID,
    );
    expect(result.validRows).toBe(2);
    expect(result.invalidRows).toBe(0);
    expect(result.rows[0].fieldWarnings).toEqual([]);
    expect(result.rows[1].fieldWarnings.join(' ')).toContain(
      'on or before today',
    );
    expect(result.rows[1].fieldWarnings.join(' ')).toContain(
      'it will be left blank',
    );
    expect(result.rowsWithFieldWarnings).toBe(1);
    expect(
      specimensServiceMock.createUncatalogedRecordFor,
    ).not.toHaveBeenCalled();
  });

  describe('previewImport', () => {
    it('rejects a missing file', async () => {
      await expect(
        service.previewImport(undefined, CURATOR_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a CSV or any other non-.xlsx file', async () => {
      const file = csvFile('a,b\n1,2\n');
      file.originalname = 'specimens.csv';
      file.buffer = Buffer.from('commonName\nCivet\n', 'utf8');
      await expect(
        service.previewImport(file, CURATOR_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a file with no data rows', async () => {
      const file = csvFile('scientificName,commonName\n');
      await expect(
        service.previewImport(file, CURATOR_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a file over the row cap', async () => {
      const header = 'scientificName,commonName\n';
      const rows = Array.from(
        { length: 501 },
        () => 'Testus specimenus,Test specimen\n',
      ).join('');
      await expect(
        service.previewImport(csvFile(header + rows), CURATOR_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a file whose columns are entirely unmapped', async () => {
      const file = csvFile('foo,bar\nvalue1,value2\n');
      await expect(
        service.previewImport(file, CURATOR_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('flags a row with recognized headers but no values in any of them', async () => {
      const file = csvFile('scientificName,commonName,notes\n,,only here\n');
      const result = await service.previewImport(file, CURATOR_ID);

      expect(result.rows[0].valid).toBe(false);
      expect(result.rows[0].errors[0]).toContain('no recognized values');
    });

    it('accepts header aliases and reports a valid row with no warnings', async () => {
      const file = csvFile(
        'Scientific Name,Common Name,Gender\nTestus specimenus,Test specimen,Male\n',
      );
      const result = await service.previewImport(file, CURATOR_ID);

      expect(result.previewId).toBeDefined();
      expect(result.totalRows).toBe(1);
      expect(result.validRows).toBe(1);
      expect(result.rows[0]).toMatchObject({
        rowNumber: 1,
        errors: [],
        duplicateWarnings: [],
        valid: true,
      });
      expect(result.rows[0].data).toMatchObject({
        scientificName: 'Testus specimenus',
        commonName: 'Test specimen',
        gender: 'MALE',
      });
    });

    it('reports unmapped columns without failing the row when other columns do map', async () => {
      const file = csvFile(
        'scientificName,unknownColumn\nTestus specimenus,foo\n',
      );
      const result = await service.previewImport(file, CURATOR_ID);

      expect(result.unmappedColumns).toEqual(['unknownColumn']);
      expect(result.rows[0].valid).toBe(true);
    });

    it('leaves an unknown sex value blank with a warning instead of blocking', async () => {
      const file = csvFile('scientificName,gender\nTestus specimenus,Xyz\n');
      const result = await service.previewImport(file, CURATOR_ID);

      expect(result.validRows).toBe(1);
      expect(result.rows[0].errors).toEqual([]);
      expect(result.rows[0].fieldWarnings).toEqual([
        expect.stringMatching(/^Sex "XYZ" can't be used .*left blank\.$/),
      ]);
    });

    it('blocks only a row with neither a common nor a scientific name', async () => {
      const result = await service.previewImport(
        csvFile(
          'commonName,scientificName,remarks\nCivet,,\n,Paradoxurus,\n,,Unlabelled jar\n',
        ),
        CURATOR_ID,
      );

      expect(result.rows.map((row) => row.valid)).toEqual([true, true, false]);
      expect(result.rows[2].errors).toEqual([
        'Add a common name or a scientific name: a record needs at least one.',
      ]);
    });

    it('reports the prototype header as unmapped without copying it into specimen data', async () => {
      const result = await service.previewImport(
        csvFile('__proto__,commonName\nignored,Synthetic parser control\n'),
        CURATOR_ID,
      );

      expect(result.unmappedColumns).toEqual(['__proto__']);
      expect(result.validRows).toBe(1);
      expect(result.rows[0].data.commonName).toBe('Synthetic parser control');
      expect(Object.hasOwn(result.rows[0].data, '__proto__')).toBe(false);
      expect(Object.getPrototypeOf(result.rows[0].data)).toBe(Object.prototype);
    });

    it('leaves an unknown collection blank with a warning', async () => {
      collectionDelegate.findMany.mockResolvedValue([]);
      const file = csvFile(`collectionId,commonName\n${COLLECTION_ID},Civet\n`);
      const result = await service.previewImport(file, CURATOR_ID);

      expect(result.rows[0].valid).toBe(true);
      expect(result.rows[0].fieldWarnings).toEqual([
        `Collection "${COLLECTION_ID}" was not found; it will be left blank. Choose the collection after importing.`,
      ]);
      expect(result.rows[0].catalogReadiness.missingRequirements).toContain(
        'Collection is assigned',
      );
    });

    it('matches a collection by name, ignoring case, but never an ambiguous name', async () => {
      collectionDelegate.findMany.mockResolvedValue([
        { id: COLLECTION_ID, collection_name: 'Mammals' },
        { id: 'dup-1', collection_name: 'Insects' },
        { id: 'dup-2', collection_name: 'insects ' },
      ]);
      const result = await service.previewImport(
        csvFile('Collection,commonName\nmammals,Civet\nInsects,Beetle\n'),
        CURATOR_ID,
      );

      expect(result.rows[0].fieldWarnings).toEqual([]);
      expect(result.rows[0].catalogReadiness.missingRequirements).not.toContain(
        'Collection is assigned',
      );
      expect(result.rows[1].fieldWarnings[0]).toContain(
        'Collection "Insects" was not found',
      );
    });

    it('blocks a row whose accession number is already assigned, case-insensitively', async () => {
      queryRawMock.mockResolvedValue([
        accessionHolderRow({ input_value: 'abc-100' }),
      ]);
      const file = csvFile('accessionNumber,commonName\nabc-100,Civet\n');
      const result = await service.previewImport(file, CURATOR_ID);

      expect(result.rows[0].valid).toBe(false);
      expect(result.rows[0].errors).toEqual([
        'Accession number "abc-100" is already assigned to an existing specimen record.',
      ]);
      expect(result.rows[0].duplicateWarnings).toEqual([]);
      expect(result.invalidRows).toBe(1);
    });

    it('blocks a row matching a legacy stored number with surrounding spaces', async () => {
      queryRawMock.mockResolvedValue([
        accessionHolderRow({ accession_number: ' ABC-100 ' }),
      ]);
      const file = csvFile('accessionNumber\nABC-100\n');
      const result = await service.previewImport(file, CURATOR_ID);

      const [sql] = queryRawMock.mock.calls[0] as [Prisma.Sql];
      expect(sql.text.replace(/\s+/g, ' ')).toContain(
        'lower(btrim(s.accession_number)) = lower(btrim(input.value))',
      );
      expect(sql.values).toEqual([['ABC-100']]);
      expect(result.rows[0].valid).toBe(false);
    });

    it('blocks reuse of an Archived record accession number', async () => {
      queryRawMock.mockResolvedValue([
        accessionHolderRow({ status: 'ARCHIVED' }),
      ]);
      const file = csvFile('accessionNumber,commonName\nABC-100,Civet\n');
      const result = await service.previewImport(file, CURATOR_ID);

      expect(result.rows[0].valid).toBe(false);
      expect(result.rows[0].errors).toEqual([
        'Accession number "ABC-100" is already assigned to an existing Archived specimen record.',
      ]);
    });

    it('blocks every row sharing an accession number within the file', async () => {
      const file = csvFile(
        'accessionNumber,commonName\nABC-100,A\n abc-100 ,B\nABC-200,C\nAbc-100,D\n',
      );
      const result = await service.previewImport(file, CURATOR_ID);

      expect(result.rows.map((row) => row.valid)).toEqual([
        false,
        false,
        true,
        false,
      ]);
      expect(result.rows[0].errors[0]).toContain('row(s) 2, 4 in this file');
      expect(result.rows[1].errors[0]).toContain('row(s) 1, 4 in this file');
      expect(result.rows[3].errors[0]).toContain('row(s) 1, 2 in this file');
    });

    it('warns when scientific and common name match an existing record', async () => {
      specimenDelegate.findMany.mockResolvedValue([
        {
          accession_number: null,
          scientific_name: 'Testus specimenus',
          common_name: 'Test specimen',
        },
      ]);
      const file = csvFile(
        'scientificName,commonName\nTestus specimenus,Test specimen\n',
      );
      const result = await service.previewImport(file, CURATOR_ID);

      expect(result.rows[0].duplicateWarnings).toEqual([
        'Matches the scientific and common name of an existing specimen record; confirm this is not a duplicate before importing.',
      ]);
    });

    it('returns the existing specimens a row may duplicate', async () => {
      queryRawMock.mockResolvedValue([accessionHolderRow()]);
      specimenDelegate.findMany.mockResolvedValue([
        {
          id: 'existing-1',
          accession_number: 'ABC-100',
          scientific_name: 'Testus specimenus',
          common_name: 'Test specimen',
          status: 'CATALOGED',
          specimen_provenance: null,
        },
      ]);
      const file = csvFile(
        'accessionNumber,scientificName,commonName\nABC-100,Testus specimenus,Test specimen\n',
      );
      const result = await service.previewImport(file, CURATOR_ID);

      expect(result.rows[0].possibleDuplicates).toEqual([
        expect.objectContaining({
          specimenId: 'existing-1',
          status: 'CATALOGED',
          confidence: 'HIGH',
          matchedFields: ['ACCESSION_NUMBER', 'SCIENTIFIC_NAME', 'COMMON_NAME'],
        }),
      ]);
      expect(result.rows[0].duplicateWarnings).toEqual([
        'Matches the scientific and common name of an existing specimen record; confirm this is not a duplicate before importing.',
      ]);
      expect(result.rows[0].valid).toBe(false);
    });

    it('still warns when same-species rows differ only in gender', async () => {
      specimenDelegate.findMany.mockResolvedValue([
        {
          id: 'existing-1',
          accession_number: null,
          scientific_name: 'Testus specimenus',
          common_name: 'Test specimen',
          status: 'UNCATALOGED',
          specimen_provenance: null,
        },
      ]);
      const file = csvFile(
        'scientificName,commonName,gender\nTestus specimenus,Test specimen,Male\nTestus specimenus,Test specimen,Female\n',
      );
      const result = await service.previewImport(file, CURATOR_ID);

      expect(result.rows[0].duplicateWarnings).toEqual([
        'Matches the scientific and common name of an existing specimen record; confirm this is not a duplicate before importing.',
        'Matches the scientific and common name used by row(s) 2 in this file.',
      ]);
      expect(result.rows[0].possibleDuplicates).toHaveLength(1);
    });

    it('handles a realistic full-size 500-row import', async () => {
      const header = 'scientificName,commonName\n';
      const rows = Array.from(
        { length: 500 },
        (_, index) => `Testus specimenus ${index},Test specimen ${index}\n`,
      ).join('');
      const result = await service.previewImport(
        csvFile(header + rows),
        CURATOR_ID,
      );

      expect(result.totalRows).toBe(500);
      expect(result.validRows).toBe(500);
      expect(result.invalidRows).toBe(0);
      expect(result.rows).toHaveLength(500);
      expect(result.rows[499].rowNumber).toBe(500);
    });
  });

  describe('commitImport', () => {
    async function previewValidRow(
      curatorId = CURATOR_ID,
    ): Promise<{ previewId: string }> {
      const file = csvFile(
        'scientificName,commonName\nTestus specimenus,Test specimen\n',
      );
      const result = await service.previewImport(file, curatorId);
      return { previewId: result.previewId };
    }

    it('rejects a commit for a previewId that was never issued', async () => {
      await expect(
        service.commitImport(
          '00000000-0000-4000-8000-000000000000',
          undefined,
          CURATOR_ID,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("rejects a commit for another curator's preview", async () => {
      const { previewId } = await previewValidRow(CURATOR_ID);

      await expect(
        service.commitImport(previewId, undefined, OTHER_CURATOR_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('commits every valid row from the preview when rowNumbers is omitted', async () => {
      specimensServiceMock.createUncatalogedRecordFor.mockResolvedValue({
        id: 'created-1',
      });
      const { previewId } = await previewValidRow();

      const result = await service.commitImport(
        previewId,
        undefined,
        CURATOR_ID,
      );

      expect(result.createdCount).toBe(1);
      expect(result.failedCount).toBe(0);
      expect(
        specimensServiceMock.createUncatalogedRecordFor,
      ).toHaveBeenCalledTimes(1);
      const [, dto, actingCuratorId, action, details] =
        specimensServiceMock.createUncatalogedRecordFor.mock.calls[0];
      expect(dto).toMatchObject({ scientificName: 'Testus specimenus' });
      expect(actingCuratorId).toBe(CURATOR_ID);
      expect(action).toBe('IMPORT_SPECIMEN');
      expect(details).toMatchObject({ rowNumber: 1, previewId });
    });

    it('does not commit a row the preview marked invalid', async () => {
      const file = csvFile('remarks\nNo name given\n');
      const preview = await service.previewImport(file, CURATOR_ID);
      expect(preview.rows[0].valid).toBe(false);

      const result = await service.commitImport(
        preview.previewId,
        undefined,
        CURATOR_ID,
      );

      expect(result.createdCount).toBe(0);
      expect(
        specimensServiceMock.createUncatalogedRecordFor,
      ).not.toHaveBeenCalled();
    });

    it('rejects an explicit row number that was not part of the preview', async () => {
      const { previewId } = await previewValidRow();

      const result = await service.commitImport(previewId, [99], CURATOR_ID);

      expect(result.failedCount).toBe(1);
      expect(result.results[0].errors?.[0]).toContain(
        'not part of the reviewed preview',
      );
    });

    it('is idempotent: retrying the same previewId does not create a second specimen', async () => {
      specimensServiceMock.createUncatalogedRecordFor.mockResolvedValue({
        id: 'created-1',
      });
      const { previewId } = await previewValidRow();

      const first = await service.commitImport(
        previewId,
        undefined,
        CURATOR_ID,
      );
      const second = await service.commitImport(
        previewId,
        undefined,
        CURATOR_ID,
      );

      expect(
        specimensServiceMock.createUncatalogedRecordFor,
      ).toHaveBeenCalledTimes(1);
      expect(first.results[0].specimen).toEqual(second.results[0].specimen);
      expect(second.results[0].success).toBe(true);
    });

    it('does not create two specimens when two commits race for the same row', async () => {
      let resolveCreate!: (specimen: { id: string }) => void;
      const pendingCreate = new Promise<{ id: string }>((resolve) => {
        resolveCreate = resolve;
      });
      specimensServiceMock.createUncatalogedRecordFor.mockImplementation(
        () => pendingCreate,
      );
      const { previewId } = await previewValidRow();

      // Neither call is awaited yet, so both run their synchronous prefix
      // (which claims the per-row in-flight lock) before either's create
      // actually resolves -- reproducing the race the guard protects against.
      const first = service.commitImport(previewId, undefined, CURATOR_ID);
      const second = service.commitImport(previewId, undefined, CURATOR_ID);

      resolveCreate({ id: 'created-1' });
      const [firstResult, secondResult] = await Promise.all([first, second]);

      expect(
        specimensServiceMock.createUncatalogedRecordFor,
      ).toHaveBeenCalledTimes(1);
      expect(firstResult.results[0].specimen).toEqual({ id: 'created-1' });
      expect(secondResult.results[0].specimen).toEqual({ id: 'created-1' });
    });

    it('keeps processing remaining rows when one row fails', async () => {
      const file = csvFile(
        'scientificName,commonName\nTestus specimenus,Test specimen\nAlius specimenus,Other specimen\n',
      );
      const preview = await service.previewImport(file, CURATOR_ID);
      specimensServiceMock.createUncatalogedRecordFor
        .mockRejectedValueOnce(new NotFoundException('Collection x not found'))
        .mockResolvedValueOnce({ id: 'created-2' });

      const result = await service.commitImport(
        preview.previewId,
        undefined,
        CURATOR_ID,
      );

      expect(result.createdCount).toBe(1);
      expect(result.failedCount).toBe(1);
      expect(result.results[0]).toMatchObject({
        rowNumber: 1,
        success: false,
        errors: ['Collection x not found'],
      });
      expect(result.results[1]).toMatchObject({
        rowNumber: 2,
        success: true,
      });
    });

    it('reports an accession number taken after preview as a row failure', async () => {
      specimensServiceMock.createUncatalogedRecordFor.mockRejectedValue(
        new ConflictException(
          'Accession number "ABC-100" is already assigned to another specimen record.',
        ),
      );
      const { previewId } = await previewValidRow();

      const result = await service.commitImport(
        previewId,
        undefined,
        CURATOR_ID,
      );

      expect(result.results[0]).toEqual({
        rowNumber: 1,
        success: false,
        errors: [
          'Accession number "ABC-100" is already assigned to another specimen record.',
        ],
      });
    });

    it('reports an unexpected error without leaking internal details', async () => {
      specimensServiceMock.createUncatalogedRecordFor.mockRejectedValue(
        new Error('connection reset'),
      );
      const { previewId } = await previewValidRow();

      const result = await service.commitImport(
        previewId,
        undefined,
        CURATOR_ID,
      );

      expect(result.results[0].success).toBe(false);
      expect(result.results[0].errors?.[0]).not.toContain('connection reset');
    });

    it('commits a realistic full-size 500-row import', async () => {
      specimensServiceMock.createUncatalogedRecordFor.mockImplementation(() =>
        Promise.resolve({ id: 'created' }),
      );
      const header = 'scientificName,commonName\n';
      const rows = Array.from(
        { length: 500 },
        (_, index) => `Testus specimenus ${index},Test specimen ${index}\n`,
      ).join('');
      const preview = await service.previewImport(
        csvFile(header + rows),
        CURATOR_ID,
      );

      const result = await service.commitImport(
        preview.previewId,
        undefined,
        CURATOR_ID,
      );

      expect(result.createdCount).toBe(500);
      expect(result.failedCount).toBe(0);
      expect(
        specimensServiceMock.createUncatalogedRecordFor,
      ).toHaveBeenCalledTimes(500);
    });
  });
  describe('taxonomy, provenance, and lot columns', () => {
    const HEADER =
      'commonName,Kingdom,Class,Order,Family,Collector,Collection Date,Preservation Method,Storage Unit,Condition,Quantity,Storage Notes';

    beforeEach(() => {
      storageUnitDelegate.findMany.mockResolvedValue(storageUnits());
    });

    it('validates and resolves a full row, including a storage path', async () => {
      const result = await service.previewImport(
        csvFile(
          `${HEADER}\nCivet,Animalia,Mammalia,Carnivora,Viverridae,J. Cruz,2026-03-14,Dry skin,Zoology Room > Cabinet A > Drawer 1,Good ,"1,200",Top shelf\n`,
        ),
        CURATOR_ID,
      );

      expect(result.unmappedColumns).toEqual([]);
      expect(result.rows[0]).toEqual(
        expect.objectContaining({ valid: true, errors: [] }),
      );
      expect(storageUnitDelegate.findMany).toHaveBeenCalledTimes(1);
    });

    it('matches a shortened path when it names exactly one unit', async () => {
      const result = await service.previewImport(
        csvFile(
          'commonName,Storage Unit,Condition,Quantity\nCivet,cabinet a › DRAWER 1,Good,2\n',
        ),
        CURATOR_ID,
      );

      expect(result.rows[0].errors).toEqual([]);
    });

    it('imports the row and leaves out unusable lot, taxonomy and provenance values with warnings', async () => {
      const result = await service.previewImport(
        csvFile(
          [
            'commonName,Family,Collection Date,Storage Unit,Condition,Quantity',
            `Civet,${'x'.repeat(101)},14/03/2026,Drawer 1,Good,0`,
            'Civet,,,Zoology Room,Good,',
            `Civet,,,${DRAWER_ID},,3`,
            'Civet,,,Nowhere,Good,3',
          ].join('\n'),
        ),
        CURATOR_ID,
      );

      const [first, second, third, fourth] = result.rows;
      expect(result.rows.every((row) => row.valid)).toBe(true);
      expect(result.rows.every((row) => row.errors.length === 0)).toBe(true);
      expect(first.fieldWarnings).toEqual([
        expect.stringMatching(/^Family "x{57}\.\.\." can't be used/),
        expect.stringMatching(/^Collection date "14\/03\/2026" can't be used/),
        expect.stringMatching(
          /^The lot in this row will not be imported: its quantity "0" is not a whole number of at least 1\. "Drawer 1" matches 2 storage units/,
        ),
      ]);
      expect(second.fieldWarnings).toEqual([
        'The lot in this row will not be imported: it has no quantity. Storage unit "Zoology Room" is not configured to hold specimens. Add it from the specimen\'s inventory after importing.',
      ]);
      expect(third.fieldWarnings).toEqual([
        "The lot in this row will not be imported: it has no condition. Add it from the specimen's inventory after importing.",
      ]);
      expect(fourth.fieldWarnings).toEqual([
        expect.stringMatching(
          /^The lot in this row will not be imported: No active storage unit matches "Nowhere"/,
        ),
      ]);
    });

    it('skips the storage lookup when no row has a lot', async () => {
      await service.previewImport(
        csvFile('commonName,Family\nCivet,Viverridae\n'),
        CURATOR_ID,
      );

      expect(storageUnitDelegate.findMany).not.toHaveBeenCalled();
    });

    it('creates taxonomy, provenance, and the lot in the row transaction', async () => {
      specimensServiceMock.createUncatalogedRecordFor.mockResolvedValue({
        id: 'created-1',
      });
      specimensServiceMock.findOneInTransaction.mockResolvedValue({
        id: 'created-1',
        updatedAt: 'after-extras',
      });
      const { previewId } = await service.previewImport(
        csvFile(
          `${HEADER}\nCivet,Animalia,Mammalia,Carnivora,Viverridae,J. Cruz,2026-03-14,Dry skin,Cabinet A > Drawer 1,Good,12,Top shelf\n`,
        ),
        CURATOR_ID,
      );

      const result = await service.commitImport(
        previewId,
        undefined,
        CURATOR_ID,
      );

      expect(result.createdCount).toBe(1);
      expect(result.results[0]).toEqual(
        expect.objectContaining({
          specimen: { id: 'created-1', updatedAt: 'after-extras' },
        }),
      );
      expect(transactionMock).toHaveBeenCalledTimes(1);
      expect(taxonomyServiceMock.createInTransaction).toHaveBeenCalledWith(
        prismaMock,
        'created-1',
        expect.objectContaining({
          kingdom: 'Animalia',
          class: 'Mammalia',
          orderName: 'Carnivora',
          family: 'Viverridae',
        }),
        CURATOR_ID,
      );
      expect(provenanceServiceMock.createInTransaction).toHaveBeenCalledWith(
        prismaMock,
        'created-1',
        expect.objectContaining({
          collector: 'J. Cruz',
          collectionDate: '2026-03-14',
          preservationMethod: 'Dry skin',
        }),
        CURATOR_ID,
      );
      expect(lotsServiceMock.createInTransaction).toHaveBeenCalledWith(
        prismaMock,
        'created-1',
        expect.objectContaining({
          storageUnitId: DRAWER_ID,
          conditionClass: 'Good',
          quantity: 12,
          storageNotes: 'Top shelf',
          reason: expect.stringMatching(/^Imported from row 1 \(batch /),
        }),
        CURATOR_ID,
      );
    });

    it('commits each row under serializable isolation and retries a write conflict', async () => {
      specimensServiceMock.createUncatalogedRecordFor.mockResolvedValue({
        id: 'created-1',
      });
      specimensServiceMock.findOneInTransaction.mockResolvedValue({
        id: 'created-1',
      });
      const { previewId } = await service.previewImport(
        csvFile(
          'commonName,Storage Unit,Condition,Quantity\nCivet,Cabinet A > Drawer 1,Good,1\n',
        ),
        CURATOR_ID,
      );
      transactionMock
        .mockRejectedValueOnce(
          new Prisma.PrismaClientKnownRequestError('Write conflict', {
            code: 'P2034',
            clientVersion: '7.10.0',
          }),
        )
        .mockImplementationOnce(
          (operation: (transaction: typeof prismaMock) => unknown) =>
            Promise.resolve(operation(prismaMock)),
        );

      const result = await service.commitImport(
        previewId,
        undefined,
        CURATOR_ID,
      );

      expect(result.createdCount).toBe(1);
      expect(transactionMock).toHaveBeenCalledTimes(2);
      expect(transactionMock).toHaveBeenLastCalledWith(expect.any(Function), {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
      expect(lotsServiceMock.createInTransaction).toHaveBeenCalledTimes(1);
    });

    it('reports the row as failed when a related record cannot be created', async () => {
      specimensServiceMock.createUncatalogedRecordFor.mockResolvedValue({
        id: 'created-1',
      });
      lotsServiceMock.createInTransaction.mockRejectedValue(
        new BadRequestException(
          'Archived storage units cannot receive specimen lots.',
        ),
      );
      const { previewId } = await service.previewImport(
        csvFile(
          'commonName,Storage Unit,Condition,Quantity\nCivet,Cabinet A > Drawer 1,Good,1\n',
        ),
        CURATOR_ID,
      );

      const result = await service.commitImport(
        previewId,
        undefined,
        CURATOR_ID,
      );

      expect(result.failedCount).toBe(1);
      expect(result.results[0]).toEqual({
        rowNumber: 1,
        success: false,
        errors: ['Archived storage units cannot receive specimen lots.'],
      });
    });
  });
  describe('catalog readiness in the preview (REQ-4.4-08, REQ-4.4-20)', () => {
    beforeEach(() => {
      storageUnitDelegate.findMany.mockResolvedValue(storageUnits());
    });

    it('reports a row that meets every catalog requirement', async () => {
      collectionDelegate.findMany.mockResolvedValue([
        { id: COLLECTION_ID, collection_name: 'Mammals' },
      ]);

      const result = await service.previewImport(
        csvFile(
          [
            'collectionId,accessionNumber,commonName,Kingdom,Collection Date,Preservation Type,Preservation Method,Storage Unit,Condition,Quantity',
            `${COLLECTION_ID},USC-0001,Civet,Animalia,2026-03-14,Dry,Skin mount,Cabinet A > Drawer 1,Good,2`,
          ].join('\n'),
        ),
        CURATOR_ID,
      );

      expect(result.rows[0].valid).toBe(true);
      expect(result.rows[0].catalogReadiness).toEqual({
        requirementsMet: true,
        resultingStatus: 'UNCATALOGED',
        checks: expect.arrayContaining([
          {
            key: 'activeLot',
            label:
              'An active lot has positive quantity in a specimen-holding storage location',
            passed: true,
          },
        ]),
        missingRequirements: [],
      });
      expect(result.rows[0].catalogReadiness.checks).toHaveLength(8);
      expect(result.catalogReadyRows).toBe(1);
    });

    it('lists the missing requirements of an incomplete row without invalidating it', async () => {
      const result = await service.previewImport(
        csvFile('commonName,Kingdom\nCivet,Animalia\n'),
        CURATOR_ID,
      );

      expect(result.rows[0].valid).toBe(true);
      expect(result.rows[0].errors).toEqual([]);
      // A blank accession number is generated at commit.
      expect(result.rows[0].accessionNumberWillBeGenerated).toBe(true);
      expect(result.rows[0].catalogReadiness).toEqual(
        expect.objectContaining({
          requirementsMet: false,
          resultingStatus: 'UNCATALOGED',
          missingRequirements: [
            'Collection is assigned',
            'A valid collection date on or before today is recorded',
            'Preservation type is recorded',
            'Preservation method is recorded',
            'An active lot has positive quantity in a specimen-holding storage location',
          ],
        }),
      );
      expect(result.catalogReadyRows).toBe(0);
    });

    it('does not count a lot that failed validation as an active lot', async () => {
      const result = await service.previewImport(
        csvFile(
          'commonName,Storage Unit,Condition,Quantity\nCivet,Zoology Room,Good,2\n',
        ),
        CURATOR_ID,
      );

      expect(result.rows[0].valid).toBe(true);
      expect(result.rows[0].fieldWarnings[0]).toContain(
        'The lot in this row will not be imported',
      );
      expect(result.rows[0].catalogReadiness.missingRequirements).toContain(
        'An active lot has positive quantity in a specimen-holding storage location',
      );
      expect(result.catalogReadyRows).toBe(0);
    });
  });

  describe('import template', () => {
    it('maps every template column and previews a filled row with no warnings', async () => {
      storageUnitDelegate.findMany.mockResolvedValue(storageUnits());
      collectionDelegate.findMany.mockResolvedValue([
        { id: COLLECTION_ID, collection_name: 'Zoology Reference' },
      ]);
      const template = await readSheet(buildImportTemplate(), 'Specimens');
      const header = template[0] as string[];
      expect(header).toEqual(
        IMPORT_TEMPLATE_COLUMNS.map((column) => column.header),
      );

      const values: Record<string, string> = {
        'Accession Number': '000123',
        'Common Name': 'Philippine tarsier',
        'Scientific Name': 'Carlito syrichta',
        'Specimen Category': 'Mammal',
        Collection: 'zoology reference',
        Kingdom: 'Animalia',
        'Collection Date': '2020-01-01',
        'Preservation Type': 'Dry',
        'Preservation Method': 'Skin mount',
        'Storage Unit': 'Zoology Room > Cabinet A > Drawer 1',
        Condition: 'Good',
        Quantity: '1',
        Remarks: 'Template check',
      };
      const file = {
        originalname: 'template.xlsx',
        buffer: buildXlsx([
          {
            name: 'Specimens',
            header,
            rows: [header.map((column) => values[column] ?? null)],
          },
        ]).body,
      } as Express.Multer.File;

      const result = await service.previewImport(file, CURATOR_ID);
      expect(result.unmappedColumns).toEqual([]);
      expect(result.validRows).toBe(1);
      // Every catalog requirement, including the collection and the lot.
      expect(result.rows[0].catalogReadiness.missingRequirements).toEqual([]);
      expect(result.rows[0].catalogReadiness.requirementsMet).toBe(true);
      expect(result.rows[0].errors).toEqual([]);
      expect(result.rows[0].fieldWarnings).toEqual([]);
      expect(result.rows[0].data).toMatchObject({
        accessionNumber: '000123',
        collectionName: 'zoology reference',
      });
    });
  });

  it('lists every missing lot part in a readable warning', async () => {
    const result = await service.previewImport(
      csvFile('commonName,condition\nLizard,Fair'),
      CURATOR_ID,
    );
    expect(result.rows[0].valid).toBe(true);
    expect(result.rows[0].fieldWarnings).toEqual([
      "The lot in this row will not be imported: it has no storage unit or quantity. Add it from the specimen's inventory after importing.",
    ]);
  });

  describe('archived column (review of #317)', () => {
    it.each([
      [undefined, false],
      ['', false],
      ['  ', false],
      ['No', false],
      ['n', false],
      ['FALSE', false],
      ['0', false],
      ['Yes', true],
      ['true', true],
      ['1', true],
      ['Archived', true],
      ['2026-11-10', true],
      ['2026-11-10 14:05', true],
      ['2026-11-10T06:05:00.000Z', true],
    ])('reads %p as archived=%p without a warning', (value, archived) => {
      expect(parseArchivedValue(value)).toEqual({ archived });
    });

    it.each(['maybe', '2026-13-45', '10/11/2026', 'archived later'])(
      'treats the malformed value %p as archived, with a warning',
      (value) => {
        const result = parseArchivedValue(value);
        expect(result.archived).toBe(true);
        expect(result.warning).toContain(`Archived value "${value}"`);
      },
    );

    it('selects only rows that are not archived, and explains a malformed value', async () => {
      specimensServiceMock.createUncatalogedRecordFor.mockImplementation(
        (_tx: unknown, dto: { commonName: string }) =>
          Promise.resolve({ id: `created-${dto.commonName}` }),
      );
      const preview = await service.previewImport(
        csvFile(
          [
            'commonName,Archived',
            'Blank,',
            'Said no,No',
            'Said false,false',
            'Timestamp,2026-11-10 14:05',
            'Malformed,maybe',
          ].join('\n'),
        ),
        CURATOR_ID,
      );

      expect(preview.rows.map((row) => row.archivedInSource)).toEqual([
        false,
        false,
        false,
        true,
        true,
      ]);
      expect(preview.archivedRows).toBe(2);
      expect(preview.rows[3].fieldWarnings).toEqual([]);
      expect(preview.rows[4].fieldWarnings).toEqual([
        expect.stringContaining('Archived value "maybe" was not recognized'),
      ]);

      const result = await service.commitImport(
        preview.previewId,
        undefined,
        CURATOR_ID,
      );
      expect(result.results.map((row) => row.rowNumber)).toEqual([1, 2, 3]);
    });
  });

  describe('skipped lots (review of #317)', () => {
    beforeEach(() => {
      storageUnitDelegate.findMany.mockResolvedValue(storageUnits());
      specimensServiceMock.createUncatalogedRecordFor.mockImplementation(
        (_tx: unknown, dto: { commonName: string }) =>
          Promise.resolve({ id: `created-${dto.commonName}` }),
      );
      specimensServiceMock.findOneInTransaction.mockImplementation(
        (_tx: unknown, id: string) => Promise.resolve({ id }),
      );
    });

    it('never creates a lot that the preview left out, and reports it at preview and commit', async () => {
      const preview = await service.previewImport(
        csvFile(
          [
            'commonName,Storage Unit,Condition,Quantity',
            'Kept,Cabinet A > Drawer 1,Good,2',
            'Unresolved,Nowhere > Shelf 9,Good,3',
            'Incomplete,,Fair,',
          ].join('\n'),
        ),
        CURATOR_ID,
      );

      expect(
        preview.rows.map((row) => [row.lotsToImport, row.lotsSkipped]),
      ).toEqual([
        [1, 0],
        [0, 1],
        [0, 1],
      ]);
      expect(preview).toMatchObject({ lotsToImport: 1, lotsSkipped: 2 });
      expect(preview.rows[1].fieldWarnings.join(' ')).toContain(
        'The lot in this row will not be imported',
      );
      // Skipped lots leave the record short of an active lot.
      expect(preview.rows[1].catalogReadiness.missingRequirements).toContain(
        'An active lot has positive quantity in a specimen-holding storage location',
      );

      const result = await service.commitImport(
        preview.previewId,
        undefined,
        CURATOR_ID,
      );

      expect(result.createdCount).toBe(3);
      expect(
        result.results.map((row) => [
          row.rowNumber,
          row.lotsCreated,
          row.lotsSkipped,
        ]),
      ).toEqual([
        [1, 1, 0],
        [2, 0, 1],
        [3, 0, 1],
      ]);
      expect(result).toMatchObject({ lotsCreated: 1, lotsSkipped: 2 });
      expect(lotsServiceMock.createInTransaction).toHaveBeenCalledTimes(1);
      expect(lotsServiceMock.createInTransaction).toHaveBeenCalledWith(
        prismaMock,
        'created-Kept',
        expect.objectContaining({ storageUnitId: DRAWER_ID, quantity: 2 }),
        CURATOR_ID,
      );

      // A retry reports the same counts without creating anything again.
      const retry = await service.commitImport(
        preview.previewId,
        undefined,
        CURATOR_ID,
      );
      expect(retry).toMatchObject({ lotsCreated: 1, lotsSkipped: 2 });
      expect(lotsServiceMock.createInTransaction).toHaveBeenCalledTimes(1);
    });

    it('marks a plain spreadsheet as not a backup restore', async () => {
      const preview = await service.previewImport(
        csvFile('commonName' + '\n' + 'Civet'),
        CURATOR_ID,
      );
      expect(preview.restoreNotice).toBeNull();
    });
  });
});
