import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ImportSpecimenRowDto } from '../dto/import-specimen-row.dto';
import { Specimen } from './specimen.entity';

export class SpecimenImportPreviewRow {
  @ApiProperty()
  rowNumber!: number;

  @ApiProperty({ type: ImportSpecimenRowDto })
  data!: ImportSpecimenRowDto;

  @ApiProperty({ type: [String] })
  errors!: string[];

  @ApiProperty({ type: [String] })
  duplicateWarnings!: string[];

  @ApiProperty()
  valid!: boolean;
}

export class SpecimenImportPreviewResult {
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
