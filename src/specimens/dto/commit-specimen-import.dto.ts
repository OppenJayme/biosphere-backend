import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ValidateNested } from 'class-validator';
import { ImportSpecimenRowDto } from './import-specimen-row.dto';

export const MAX_IMPORT_ROWS = 500;

export class CommitSpecimenImportDto {
  @ApiProperty({
    type: [ImportSpecimenRowDto],
    description:
      'Curator-approved rows from a preceding /specimens/import/preview call',
  })
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_IMPORT_ROWS)
  @ValidateNested({ each: true })
  @Type(() => ImportSpecimenRowDto)
  rows!: ImportSpecimenRowDto[];
}
