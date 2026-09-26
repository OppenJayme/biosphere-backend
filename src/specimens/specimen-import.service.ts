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
import { Specimen } from './entities/specimen.entity';
import { SpecimensService } from './specimens.service';

export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;

/**
 * How long a preview stays committable. Kept short since the intended
 * workflow is preview -> review -> commit in one sitting; an expired
 * preview just means re-uploading the same file.
 */
export const PREVIEW_TTL_MS = 30 * 60 * 1000;

const SUPPORTED_COLUMNS =
  'collectionId, accessionNumber, specimenCategory, scientificName, commonName, gender, classificationStatus, remarks';

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

interface CachedPreviewRow {
  dto: CreateSpecimenDto;
  valid: boolean;
  committed?: Specimen;
  /**
   * Set synchronously (no `await` between reading and writing it) as soon
   * as a commit for this row starts, so a concurrent commit call for the
   * same previewId+row awaits this same promise instead of racing its own
   * create — otherwise two requests can both pass the `committed` check
   * before either write finishes and each create a specimen for the row.
   */
  inFlight?: Promise<Specimen>;
}

interface CachedPreview {
  createdBy: string;
  createdAt: number;
  rows: Map<number, CachedPreviewRow>;
}

@Injectable()
export class SpecimenImportService {
  private readonly logger = new Logger(SpecimenImportService.name);

  /**
   * Reviewed-preview cache keyed by previewId, scoped to the curator who
   * ran the preview. In-memory and per-process: it does not survive a
   * restart and would not be shared across multiple backend instances.
   * If BioSphere ever runs more than one instance, this needs to move to
   * a shared store (e.g. a table or Redis) instead. See
   * docs/SPECIMEN_IMPORT_GUIDE.md.
   */
  private readonly previewCache = new Map<string, CachedPreview>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly specimens: SpecimensService,
  ) {}

  async previewImport(
    file: Express.Multer.File | undefined,
    actingCuratorAccountId: string,
  ): Promise<SpecimenImportPreviewResult> {
    this.sweepExpiredPreviews();

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
    if (headerMap.size === 0) {
      throw new BadRequestException(
        `None of the uploaded file's columns match a supported field (${SUPPORTED_COLUMNS}). Check the column headers and try again.`,
      );
    }

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

        if (this.isBlankRow(context.fields)) {
          errors.push(
            `This row has no recognized values; check that its columns match a supported field (${SUPPORTED_COLUMNS}).`,
          );
        }

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
          dto: this.toCreateSpecimenDto(context.fields),
        };
      }),
    );

    const previewId = randomUUID();
    this.previewCache.set(previewId, {
      createdBy: actingCuratorAccountId,
      createdAt: Date.now(),
      rows: new Map(
        rows.map((row) => [row.rowNumber, { dto: row.dto, valid: row.valid }]),
      ),
    });

    return {
      previewId,
      expiresAt: new Date(Date.now() + PREVIEW_TTL_MS),
      rows: rows.map((row) => ({
        rowNumber: row.rowNumber,
        data: row.data,
        errors: row.errors,
        duplicateWarnings: row.duplicateWarnings,
        valid: row.valid,
      })),
      unmappedColumns,
      totalRows: rows.length,
      validRows: rows.filter((row) => row.valid).length,
      invalidRows: rows.filter((row) => !row.valid).length,
      rowsWithWarnings: rows.filter((row) => row.duplicateWarnings.length > 0)
        .length,
    };
  }

  async commitImport(
    previewId: string,
    rowNumbers: number[] | undefined,
    actingCuratorAccountId: string,
  ): Promise<SpecimenImportCommitResult> {
    this.sweepExpiredPreviews();

    const cached = this.previewCache.get(previewId);
    if (!cached || cached.createdBy !== actingCuratorAccountId) {
      throw new NotFoundException(
        'Import preview not found or expired. Re-run POST /specimens/import/preview before committing.',
      );
    }

    const targets = this.resolveCommitTargets(cached, rowNumbers);
    const importBatchId = randomUUID();
    const results: SpecimenImportCommitResult['results'] = [];

    for (const rowNumber of targets) {
      const cachedRow = cached.rows.get(rowNumber);
      if (!cachedRow) {
        results.push({
          rowNumber,
          success: false,
          errors: ['This row was not part of the reviewed preview.'],
        });
        continue;
      }
      if (cachedRow.committed) {
        // Already created by an earlier call for this same previewId
        // (e.g. the curator retried after a lost response) — report the
        // existing record instead of creating a second one.
        results.push({
          rowNumber,
          success: true,
          specimen: cachedRow.committed,
        });
        continue;
      }
      if (!cachedRow.valid) {
        results.push({
          rowNumber,
          success: false,
          errors: [
            'This row failed preview validation and cannot be committed.',
          ],
        });
        continue;
      }

      // Claim (or reuse) the in-flight promise synchronously: no `await`
      // occurs between the `committed`/`inFlight` reads above and this
      // assignment, so a concurrent call for the same row can only ever
      // see this promise already set and await it, never start a second
      // create for the same row.
      if (!cachedRow.inFlight) {
        cachedRow.inFlight = this.prisma
          .$transaction((transaction) =>
            this.specimens.createUncatalogedRecordFor(
              transaction,
              cachedRow.dto,
              actingCuratorAccountId,
              'IMPORT_SPECIMEN',
              { rowNumber, importBatchId, previewId },
            ),
          )
          .then((specimen) => {
            cachedRow.committed = specimen;
            return specimen;
          })
          .finally(() => {
            cachedRow.inFlight = undefined;
          });
      }

      try {
        const specimen = await cachedRow.inFlight;
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

  private resolveCommitTargets(
    cached: CachedPreview,
    rowNumbers: number[] | undefined,
  ): number[] {
    if (rowNumbers && rowNumbers.length > 0) {
      return [...new Set(rowNumbers)].sort((a, b) => a - b);
    }
    return [...cached.rows.entries()]
      .filter(([, row]) => row.valid)
      .map(([rowNumber]) => rowNumber)
      .sort((a, b) => a - b);
  }

  private sweepExpiredPreviews(now: number = Date.now()): void {
    for (const [id, cached] of this.previewCache) {
      if (now - cached.createdAt > PREVIEW_TTL_MS) {
        this.previewCache.delete(id);
      }
    }
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

  private isBlankRow(fields: RowFields): boolean {
    return Object.values(fields).every(
      (value) => value === undefined || value === '',
    );
  }

  private toCreateSpecimenDto(fields: RowFields): CreateSpecimenDto {
    return {
      collectionId: fields.collectionId,
      accessionNumber: fields.accessionNumber,
      specimenCategory: fields.specimenCategory,
      scientificName: fields.scientificName,
      commonName: fields.commonName,
      gender: fields.gender as CreateSpecimenDto['gender'],
      classificationStatus: fields.classificationStatus,
      remarks: fields.remarks,
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
