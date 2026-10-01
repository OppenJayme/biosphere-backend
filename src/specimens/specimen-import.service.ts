import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import { isUUID, validate } from 'class-validator';
import type { ValidationError } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { runSerializableTransaction } from '../prisma/serializable-transaction';
import { CreateSpecimenLotDto } from '../specimen-lots/dto/create-specimen-lot.dto';
import { SpecimenLotsService } from '../specimen-lots/specimen-lots.service';
import { MAX_IMPORT_ROWS } from './dto/commit-specimen-import.dto';
import { CreateSpecimenProvenanceDto } from './dto/create-specimen-provenance.dto';
import { CreateSpecimenTaxonomyDto } from './dto/create-specimen-taxonomy.dto';
import { CreateSpecimenDto } from './dto/create-specimen.dto';
import { ImportSpecimenRowDto } from './dto/import-specimen-row.dto';
import {
  DuplicateMatchField,
  PossibleDuplicate,
} from './entities/specimen-duplicate.entity';
import {
  ImportCatalogReadiness,
  SpecimenImportCommitResult,
  SpecimenImportPreviewResult,
} from './entities/specimen-import.entity';
import {
  CATALOG_REQUIREMENTS,
  evaluateCatalogRequirements,
} from './catalog-completion.policy';
import { AccessionNumberHolder } from './entities/accession-number.entity';
import { Specimen, SpecimenStatus } from './entities/specimen.entity';
import {
  SpecimenAccessionService,
  accessionNumberKey,
} from './specimen-accession.service';
import {
  DuplicateEvaluation,
  SpecimenDuplicatesService,
} from './specimen-duplicates.service';
import { SpecimensService } from './specimens.service';
import { ImportStorageUnitResolver } from './import-storage-unit.resolver';
import { SpecimenProvenanceService } from './specimen-provenance.service';
import { SpecimenTaxonomyService } from './specimen-taxonomy.service';

export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;

/**
 * How long a preview stays committable. Kept short since the intended
 * workflow is preview -> review -> commit in one sitting; an expired
 * preview just means re-uploading the same file.
 */
export const PREVIEW_TTL_MS = 30 * 60 * 1000;

const SUPPORTED_COLUMNS =
  'collectionId, accessionNumber, specimenCategory, scientificName, commonName, gender, classificationStatus, remarks, kingdom, phylum, class, order, family, genus, species, habitat, ecologicalRole, conservationStatus, collector, donor, collectionDate, collectionLocation, preservationType, preservationMethod, storageUnit, conditionClass, quantity, storageNotes';

const TAXONOMY_ROW_FIELDS = [
  'kingdom',
  'phylum',
  'taxonClass',
  'taxonOrder',
  'family',
  'genus',
  'species',
  'habitat',
  'ecologicalRole',
  'conservationStatus',
] as const;

const PROVENANCE_ROW_FIELDS = [
  'collector',
  'donor',
  'collectionDate',
  'collectionLocation',
  'preservationType',
  'preservationMethod',
] as const;

const LOT_ROW_FIELDS = [
  'storageUnit',
  'conditionClass',
  'quantity',
  'storageNotes',
] as const;

const MAX_LOT_QUANTITY = 2_147_483_647;

// Canonical import fields, keyed by a normalized (lowercased, separators
// stripped) header name so the CSV template can use spaces, underscores, or
// mixed case (e.g. "Scientific Name", "scientific_name", "scientificName").
const CANONICAL_FIELDS: Record<string, keyof RowFields> = {
  collectionid: 'collectionId',
  accessionnumber: 'accessionNumber',
  specimencategory: 'specimenCategory',
  scientificname: 'scientificName',
  commonname: 'commonName',
  gender: 'gender',
  classificationstatus: 'classificationStatus',
  remarks: 'remarks',
  kingdom: 'kingdom',
  phylum: 'phylum',
  class: 'taxonClass',
  taxonclass: 'taxonClass',
  order: 'taxonOrder',
  ordername: 'taxonOrder',
  taxonorder: 'taxonOrder',
  family: 'family',
  genus: 'genus',
  species: 'species',
  habitat: 'habitat',
  ecologicalrole: 'ecologicalRole',
  conservationstatus: 'conservationStatus',
  collector: 'collector',
  donor: 'donor',
  collectiondate: 'collectionDate',
  collectionlocation: 'collectionLocation',
  preservationtype: 'preservationType',
  preservationmethod: 'preservationMethod',
  storageunit: 'storageUnit',
  storageunitid: 'storageUnit',
  storagelocation: 'storageUnit',
  condition: 'conditionClass',
  conditionclass: 'conditionClass',
  quantity: 'quantity',
  qty: 'quantity',
  storagenotes: 'storageNotes',
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
  kingdom?: string;
  phylum?: string;
  taxonClass?: string;
  taxonOrder?: string;
  family?: string;
  genus?: string;
  species?: string;
  habitat?: string;
  ecologicalRole?: string;
  conservationStatus?: string;
  collector?: string;
  donor?: string;
  collectionDate?: string;
  collectionLocation?: string;
  preservationType?: string;
  preservationMethod?: string;
  /** Storage unit UUID or its label path, e.g. "Room > Cabinet > Drawer". */
  storageUnit?: string;
  conditionClass?: string;
  quantity?: string;
  storageNotes?: string;
}

/** Related records created with the specimen when the row supplies them. */
interface RowExtras {
  taxonomy?: CreateSpecimenTaxonomyDto;
  provenance?: CreateSpecimenProvenanceDto;
  lot?: CreateSpecimenLotDto;
}

interface RowContext {
  rowNumber: number;
  fields: RowFields;
}

interface InBatchMatch {
  rowNumber: number;
  evaluation: DuplicateEvaluation;
}

interface CachedPreviewRow {
  dto: CreateSpecimenDto;
  extras: RowExtras;
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
    private readonly duplicates: SpecimenDuplicatesService,
    private readonly accession: SpecimenAccessionService,
    private readonly taxonomy: SpecimenTaxonomyService,
    private readonly provenance: SpecimenProvenanceService,
    private readonly lots: SpecimenLotsService,
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

    const candidates = contexts.map((context) => context.fields);
    const [
      existingDuplicates,
      existingCollectionIds,
      accessionHolders,
      storageUnitResolver,
    ] = await Promise.all([
      this.duplicates.findForCandidates(candidates),
      this.findExistingCollectionIds(contexts),
      this.accession.findHolders(
        candidates.map((candidate) => candidate.accessionNumber),
      ),
      this.loadStorageUnitResolver(contexts),
    ]);
    const accessionRowsByKey = this.groupRowsByAccessionKey(contexts);
    const inBatchDuplicates = this.duplicates
      .compareWithinBatch(candidates)
      .map((matches) =>
        matches.map(({ index, evaluation }) => ({
          rowNumber: contexts[index].rowNumber,
          evaluation,
        })),
      );

    const rows = await Promise.all(
      contexts.map(async (context, index) => {
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

        errors.push(
          ...this.buildAccessionErrors(
            context,
            accessionHolders,
            accessionRowsByKey,
          ),
        );

        const { extras, errors: extraErrors } = await this.buildRowExtras(
          context.fields,
          storageUnitResolver,
        );
        errors.push(...extraErrors);

        const possibleDuplicates = existingDuplicates[index];
        const duplicateWarnings = this.buildDuplicateWarnings(
          possibleDuplicates,
          inBatchDuplicates[index],
        );

        return {
          rowNumber: context.rowNumber,
          data: plain as unknown as ImportSpecimenRowDto,
          errors,
          duplicateWarnings,
          possibleDuplicates,
          valid: errors.length === 0,
          catalogReadiness: this.buildCatalogReadiness(context.fields, extras),
          dto: this.toCreateSpecimenDto(context.fields),
          extras,
        };
      }),
    );

    const previewId = randomUUID();
    this.previewCache.set(previewId, {
      createdBy: actingCuratorAccountId,
      createdAt: Date.now(),
      rows: new Map(
        rows.map((row) => [
          row.rowNumber,
          { dto: row.dto, extras: row.extras, valid: row.valid },
        ]),
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
        possibleDuplicates: row.possibleDuplicates,
        valid: row.valid,
        catalogReadiness: row.catalogReadiness,
      })),
      unmappedColumns,
      totalRows: rows.length,
      validRows: rows.filter((row) => row.valid).length,
      invalidRows: rows.filter((row) => !row.valid).length,
      catalogReadyRows: rows.filter(
        (row) => row.valid && row.catalogReadiness.requirementsMet,
      ).length,
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
        // SERIALIZABLE so a row's lot cannot race another lot create that
        // differs only by condition case (see SpecimenLotsService.create).
        cachedRow.inFlight = runSerializableTransaction(
          this.prisma,
          (transaction) =>
            this.createRow(transaction, cachedRow, actingCuratorAccountId, {
              rowNumber,
              importBatchId,
              previewId,
            }),
          'This row conflicted with another change to the same records. Commit it again.',
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
          error instanceof BadRequestException ||
          error instanceof ConflictException
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
    headerMap: Map<keyof RowFields, string>;
    unmappedColumns: string[];
  } {
    const headerMap = new Map<keyof RowFields, string>();
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
    headerMap: Map<keyof RowFields, string>,
  ): RowContext {
    const extract = (field: keyof RowFields): string | undefined => {
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
    for (const field of [
      ...TAXONOMY_ROW_FIELDS,
      ...PROVENANCE_ROW_FIELDS,
      ...LOT_ROW_FIELDS,
    ]) {
      fields[field] = extract(field);
    }

    return { rowNumber, fields };
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

  private groupRowsByAccessionKey(
    contexts: RowContext[],
  ): Map<string, number[]> {
    const rowsByKey = new Map<string, number[]>();
    for (const context of contexts) {
      const key = accessionNumberKey(context.fields.accessionNumber);
      if (key === undefined) continue;
      rowsByKey.set(key, [...(rowsByKey.get(key) ?? []), context.rowNumber]);
    }
    return rowsByKey;
  }

  /**
   * Accession numbers must be unique across all records, Archived included
   * (REQ-4.4-04, BR-01), so a clash blocks the row rather than warning. Every
   * row sharing a number within the file is blocked, since the importer
   * cannot tell which one the curator meant to keep.
   */
  private buildAccessionErrors(
    context: RowContext,
    holders: Map<string, AccessionNumberHolder>,
    rowsByKey: Map<string, number[]>,
  ): string[] {
    const key = accessionNumberKey(context.fields.accessionNumber);
    if (key === undefined) return [];
    const value = context.fields.accessionNumber as string;
    const errors: string[] = [];

    const holder = holders.get(value);
    if (holder) {
      const archivedNote =
        holder.status === SpecimenStatus.ARCHIVED ? ' Archived' : '';
      errors.push(
        `Accession number "${value}" is already assigned to an existing${archivedNote} specimen record.`,
      );
    }
    const otherRows = (rowsByKey.get(key) ?? []).filter(
      (rowNumber) => rowNumber !== context.rowNumber,
    );
    if (otherRows.length > 0) {
      errors.push(
        `Accession number "${value}" is also used by row(s) ${otherRows.join(', ')} in this file.`,
      );
    }
    return errors;
  }

  /**
   * Keeps the preview's established warning wording; the structured
   * `possibleDuplicates` list carries the per-record detail. Accession
   * clashes are errors, not warnings; see {@link buildAccessionErrors}.
   */
  private buildDuplicateWarnings(
    existing: PossibleDuplicate[],
    inBatch: InBatchMatch[],
  ): string[] {
    const warnings: string[] = [];
    // The matcher has already dropped records a differing collector or
    // donor sets apart (BR-09), so both names matching is enough here.
    const isNameMatch = (matchedFields: DuplicateMatchField[]) =>
      matchedFields.includes(DuplicateMatchField.SCIENTIFIC_NAME) &&
      matchedFields.includes(DuplicateMatchField.COMMON_NAME);

    if (existing.some((match) => isNameMatch(match.matchedFields))) {
      warnings.push(
        'Matches the scientific and common name of an existing specimen record; confirm this is not a duplicate before importing.',
      );
    }
    const nameRows = inBatch
      .filter((match) => isNameMatch(match.evaluation.matchedFields))
      .map((match) => match.rowNumber);
    if (nameRows.length > 0) {
      warnings.push(
        `Matches the scientific and common name used by row(s) ${nameRows.join(', ')} in this file.`,
      );
    }

    return warnings;
  }

  private async createRow(
    transaction: Prisma.TransactionClient,
    row: CachedPreviewRow,
    actingCuratorAccountId: string,
    importDetails: {
      rowNumber: number;
      importBatchId: string;
      previewId: string;
    },
  ): Promise<Specimen> {
    const specimen = await this.specimens.createUncatalogedRecordFor(
      transaction,
      row.dto,
      actingCuratorAccountId,
      'IMPORT_SPECIMEN',
      importDetails,
    );
    const { taxonomy, provenance, lot } = row.extras;
    if (!taxonomy && !provenance && !lot) {
      return specimen;
    }

    // Created through the same services as manual entry, so each part gets
    // its usual revision history and audit event, all in this one row's
    // transaction.
    if (taxonomy) {
      await this.taxonomy.createInTransaction(
        transaction,
        specimen.id,
        taxonomy,
        actingCuratorAccountId,
      );
    }
    if (provenance) {
      await this.provenance.createInTransaction(
        transaction,
        specimen.id,
        provenance,
        actingCuratorAccountId,
      );
    }
    if (lot) {
      await this.lots.createInTransaction(
        transaction,
        specimen.id,
        {
          ...lot,
          reason: `Imported from CSV row ${importDetails.rowNumber} (batch ${importDetails.importBatchId})`,
        },
        actingCuratorAccountId,
      );
    }

    return this.specimens.findOneInTransaction(transaction, specimen.id);
  }

  /**
   * Applies the manual-cataloging completion rules to the values a row
   * supplies, so the curator sees what is still missing before saving.
   * Missing requirements do not invalidate the row: BioSphere saves
   * incomplete records as Uncataloged (REQ-4.4-06).
   */
  private buildCatalogReadiness(
    fields: RowFields,
    extras: RowExtras,
  ): ImportCatalogReadiness {
    const collectionDate = fields.collectionDate
      ? new Date(fields.collectionDate)
      : null;
    const results = evaluateCatalogRequirements({
      collectionId: fields.collectionId ?? null,
      accessionNumber: fields.accessionNumber ?? null,
      commonName: fields.commonName ?? null,
      kingdom: fields.kingdom ?? null,
      collectionDate:
        collectionDate && !Number.isNaN(collectionDate.getTime())
          ? collectionDate
          : null,
      preservationType: fields.preservationType ?? null,
      preservationMethod: fields.preservationMethod ?? null,
      // Set only when the lot columns validated and the unit can hold
      // specimens, which is what the manual rule checks.
      hasActiveLot: extras.lot !== undefined,
    });
    const checks = CATALOG_REQUIREMENTS.map((requirement) => ({
      ...requirement,
      passed: results[requirement.key],
    }));
    const missingRequirements = checks
      .filter((check) => !check.passed)
      .map((check) => check.label);

    return {
      requirementsMet: missingRequirements.length === 0,
      resultingStatus: SpecimenStatus.UNCATALOGED,
      checks,
      missingRequirements,
    };
  }

  private async loadStorageUnitResolver(
    contexts: RowContext[],
  ): Promise<ImportStorageUnitResolver | null> {
    if (!contexts.some((context) => context.fields.storageUnit)) {
      return null;
    }

    const units = await this.prisma.storage_unit.findMany({
      select: {
        id: true,
        parent_id: true,
        label: true,
        holds_specimens: true,
        archived_at: true,
      },
    });
    return new ImportStorageUnitResolver(units);
  }

  private async buildRowExtras(
    fields: RowFields,
    storageUnitResolver: ImportStorageUnitResolver | null,
  ): Promise<{ extras: RowExtras; errors: string[] }> {
    const extras: RowExtras = {};
    const errors: string[] = [];

    if (TAXONOMY_ROW_FIELDS.some((field) => fields[field] !== undefined)) {
      const taxonomy = plainToInstance(CreateSpecimenTaxonomyDto, {
        kingdom: fields.kingdom,
        phylum: fields.phylum,
        class: fields.taxonClass,
        orderName: fields.taxonOrder,
        family: fields.family,
        genus: fields.genus,
        species: fields.species,
        habitat: fields.habitat,
        ecologicalRole: fields.ecologicalRole,
        conservationStatus: fields.conservationStatus,
      });
      const taxonomyErrors = this.flattenValidationErrors(
        await validate(taxonomy),
      );
      errors.push(...taxonomyErrors.map((message) => `Taxonomy: ${message}`));
      extras.taxonomy = taxonomy;
    }

    if (PROVENANCE_ROW_FIELDS.some((field) => fields[field] !== undefined)) {
      const provenance = plainToInstance(CreateSpecimenProvenanceDto, {
        collector: fields.collector,
        donor: fields.donor,
        collectionDate: fields.collectionDate,
        collectionLocation: fields.collectionLocation,
        preservationType: fields.preservationType,
        preservationMethod: fields.preservationMethod,
      });
      const provenanceErrors = this.flattenValidationErrors(
        await validate(provenance),
      );
      errors.push(
        ...provenanceErrors.map((message) => `Provenance: ${message}`),
      );
      extras.provenance = provenance;
    }

    if (LOT_ROW_FIELDS.some((field) => fields[field] !== undefined)) {
      const lotErrors = await this.buildLot(
        fields,
        storageUnitResolver,
        extras,
      );
      errors.push(...lotErrors.map((message) => `Lot: ${message}`));
    }

    return { extras, errors };
  }

  private async buildLot(
    fields: RowFields,
    storageUnitResolver: ImportStorageUnitResolver | null,
    extras: RowExtras,
  ): Promise<string[]> {
    const errors: string[] = [];
    if (!fields.storageUnit) {
      errors.push('storageUnit is required when a lot is given.');
    }
    if (!fields.conditionClass) {
      errors.push('conditionClass is required when a lot is given.');
    }
    if (!fields.quantity) {
      errors.push('quantity is required when a lot is given.');
    }

    const quantity = fields.quantity?.replace(/,/g, '');
    if (
      quantity !== undefined &&
      (!/^\d+$/.test(quantity) ||
        Number(quantity) < 1 ||
        Number(quantity) > MAX_LOT_QUANTITY)
    ) {
      errors.push('quantity must be a whole number of at least 1.');
    }

    let storageUnitId: string | undefined;
    if (fields.storageUnit && storageUnitResolver) {
      const resolution = storageUnitResolver.resolve(fields.storageUnit);
      if ('error' in resolution) {
        errors.push(resolution.error);
      } else {
        storageUnitId = resolution.storageUnitId;
      }
    }
    if (errors.length > 0) {
      return errors;
    }

    const lot = plainToInstance(CreateSpecimenLotDto, {
      storageUnitId,
      conditionClass: fields.conditionClass?.replace(/\s+/g, ' '),
      quantity: Number(quantity),
      storageNotes: fields.storageNotes,
    });
    const lotErrors = this.flattenValidationErrors(await validate(lot));
    if (lotErrors.length === 0) {
      extras.lot = lot;
    }
    return lotErrors;
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
