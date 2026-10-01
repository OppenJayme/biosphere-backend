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

export class SpecimenImportPreviewRow {
  @ApiProperty()
  rowNumber!: number;

  @ApiProperty({ type: ImportSpecimenRowDto })
  data!: ImportSpecimenRowDto;

  @ApiProperty({ type: [String] })
  errors!: string[];

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
}
