import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { SpecimenDuplicatesService } from './specimen-duplicates.service';
import { SpecimenImportService } from './specimen-import.service';
import { SpecimensService } from './specimens.service';

const specimenDelegate = { findMany: jest.fn() };
const collectionDelegate = { findMany: jest.fn() };
const transactionMock = jest.fn();

const prismaMock = {
  specimen: specimenDelegate,
  collection: collectionDelegate,
  $transaction: transactionMock,
};

const specimensServiceMock = {
  createUncatalogedRecordFor: jest.fn(),
};

const COLLECTION_ID = '44444444-4444-4444-8444-444444444444';
const CURATOR_ID = 'curator-1';
const OTHER_CURATOR_ID = 'curator-2';

function csvFile(content: string): Express.Multer.File {
  return {
    originalname: 'specimens.csv',
    buffer: Buffer.from(content, 'utf8'),
  } as Express.Multer.File;
}

describe('SpecimenImportService', () => {
  let service: SpecimenImportService;

  beforeEach(async () => {
    jest.resetAllMocks();
    specimenDelegate.findMany.mockResolvedValue([]);
    collectionDelegate.findMany.mockResolvedValue([]);
    transactionMock.mockImplementation(
      (operation: (transaction: typeof prismaMock) => unknown) =>
        Promise.resolve(operation(prismaMock)),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SpecimenImportService,
        SpecimenDuplicatesService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: SpecimensService, useValue: specimensServiceMock },
      ],
    }).compile();

    service = module.get<SpecimenImportService>(SpecimenImportService);
  });

  describe('previewImport', () => {
    it('rejects a missing file', async () => {
      await expect(
        service.previewImport(undefined, CURATOR_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a non-CSV file', async () => {
      const file = csvFile('a,b\n1,2\n');
      file.originalname = 'specimens.xlsx';
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
      const file = csvFile('scientificName,commonName,remarks\n,,\n');
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

    it('flags an invalid enum value as a row error', async () => {
      const file = csvFile('scientificName,gender\nTestus specimenus,Xyz\n');
      const result = await service.previewImport(file, CURATOR_ID);

      expect(result.validRows).toBe(0);
      expect(result.rows[0].valid).toBe(false);
      expect(result.rows[0].errors.length).toBeGreaterThan(0);
    });

    it('flags a collectionId that does not exist', async () => {
      collectionDelegate.findMany.mockResolvedValue([]);
      const file = csvFile(`collectionId\n${COLLECTION_ID}\n`);
      const result = await service.previewImport(file, CURATOR_ID);

      expect(result.rows[0].valid).toBe(false);
      expect(result.rows[0].errors[0]).toContain('does not exist');
    });

    it('warns, without invalidating, when a row matches an existing accession number', async () => {
      specimenDelegate.findMany.mockResolvedValue([
        {
          accession_number: 'ABC-100',
          scientific_name: null,
          common_name: null,
        },
      ]);
      const file = csvFile('accessionNumber\nabc-100\n');
      const result = await service.previewImport(file, CURATOR_ID);

      expect(result.rows[0].valid).toBe(true);
      expect(result.rows[0].duplicateWarnings).toEqual([
        'Matches the accession number of an existing specimen record.',
      ]);
      expect(result.rowsWithWarnings).toBe(1);
    });

    it('warns on in-batch accession-number duplicates across rows', async () => {
      const file = csvFile('accessionNumber\nABC-100\nabc-100\n');
      const result = await service.previewImport(file, CURATOR_ID);

      expect(result.rows[0].duplicateWarnings[0]).toContain('row(s) 2');
      expect(result.rows[1].duplicateWarnings[0]).toContain('row(s) 1');
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
        'Matches the accession number of an existing specimen record.',
        'Matches the scientific and common name of an existing specimen record; confirm this is not a duplicate before importing.',
      ]);
      expect(result.rows[0].valid).toBe(true);
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
      const file = csvFile('scientificName,gender\nTestus specimenus,Xyz\n');
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
});
