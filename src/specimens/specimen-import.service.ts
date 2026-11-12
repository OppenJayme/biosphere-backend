import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
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
import { parseXlsxImport, type XlsxImportSheets } from './xlsx-import';

export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;

/**
 * How long a preview stays committable. Kept short since the intended
 * workflow is preview -> review -> commit in one sitting; an expired
 * preview just means re-uploading the same file.
 */
export const PREVIEW_TTL_MS = 30 * 60 * 1000;

const SUPPORTED_COLUMNS =
  'Accession number, Category, Scientific name, Common name, Sex, Classification status, Remarks, Collection (name or ID), Kingdom, Phylum, Class, Order, Family, Genus, Species, Habitat, Ecological role, Conservation status, Collector, Donor, Collection date, Collection location, Preservation type, Preservation method, Storage unit, Condition, Quantity, Storage notes';

/**
 * A row only needs a name so the record can be identified (museum decision,
 * 2026-11-12). Every other missing or unusable value is left blank with a
 * warning, and the record is saved as Uncataloged for the curator to finish.
 */
const NAME_REQUIRED_ERROR =
  'Add a common name or a scientific name: a record needs at least one.';

/** Labels for warnings about values that will be left blank. */
const FIELD_LABELS: Record<string, string> = {
  collectionId: 'Collection',
  specimenCategory: 'Category',
  scientificName: 'Scientific name',
  commonName: 'Common name',
  gender: 'Sex',
  classificationStatus: 'Classification status',
  remarks: 'Remarks',
  kingdom: 'Kingdom',
  phylum: 'Phylum',
  class: 'Class',
  orderName: 'Order',
  family: 'Family',
  genus: 'Genus',
  species: 'Species',
  habitat: 'Habitat',
  ecologicalRole: 'Ecological role',
  conservationStatus: 'Conservation status',
  collector: 'Collector',
  donor: 'Donor',
  collectionDate: 'Collection date',
  collectionLocation: 'Collection location',
  preservationType: 'Preservation type',
  preservationMethod: 'Preservation method',
};

/** Lot columns of a backup workbook's "Lots" sheet, by normalized header. */
const LOT_SHEET_FIELDS = {
  specimenId: 'specimenid',
  accessionNumber: 'accessionnumber',
  storageUnitId: 'storageunitid',
  storagePath: 'storagepath',
  condition: 'condition',
  quantity: 'quantity',
  storageNotes: 'storagenotes',
  active: 'active',
} as const;

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
// stripped) header name so the template can use spaces, underscores, or
// mixed case (e.g. "Scientific Name", "scientific_name", "scientificName").
// The headers of a weekly backup workbook's Specimens sheet map here too, so
// a backup can be imported as it is.
const CANONICAL_FIELDS: Record<string, keyof RowFields> = {
  id: 'sourceId',
  collectionid: 'collectionId',
  collection: 'collectionName',
  collectionname: 'collectionName',
  accessionnumber: 'accessionNumber',
  category: 'specimenCategory',
  specimencategory: 'specimenCategory',
  scientificname: 'scientificName',
  commonname: 'commonName',
  gender: 'gender',
  sex: 'gender',
  archived: 'archived',
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
  /** A backup's record ID: links the row to its lots on the Lots sheet. */
  sourceId?: string;
  collectionId?: string;
  /** Collection by name, used when no existing collection ID is given. */
  collectionName?: string;
  /** Non-blank when the source file marks the record as archived. */
  archived?: string;
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
  lots: CreateSpecimenLotDto[];
}

/** One lot to create: from the row's own lot columns or the Lots sheet. */
interface LotSource {
  /** Where the lot came from, for warnings. */
  label: string;
  /** Storage references to try in order (unit ID, then label path). */
  storageUnits: string[];
  conditionClass?: string;
  quantity?: string;
  storageNotes?: string;
}

interface RowContext {
  rowNumber: number;
  fields: RowFields;
  /** Active lots for this row from a backup workbook's Lots sheet. */
  sheetLots: LotSource[];
}

interface InBatchMatch {
  rowNumber: number;
  evaluation: DuplicateEvaluation;
}

interface CachedPreviewRow {
  dto: CreateSpecimenDto;
  extras: RowExtras;
  valid: boolean;
  /** Archived in the source file: left out unless the curator picks it. */
  archivedInSource: boolean;
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

const GENERATED_ACCESSION_PLACEHOLDER = 'generated at import';

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

    const sheets = await this.parseFile(file);
    const rawRecords = sheets.specimens;
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
    const lotSheet = this.attachSheetLots(contexts, sheets.lots);

    const candidates = contexts.map((context) => context.fields);
    const [
      existingDuplicates,
      collections,
      accessionHolders,
      storageUnitResolver,
    ] = await Promise.all([
      this.duplicates.findForCandidates(candidates),
      this.loadCollections(contexts),
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
        // Values that will be saved; unusable optional values are removed.
        const fields: RowFields = { ...context.fields };
        const errors: string[] = [];
        const fieldWarnings: string[] = [];

        // A name in the collection ID column is looked up by name.
        if (fields.collectionId && !isUUID(fields.collectionId)) {
          fields.collectionName ??= fields.collectionId;
          fields.collectionId = undefined;
        }

        const core = plainToInstance(ImportSpecimenRowDto, {
          rowNumber: context.rowNumber,
          ...fields,
        });
        for (const error of await validate(core)) {
          const messages = this.flattenValidationErrors([error]);
          if (error.property === 'rowNumber') continue;
          // The accession number identifies the record, so it is never
          // silently replaced by a generated one.
          if (error.property === 'accessionNumber') {
            errors.push(...messages);
            continue;
          }
          const property = error.property as keyof RowFields;
          fieldWarnings.push(
            this.leftBlankWarning(property, fields[property], messages),
          );
          fields[property] = undefined;
        }

        if (this.isBlankRow(context.fields)) {
          errors.push(
            `This row has no recognized values; check that its columns match a supported field (${SUPPORTED_COLUMNS}).`,
          );
        } else if (!fields.commonName && !fields.scientificName) {
          errors.push(NAME_REQUIRED_ERROR);
        }

        const collectionWarning = this.resolveCollection(fields, collections);
        if (collectionWarning) fieldWarnings.push(collectionWarning);

        errors.push(
          ...this.buildAccessionErrors(
            context,
            accessionHolders,
            accessionRowsByKey,
          ),
        );

        const { extras, warnings } = await this.buildRowExtras(
          fields,
          context.sheetLots,
          storageUnitResolver,
        );
        fieldWarnings.push(...warnings);

        const possibleDuplicates = existingDuplicates[index];
        const duplicateWarnings = this.buildDuplicateWarnings(
          possibleDuplicates,
          inBatchDuplicates[index],
        );

        return {
          rowNumber: context.rowNumber,
          data: plain as unknown as ImportSpecimenRowDto,
          errors,
          fieldWarnings,
          duplicateWarnings,
          possibleDuplicates,
          valid: errors.length === 0,
          archivedInSource: context.fields.archived !== undefined,
          accessionNumberWillBeGenerated:
            accessionNumberKey(fields.accessionNumber) === undefined,
          catalogReadiness: this.buildCatalogReadiness(fields, extras),
          dto: this.toCreateSpecimenDto(fields),
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
          {
            dto: row.dto,
            extras: row.extras,
            valid: row.valid,
            archivedInSource: row.archivedInSource,
          },
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
        fieldWarnings: row.fieldWarnings,
        duplicateWarnings: row.duplicateWarnings,
        possibleDuplicates: row.possibleDuplicates,
        valid: row.valid,
        archivedInSource: row.archivedInSource,
        accessionNumberWillBeGenerated: row.accessionNumberWillBeGenerated,
        catalogReadiness: row.catalogReadiness,
      })),
      unmappedColumns,
      lotSheet,
      totalRows: rows.length,
      validRows: rows.filter((row) => row.valid).length,
      invalidRows: rows.filter((row) => !row.valid).length,
      catalogReadyRows: rows.filter(
        (row) => row.valid && row.catalogReadiness.requirementsMet,
      ).length,
      rowsWithWarnings: rows.filter((row) => row.duplicateWarnings.length > 0)
        .length,
      rowsWithFieldWarnings: rows.filter(
        (row) => row.valid && row.fieldWarnings.length > 0,
      ).length,
      archivedRows: rows.filter((row) => row.archivedInSource).length,
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
      .filter(([, row]) => row.valid && !row.archivedInSource)
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

  private async parseFile(
    file: Express.Multer.File | undefined,
  ): Promise<XlsxImportSheets> {
    if (!file) {
      throw new BadRequestException('An Excel (.xlsx) file is required.');
    }
    if (!file.buffer.length || file.buffer.length > MAX_IMPORT_FILE_BYTES) {
      throw new BadRequestException(
        'Import files must be non-empty and no larger than 5 MB.',
      );
    }
    if (!file.originalname.toLowerCase().endsWith('.xlsx')) {
      throw new BadRequestException(
        'Only Excel (.xlsx) files can be imported. In Excel, use File > Save As and choose Excel Workbook (.xlsx).',
      );
    }
    return parseXlsxImport(
      file.buffer,
      MAX_IMPORT_ROWS,
      (header) =>
        CANONICAL_FIELDS[this.normalizeHeader(header)] === 'accessionNumber',
    );
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
      sourceId: extract('sourceId'),
      collectionId: extract('collectionId'),
      collectionName: extract('collectionName'),
      archived: extract('archived'),
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

    return { rowNumber, fields, sheetLots: [] };
  }

  /**
   * Gives each row its active lots from a backup workbook's Lots sheet,
   * matched by the backup's specimen ID, then by accession number.
   */
  private attachSheetLots(
    contexts: RowContext[],
    records: Record<string, string>[] | null,
  ): SpecimenImportPreviewResult['lotSheet'] {
    if (!records) return null;
    const summary = { matched: 0, inactive: 0, unmatched: 0 };
    if (records.length === 0) return summary;

    const headers = Object.keys(records[0]);
    const column = (name: string) =>
      headers.find((header) => this.normalizeHeader(header) === name);
    const columns = {
      specimenId: column(LOT_SHEET_FIELDS.specimenId),
      accessionNumber: column(LOT_SHEET_FIELDS.accessionNumber),
      storageUnitId: column(LOT_SHEET_FIELDS.storageUnitId),
      storagePath: column(LOT_SHEET_FIELDS.storagePath),
      condition: column(LOT_SHEET_FIELDS.condition),
      quantity: column(LOT_SHEET_FIELDS.quantity),
      storageNotes: column(LOT_SHEET_FIELDS.storageNotes),
      active: column(LOT_SHEET_FIELDS.active),
    };

    const bySourceId = new Map<string, RowContext>();
    const byAccession = new Map<string, RowContext>();
    for (const context of contexts) {
      if (context.fields.sourceId) {
        bySourceId.set(context.fields.sourceId, context);
      }
      const key = accessionNumberKey(context.fields.accessionNumber);
      if (key !== undefined) byAccession.set(key, context);
    }

    records.forEach((record, index) => {
      const value = (header: string | undefined) =>
        header ? record[header]?.trim() || undefined : undefined;
      const active = value(columns.active);
      if (active !== undefined && !/^(yes|true|1)$/i.test(active)) {
        summary.inactive += 1;
        return;
      }
      const specimenId = value(columns.specimenId);
      const accessionKey = accessionNumberKey(value(columns.accessionNumber));
      const context =
        (specimenId ? bySourceId.get(specimenId) : undefined) ??
        (accessionKey !== undefined
          ? byAccession.get(accessionKey)
          : undefined);
      if (!context) {
        summary.unmatched += 1;
        return;
      }
      summary.matched += 1;
      context.sheetLots.push({
        // Excel row number: the header is row 1.
        label: `The lot on row ${index + 2} of the Lots sheet`,
        storageUnits: [
          value(columns.storageUnitId),
          value(columns.storagePath),
        ].filter((reference): reference is string => !!reference),
        conditionClass: value(columns.condition),
        quantity: value(columns.quantity),
        storageNotes: value(columns.storageNotes),
      });
    });
    return summary;
  }

  private isBlankRow(fields: RowFields): boolean {
    return Object.entries(fields).every(
      ([field, value]) =>
        field === 'sourceId' || value === undefined || value === '',
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

  private leftBlankWarning(
    field: string,
    value: unknown,
    messages: string[],
  ): string {
    const label = FIELD_LABELS[field] ?? field;
    const shown =
      typeof value === 'string' && value.length > 60
        ? `${value.slice(0, 57)}...`
        : value;
    const detail = messages.length ? ` (${messages.join('; ')})` : '';
    return `${label} "${String(shown)}" can't be used${detail}; it will be left blank.`;
  }

  /** Existing collections by ID, and by unique case-insensitive name. */
  private async loadCollections(contexts: RowContext[]): Promise<{
    ids: Set<string>;
    byName: Map<string, string | null>;
  }> {
    const wanted = contexts.some(
      (context) => context.fields.collectionId || context.fields.collectionName,
    );
    if (!wanted) return { ids: new Set(), byName: new Map() };

    const collections = await this.prisma.collection.findMany({
      select: { id: true, collection_name: true },
    });
    const byName = new Map<string, string | null>();
    for (const collection of collections) {
      const key = collection.collection_name.trim().toLowerCase();
      // Two collections with the same name: ambiguous, so never matched.
      byName.set(key, byName.has(key) ? null : collection.id);
    }
    return {
      ids: new Set(collections.map((collection) => collection.id)),
      byName,
    };
  }

  /**
   * Keeps an existing collection ID, otherwise matches the collection by
   * name. An unknown collection is left blank for the curator to choose.
   */
  private resolveCollection(
    fields: RowFields,
    collections: { ids: Set<string>; byName: Map<string, string | null> },
  ): string | undefined {
    if (fields.collectionId && collections.ids.has(fields.collectionId)) {
      return undefined;
    }
    const byName = fields.collectionName
      ? collections.byName.get(fields.collectionName.trim().toLowerCase())
      : undefined;
    const given = fields.collectionName ?? fields.collectionId;
    fields.collectionId = byName ?? undefined;
    if (byName || !given) return undefined;
    return `Collection "${given}" was not found; it will be left blank. Choose the collection after importing.`;
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
    const { taxonomy, provenance, lots } = row.extras;
    if (!taxonomy && !provenance && lots.length === 0) {
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
    for (const lot of lots) {
      await this.lots.createInTransaction(
        transaction,
        specimen.id,
        {
          ...lot,
          reason: `Imported from row ${importDetails.rowNumber} (batch ${importDetails.importBatchId})`,
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
      // A blank number is generated at commit, so it never blocks readiness.
      accessionNumber:
        fields.accessionNumber ?? GENERATED_ACCESSION_PLACEHOLDER,
      commonName: fields.commonName ?? null,
      kingdom: fields.kingdom ?? null,
      collectionDate:
        collectionDate && !Number.isNaN(collectionDate.getTime())
          ? collectionDate
          : null,
      preservationType: fields.preservationType ?? null,
      preservationMethod: fields.preservationMethod ?? null,
      // Set only when a lot validated and its unit can hold specimens,
      // which is what the manual rule checks.
      hasActiveLot: extras.lots.length > 0,
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
    if (
      !contexts.some(
        (context) => context.fields.storageUnit || context.sheetLots.length > 0,
      )
    ) {
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

  /**
   * Taxonomy, provenance and lots for a row. Nothing here blocks the row:
   * an unusable value is left blank and an incomplete lot is left out, each
   * with a warning, so the specimen can still be imported (2026-11-12).
   * Values removed here are removed from `fields` too, so catalog readiness
   * reflects what will actually be saved.
   */
  private async buildRowExtras(
    fields: RowFields,
    sheetLots: LotSource[],
    storageUnitResolver: ImportStorageUnitResolver | null,
  ): Promise<{ extras: RowExtras; warnings: string[] }> {
    const extras: RowExtras = { lots: [] };
    const warnings: string[] = [];

    if (TAXONOMY_ROW_FIELDS.some((field) => fields[field] !== undefined)) {
      extras.taxonomy = await this.usablePart(
        CreateSpecimenTaxonomyDto,
        {
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
        },
        { class: 'taxonClass', orderName: 'taxonOrder' },
        fields,
        warnings,
      );
    }

    if (PROVENANCE_ROW_FIELDS.some((field) => fields[field] !== undefined)) {
      extras.provenance = await this.usablePart(
        CreateSpecimenProvenanceDto,
        {
          collector: fields.collector,
          donor: fields.donor,
          collectionDate: fields.collectionDate,
          collectionLocation: fields.collectionLocation,
          preservationType: fields.preservationType,
          preservationMethod: fields.preservationMethod,
        },
        {},
        fields,
        warnings,
      );
    }

    const sources: LotSource[] = [];
    if (LOT_ROW_FIELDS.some((field) => fields[field] !== undefined)) {
      sources.push({
        label: 'The lot in this row',
        storageUnits: fields.storageUnit ? [fields.storageUnit] : [],
        conditionClass: fields.conditionClass,
        quantity: fields.quantity,
        storageNotes: fields.storageNotes,
      });
    }
    sources.push(...sheetLots);
    for (const source of sources) {
      const result = await this.buildLot(source, storageUnitResolver);
      if (result.lot) {
        extras.lots.push(result.lot);
      } else {
        warnings.push(
          `${source.label} will not be imported: ${result.problems.join(' ')} Add it from the specimen's inventory after importing.`,
        );
      }
    }

    return { extras, warnings };
  }

  /**
   * Validates one related part and keeps only its usable values. Returns
   * undefined when nothing usable is left.
   */
  private async usablePart<T extends object>(
    type: new () => T,
    values: Record<string, string | undefined>,
    rowFieldOf: Record<string, keyof RowFields>,
    fields: RowFields,
    warnings: string[],
  ): Promise<T | undefined> {
    const kept = { ...values };
    for (const error of await validate(plainToInstance(type, values))) {
      warnings.push(
        this.leftBlankWarning(
          error.property,
          values[error.property],
          this.flattenValidationErrors([error]),
        ),
      );
      kept[error.property] = undefined;
      fields[
        rowFieldOf[error.property] ?? (error.property as keyof RowFields)
      ] = undefined;
    }
    if (Object.values(kept).every((value) => value === undefined)) {
      return undefined;
    }
    return plainToInstance(type, kept);
  }

  private async buildLot(
    source: LotSource,
    storageUnitResolver: ImportStorageUnitResolver | null,
  ): Promise<
    | { lot: CreateSpecimenLotDto; problems?: undefined }
    | { lot?: undefined; problems: string[] }
  > {
    const problems: string[] = [];
    const missing = [
      source.storageUnits.length === 0 ? 'storage unit' : null,
      source.conditionClass ? null : 'condition',
      source.quantity ? null : 'quantity',
    ].filter((part): part is string => part !== null);
    if (missing.length > 0) {
      problems.push(`it has no ${missing.join(', ')}.`);
    }

    const quantity = source.quantity?.replace(/,/g, '');
    if (
      quantity !== undefined &&
      (!/^\d+$/.test(quantity) ||
        Number(quantity) < 1 ||
        Number(quantity) > MAX_LOT_QUANTITY)
    ) {
      problems.push(
        `its quantity "${source.quantity}" is not a whole number of at least 1.`,
      );
    }

    let storageUnitId: string | undefined;
    if (source.storageUnits.length > 0 && storageUnitResolver) {
      let lastError = '';
      for (const reference of source.storageUnits) {
        const resolution = storageUnitResolver.resolve(reference);
        if ('error' in resolution) {
          lastError = resolution.error;
        } else {
          storageUnitId = resolution.storageUnitId;
          break;
        }
      }
      if (!storageUnitId) problems.push(lastError);
    }
    if (problems.length > 0) {
      return { problems };
    }

    const lot = plainToInstance(CreateSpecimenLotDto, {
      storageUnitId,
      conditionClass: source.conditionClass?.replace(/\s+/g, ' '),
      quantity: Number(quantity),
      storageNotes: source.storageNotes,
    });
    const lotErrors = this.flattenValidationErrors(await validate(lot));
    return lotErrors.length === 0 ? { lot } : { problems: lotErrors };
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
