import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
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
        { provide: PrismaService, useValue: prismaMock },
        { provide: SpecimensService, useValue: specimensServiceMock },
      ],
    }).compile();

    service = module.get<SpecimenImportService>(SpecimenImportService);
  });

  describe('previewImport', () => {
    it('rejects a missing file', async () => {
      await expect(service.previewImport(undefined)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects a non-CSV file', async () => {
      const file = csvFile('a,b\n1,2\n');
      file.originalname = 'specimens.xlsx';
      await expect(service.previewImport(file)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects a file with no data rows', async () => {
      const file = csvFile('scientificName,commonName\n');
      await expect(service.previewImport(file)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects a file over the row cap', async () => {
      const header = 'scientificName,commonName\n';
      const rows = Array.from(
        { length: 501 },
        () => 'Testus specimenus,Test specimen\n',
      ).join('');
      await expect(
        service.previewImport(csvFile(header + rows)),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('accepts header aliases and reports a valid row with no warnings', async () => {
      const file = csvFile(
        'Scientific Name,Common Name,Gender\nTestus specimenus,Test specimen,Male\n',
      );
      const result = await service.previewImport(file);

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

    it('reports unmapped columns without failing the row', async () => {
      const file = csvFile(
        'scientificName,unknownColumn\nTestus specimenus,foo\n',
      );
      const result = await service.previewImport(file);

      expect(result.unmappedColumns).toEqual(['unknownColumn']);
      expect(result.rows[0].valid).toBe(true);
    });

    it('flags an invalid enum value as a row error', async () => {
      const file = csvFile('scientificName,gender\nTestus specimenus,Xyz\n');
      const result = await service.previewImport(file);

      expect(result.validRows).toBe(0);
      expect(result.rows[0].valid).toBe(false);
      expect(result.rows[0].errors.length).toBeGreaterThan(0);
    });

    it('flags a collectionId that does not exist', async () => {
      collectionDelegate.findMany.mockResolvedValue([]);
      const file = csvFile(`collectionId\n${COLLECTION_ID}\n`);
      const result = await service.previewImport(file);

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
      const result = await service.previewImport(file);

      expect(result.rows[0].valid).toBe(true);
      expect(result.rows[0].duplicateWarnings).toEqual([
        'Matches the accession number of an existing specimen record.',
      ]);
      expect(result.rowsWithWarnings).toBe(1);
    });

    it('warns on in-batch accession-number duplicates across rows', async () => {
      const file = csvFile('accessionNumber\nABC-100\nabc-100\n');
      const result = await service.previewImport(file);

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
      const result = await service.previewImport(file);

      expect(result.rows[0].duplicateWarnings).toEqual([
        'Matches the scientific and common name of an existing specimen record; confirm this is not a duplicate before importing.',
      ]);
    });
  });

  describe('commitImport', () => {
    it('creates a specimen per row and tags the audit details with the row number and a shared batch id', async () => {
      specimensServiceMock.createUncatalogedRecordFor.mockResolvedValue({
        id: 'created-1',
      });

      const result = await service.commitImport(
        [
          { rowNumber: 1, scientificName: 'Testus specimenus' },
          { rowNumber: 2, scientificName: 'Alius specimenus' },
        ],
        'curator-1',
      );

      expect(result.createdCount).toBe(2);
      expect(result.failedCount).toBe(0);
      expect(
        specimensServiceMock.createUncatalogedRecordFor,
      ).toHaveBeenCalledTimes(2);

      const [, , , firstAction, firstDetails] =
        specimensServiceMock.createUncatalogedRecordFor.mock.calls[0];
      const [, , , secondAction, secondDetails] =
        specimensServiceMock.createUncatalogedRecordFor.mock.calls[1];
      expect(firstAction).toBe('IMPORT_SPECIMEN');
      expect(secondAction).toBe('IMPORT_SPECIMEN');
      expect(firstDetails.importBatchId).toBe(secondDetails.importBatchId);
      expect(firstDetails.rowNumber).toBe(1);
      expect(secondDetails.rowNumber).toBe(2);
    });

    it('keeps processing remaining rows when one row fails', async () => {
      specimensServiceMock.createUncatalogedRecordFor
        .mockRejectedValueOnce(new NotFoundException('Collection x not found'))
        .mockResolvedValueOnce({ id: 'created-2' });

      const result = await service.commitImport(
        [
          { rowNumber: 1, collectionId: 'missing' },
          { rowNumber: 2, scientificName: 'Alius specimenus' },
        ],
        'curator-1',
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

      const result = await service.commitImport(
        [{ rowNumber: 1, scientificName: 'Testus specimenus' }],
        'curator-1',
      );

      expect(result.results[0].success).toBe(false);
      expect(result.results[0].errors?.[0]).not.toContain('connection reset');
    });
  });
});
