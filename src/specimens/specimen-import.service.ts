import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import { isUUID, validate } from 'class-validator';
import type { ValidationError } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { PrismaService } from '../prisma/prisma.service';
import { MAX_IMPORT_ROWS } from './dto/commit-specimen-import.dto';
import { CreateSpecimenDto } from './dto/create-specimen.dto';
import { ImportSpecimenRowDto } from './dto/import-specimen-row.dto';
import {
  SpecimenImportCommitResult,
  SpecimenImportPreviewResult,
} from './entities/specimen-import.entity';
import { SpecimensService } from './specimens.service';

export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;

// Canonical import fields, keyed by a normalized (lowercased, separators
// stripped) header name so the CSV template can use spaces, underscores, or
// mixed case (e.g. "Scientific Name", "scientific_name", "scientificName").
const CANONICAL_FIELDS: Record<string, keyof ImportSpecimenRowDto> = {
  collectionid: 'collectionId',
  accessionnumber: 'accessionNumber',
  specimencategory: 'specimenCategory',
  scientificname: 'scientificName',
  commonname: 'commonName',
  gender: 'gender',
  classificationstatus: 'classificationStatus',
  remarks: 'remarks',
};

interface RowFields {
  collectionId?: string;
  accessionNumber?: string;
  specimenCategory?: string;
  scientificName?: string;
  commonName?: string;
  gender?: string;
  classificationStatus?: string;
  remarks?: string;
}

interface RowContext {
  rowNumber: number;
  fields: RowFields;
  accessionKey?: string;
  scientificCommonKey?: string;
}

@Injectable()
export class SpecimenImportService {
  private readonly logger = new Logger(SpecimenImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly specimens: SpecimensService,
  ) {}

  async previewImport(
    file: Express.Multer.File | undefined,
  ): Promise<SpecimenImportPreviewResult> {
    const rawRecords = this.parseCsv(file);
    if (rawRecords.length === 0) {
      throw new BadRequestException('The uploaded file has no data rows.');
    }
    if (rawRecords.length > MAX_IMPORT_ROWS) {
      throw new BadRequestException(
        `The uploaded file has ${rawRecords.length} rows; at most ${MAX_IMPORT_ROWS} rows are supported per import.`,
      );
    }

    const { headerMap, unmappedColumns } = this.mapHeaders(
      Object.keys(rawRecords[0]),
    );
    const contexts = rawRecords.map((record, index) =>
      this.buildRowContext(record, index + 1, headerMap),
    );

    const [
      existingAccessionNumbers,
      existingScientificCommonPairs,
      existingCollectionIds,
    ] = await Promise.all([
      this.findExistingAccessionNumbers(contexts),
      this.findExistingScientificCommonPairs(contexts),
      this.findExistingCollectionIds(contexts),
    ]);
    const { accessionGroups, scientificCommonGroups } =
      this.buildInBatchGroups(contexts);

    const rows = await Promise.all(
      contexts.map(async (context) => {
        const plain: Record<string, unknown> = {
          rowNumber: context.rowNumber,
          ...context.fields,
        };
        const instance = plainToInstance(ImportSpecimenRowDto, plain);
        const validationErrors = await validate(instance);
        const errors = this.flattenValidationErrors(validationErrors);

        if (
          context.fields.collectionId &&
          isUUID(context.fields.collectionId) &&
          !existingCollectionIds.has(context.fields.collectionId)
        ) {
          errors.push(
            `Collection ${context.fields.collectionId} does not exist.`,
          );
        }

        const duplicateWarnings = this.buildDuplicateWarnings(
          context,
          existingAccessionNumbers,
          existingScientificCommonPairs,
          accessionGroups,
          scientificCommonGroups,
        );

        return {
          rowNumber: context.rowNumber,
          data: plain as unknown as ImportSpecimenRowDto,
          errors,
          duplicateWarnings,
          valid: errors.length === 0,
        };
      }),
    );

    return {
      rows,
      unmappedColumns,
      totalRows: rows.length,
      validRows: rows.filter((row) => row.valid).length,
      invalidRows: rows.filter((row) => !row.valid).length,
      rowsWithWarnings: rows.filter((row) => row.duplicateWarnings.length > 0)
        .length,
    };
  }

  async commitImport(
    rows: ImportSpecimenRowDto[],
    actingCuratorAccountId: string,
  ): Promise<SpecimenImportCommitResult> {
    const importBatchId = randomUUID();
    const results: SpecimenImportCommitResult['results'] = [];

    for (const [index, row] of rows.entries()) {
      const rowNumber = row.rowNumber ?? index + 1;
      const dto: CreateSpecimenDto = {
        collectionId: row.collectionId,
        accessionNumber: row.accessionNumber,
        specimenCategory: row.specimenCategory,
        scientificName: row.scientificName,
        commonName: row.commonName,
        gender: row.gender,
        classificationStatus: row.classificationStatus,
        remarks: row.remarks,
      };
      try {
        const specimen = await this.prisma.$transaction((transaction) =>
          this.specimens.createUncatalogedRecordFor(
            transaction,
            dto,
            actingCuratorAccountId,
            'IMPORT_SPECIMEN',
            { rowNumber, importBatchId },
          ),
        );
        results.push({ rowNumber, success: true, specimen });
      } catch (error) {
        if (
          error instanceof NotFoundException ||
          error instanceof BadRequestException
        ) {
          results.push({ rowNumber, success: false, errors: [error.message] });
        } else {
          this.logger.error(
            `Row ${rowNumber} of import batch ${importBatchId} failed unexpectedly.`,
            error instanceof Error ? error.stack : error,
          );
          results.push({
            rowNumber,
            success: false,
            errors: [
              'The specimen record could not be created. If this continues, contact an administrator.',
            ],
          });
        }
      }
    }

    return {
      importBatchId,
      results,
      createdCount: results.filter((result) => result.success).length,
      failedCount: results.filter((result) => !result.success).length,
    };
  }

  private parseCsv(
    file: Express.Multer.File | undefined,
  ): Record<string, string>[] {
    if (!file) {
      throw new BadRequestException('A CSV file is required.');
    }
    if (!file.originalname.toLowerCase().endsWith('.csv')) {
      throw new BadRequestException(
        'Only .csv files are supported for import.',
      );
    }

    try {
      return parse(file.buffer.toString('utf8'), {
        columns: true,
        bom: true,
        trim: true,
        skip_empty_lines: true,
      }) as Record<string, string>[];
    } catch (error) {
      throw new BadRequestException(
        `The uploaded file could not be parsed as CSV: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }

  private mapHeaders(headers: string[]): {
    headerMap: Map<keyof ImportSpecimenRowDto, string>;
    unmappedColumns: string[];
  } {
    const headerMap = new Map<keyof ImportSpecimenRowDto, string>();
    const unmappedColumns: string[] = [];

    for (const header of headers) {
      const canonical = CANONICAL_FIELDS[this.normalizeHeader(header)];
      if (canonical) {
        headerMap.set(canonical, header);
      } else {
        unmappedColumns.push(header);
      }
    }

    return { headerMap, unmappedColumns };
  }

  private normalizeHeader(header: string): string {
    return header
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, '');
  }

  private buildRowContext(
    record: Record<string, string>,
    rowNumber: number,
    headerMap: Map<keyof ImportSpecimenRowDto, string>,
  ): RowContext {
    const extract = (field: keyof ImportSpecimenRowDto): string | undefined => {
      const header = headerMap.get(field);
      if (!header) return undefined;
      const raw = record[header];
      if (raw === undefined) return undefined;
      const trimmed = raw.trim();
      return trimmed === '' ? undefined : trimmed;
    };

    const fields: RowFields = {
      collectionId: extract('collectionId'),
      accessionNumber: extract('accessionNumber'),
      specimenCategory: extract('specimenCategory'),
      scientificName: extract('scientificName'),
      commonName: extract('commonName'),
      gender: this.normalizeGender(extract('gender')),
      classificationStatus: extract('classificationStatus'),
      remarks: extract('remarks'),
    };

    return {
      rowNumber,
      fields,
      accessionKey: fields.accessionNumber?.toLowerCase(),
      scientificCommonKey:
        fields.scientificName && fields.commonName
          ? `${fields.scientificName.toLowerCase()}|${fields.commonName.toLowerCase()}`
          : undefined,
    };
  }

  private normalizeGender(raw: string | undefined): string | undefined {
    if (!raw) return undefined;
    return raw
      .trim()
      .toUpperCase()
      .replace(/[^A-Z]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  private async findExistingAccessionNumbers(
    contexts: RowContext[],
  ): Promise<Set<string>> {
    const values = [
      ...new Set(
        contexts
          .map((context) => context.fields.accessionNumber)
          .filter((value): value is string => !!value),
      ),
    ];
    if (values.length === 0) return new Set();

    const matches = await this.prisma.specimen.findMany({
      where: {
        status: { not: 'ARCHIVED' },
        OR: values.map((value) => ({
          accession_number: { equals: value, mode: 'insensitive' as const },
        })),
      },
      select: { accession_number: true },
    });

    return new Set(
      matches
        .map((match) => match.accession_number?.toLowerCase())
        .filter((value): value is string => !!value),
    );
  }

  private async findExistingScientificCommonPairs(
    contexts: RowContext[],
  ): Promise<Set<string>> {
    const pairs = [
      ...new Map(
        contexts
          .filter(
            (context) =>
              context.fields.scientificName && context.fields.commonName,
          )
          .map((context) => [
            context.scientificCommonKey,
            {
              scientificName: context.fields.scientificName!,
              commonName: context.fields.commonName!,
            },
          ]),
      ).values(),
    ];
    if (pairs.length === 0) return new Set();

    const matches = await this.prisma.specimen.findMany({
      where: {
        status: { not: 'ARCHIVED' },
        OR: pairs.map((pair) => ({
          AND: [
            {
              scientific_name: {
                equals: pair.scientificName,
                mode: 'insensitive' as const,
              },
            },
            {
              common_name: {
                equals: pair.commonName,
                mode: 'insensitive' as const,
              },
            },
          ],
        })),
      },
      select: { scientific_name: true, common_name: true },
    });

    return new Set(
      matches
        .filter((match) => match.scientific_name && match.common_name)
        .map(
          (match) =>
            `${match.scientific_name!.toLowerCase()}|${match.common_name!.toLowerCase()}`,
        ),
    );
  }

  private async findExistingCollectionIds(
    contexts: RowContext[],
  ): Promise<Set<string>> {
    const ids = [
      ...new Set(
        contexts
          .map((context) => context.fields.collectionId)
          .filter((value): value is string => !!value && isUUID(value)),
      ),
    ];
    if (ids.length === 0) return new Set();

    const matches = await this.prisma.collection.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    return new Set(matches.map((match) => match.id));
  }

  private buildInBatchGroups(contexts: RowContext[]): {
    accessionGroups: Map<string, number[]>;
    scientificCommonGroups: Map<string, number[]>;
  } {
    const accessionGroups = new Map<string, number[]>();
    const scientificCommonGroups = new Map<string, number[]>();

    for (const context of contexts) {
      if (context.accessionKey) {
        const rowNumbers = accessionGroups.get(context.accessionKey) ?? [];
        rowNumbers.push(context.rowNumber);
        accessionGroups.set(context.accessionKey, rowNumbers);
      }
      if (context.scientificCommonKey) {
        const rowNumbers =
          scientificCommonGroups.get(context.scientificCommonKey) ?? [];
        rowNumbers.push(context.rowNumber);
        scientificCommonGroups.set(context.scientificCommonKey, rowNumbers);
      }
    }

    return { accessionGroups, scientificCommonGroups };
  }

  private buildDuplicateWarnings(
    context: RowContext,
    existingAccessionNumbers: Set<string>,
    existingScientificCommonPairs: Set<string>,
    accessionGroups: Map<string, number[]>,
    scientificCommonGroups: Map<string, number[]>,
  ): string[] {
    const warnings: string[] = [];

    if (
      context.accessionKey &&
      existingAccessionNumbers.has(context.accessionKey)
    ) {
      warnings.push(
        'Matches the accession number of an existing specimen record.',
      );
    }
    if (context.accessionKey) {
      const others = (accessionGroups.get(context.accessionKey) ?? []).filter(
        (rowNumber) => rowNumber !== context.rowNumber,
      );
      if (others.length > 0) {
        warnings.push(
          `Matches the accession number used by row(s) ${others.join(', ')} in this file.`,
        );
      }
    }

    if (
      context.scientificCommonKey &&
      existingScientificCommonPairs.has(context.scientificCommonKey)
    ) {
      warnings.push(
        'Matches the scientific and common name of an existing specimen record; confirm this is not a duplicate before importing.',
      );
    }
    if (context.scientificCommonKey) {
      const others = (
        scientificCommonGroups.get(context.scientificCommonKey) ?? []
      ).filter((rowNumber) => rowNumber !== context.rowNumber);
      if (others.length > 0) {
        warnings.push(
          `Matches the scientific and common name used by row(s) ${others.join(', ')} in this file.`,
        );
      }
    }

    return warnings;
  }

  private flattenValidationErrors(errors: ValidationError[]): string[] {
    const messages: string[] = [];
    for (const error of errors) {
      if (error.constraints) {
        messages.push(...Object.values(error.constraints));
      }
      if (error.children?.length) {
        messages.push(...this.flattenValidationErrors(error.children));
      }
    }
    return messages;
  }
}
