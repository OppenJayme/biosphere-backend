import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ImportSpecimenRowDto } from '../dto/import-specimen-row.dto';
import { CatalogRequirementCheck } from './catalog-readiness.entity';
import { PossibleDuplicate } from './specimen-duplicate.entity';
import { Specimen, SpecimenStatus } from './specimen.entity';

/**
 * Catalog-completion result for an import row, evaluated with the same
 * rules as GET /specimens/:id/catalog-readiness (REQ-4.4-08, REQ-4.4-20).
 */
export class ImportCatalogReadiness {
  @ApiProperty({
    description:
      'True when the row supplies every catalog requirement, so the record could be marked Cataloged right after import',
  })
  requirementsMet!: boolean;

  @ApiProperty({
    enum: SpecimenStatus,
    description:
      'Status the record will have after commit. Imports are always created Uncataloged; a curator completes cataloging separately.',
  })
  resultingStatus!: SpecimenStatus;

  @ApiProperty({ type: [CatalogRequirementCheck] })
  checks!: CatalogRequirementCheck[];

  @ApiProperty({
    type: [String],
    description: 'Labels of the catalog requirements the row does not meet',
  })
  missingRequirements!: string[];
}

export class ImportLotSheetSummary {
  @ApiProperty({ description: 'Active lots matched to a row' })
  matched!: number;

  @ApiProperty({ description: 'Inactive lots, which are not imported' })
  inactive!: number;

  @ApiProperty({
    description: 'Lots whose specimen is not in the Specimens sheet',
  })
  unmatched!: number;
}

export class SpecimenImportPreviewRow {
  @ApiProperty()
  rowNumber!: number;

  @ApiProperty({ type: ImportSpecimenRowDto })
  data!: ImportSpecimenRowDto;

  @ApiProperty({
    type: [String],
    description:
      'Blocking problems only: a missing name, an accession number that is taken or repeated, or a blank row',
  })
  errors!: string[];

  @ApiProperty({
    type: [String],
    description:
      'Values or lots that will be left out so the row can still be imported (unusable optional values, unknown collections, incomplete lots)',
  })
  fieldWarnings!: string[];

  @ApiProperty({ type: [String] })
  duplicateWarnings!: string[];

  @ApiProperty({
    type: [PossibleDuplicate],
    description:
      'Existing specimen records this row may duplicate; warning only, never blocks the row',
  })
  possibleDuplicates!: PossibleDuplicate[];

  @ApiProperty()
  valid!: boolean;

  @ApiProperty({
    description:
      'The source file marks this record as archived (for example a backup workbook). It is left unselected by default and is imported as a new Uncataloged record if chosen.',
  })
  archivedInSource!: boolean;

  @ApiProperty({
    description:
      'Lots that will be created with this record (from the row and the Lots sheet)',
  })
  lotsToImport!: number;

  @ApiProperty({
    description:
      'Lots in the source that are missing parts or cannot be resolved; they are not created, and fieldWarnings says why',
  })
  lotsSkipped!: number;

  @ApiProperty({
    description:
      'True when the row has no accession number, so the next USC-BM-YYYY-NNNN number is assigned at commit',
  })
  accessionNumberWillBeGenerated!: boolean;

  @ApiProperty({
    type: ImportCatalogReadiness,
    description:
      'Missing catalog requirements never make a row invalid; they tell the curator what is still needed before the record can be Cataloged',
  })
  catalogReadiness!: ImportCatalogReadiness;
}

export class SpecimenImportPreviewResult {
  @ApiProperty({
    description:
      'Pass this to POST /specimens/import/commit; it identifies exactly the reviewed rows below and expires after 30 minutes',
  })
  previewId!: string;

  @ApiProperty()
  expiresAt!: Date;

  @ApiProperty({ type: [SpecimenImportPreviewRow] })
  rows!: SpecimenImportPreviewRow[];

  @ApiProperty({ type: [String] })
  unmappedColumns!: string[];

  @ApiProperty({
    type: ImportLotSheetSummary,
    nullable: true,
    description:
      'How the rows of a "Lots" sheet (as in a backup workbook) were matched; null when the file has no Lots sheet',
  })
  lotSheet!: ImportLotSheetSummary | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Set for a backup workbook: what a re-import brings back and what it does not',
  })
  restoreNotice!: string | null;

  @ApiProperty({ description: 'Lots that valid rows will create' })
  lotsToImport!: number;

  @ApiProperty({
    description: 'Lots on valid rows that will not be created',
  })
  lotsSkipped!: number;

  @ApiProperty()
  totalRows!: number;

  @ApiProperty()
  validRows!: number;

  @ApiProperty()
  invalidRows!: number;

  @ApiProperty()
  rowsWithWarnings!: number;

  @ApiProperty({
    description: 'Valid rows that meet every catalog requirement',
  })
  catalogReadyRows!: number;

  @ApiProperty({
    description: 'Valid rows that will be imported with some values left out',
  })
  rowsWithFieldWarnings!: number;

  @ApiProperty({ description: 'Rows the source file marks as archived' })
  archivedRows!: number;
}

export class SpecimenImportCommitRowResult {
  @ApiProperty()
  rowNumber!: number;

  @ApiProperty()
  success!: boolean;

  @ApiPropertyOptional({ type: Specimen })
  specimen?: Specimen;

  @ApiPropertyOptional({ type: [String] })
  errors?: string[];

  @ApiPropertyOptional({
    description: 'Lots created with the record (successful rows only)',
  })
  lotsCreated?: number;

  @ApiPropertyOptional({
    description:
      'Lots left out at preview and not created (successful rows only); add them from the inventory',
  })
  lotsSkipped?: number;
}

export class SpecimenImportCommitResult {
  @ApiProperty()
  importBatchId!: string;

  @ApiProperty({ type: [SpecimenImportCommitRowResult] })
  results!: SpecimenImportCommitRowResult[];

  @ApiProperty()
  createdCount!: number;

  @ApiProperty()
  failedCount!: number;

  @ApiProperty({ description: 'Lots created across the saved rows' })
  lotsCreated!: number;

  @ApiProperty({
    description: 'Lots on the saved rows that were not created',
  })
  lotsSkipped!: number;
}
