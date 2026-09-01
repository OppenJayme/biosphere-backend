// src/specimens/dto/import-specimen-row.dto.ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CreateSpecimenDto } from './create-specimen.dto';

// One row of a spreadsheet/CSV import (REQ-4.4-19/20). Extends the create
// DTO since the fields are the same; validation just runs per-row instead
// of failing the whole request on one bad row.
export class ImportSpecimenRowDto extends CreateSpecimenDto {
  @ApiPropertyOptional({ description: 'Original row number, for error reporting' })
  rowNumber?: number;
}