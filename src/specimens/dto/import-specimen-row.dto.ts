import { ApiPropertyOptional } from '@nestjs/swagger';
import { CreateSpecimenDto } from './create-specimen.dto';

export class ImportSpecimenRowDto extends CreateSpecimenDto {
  @ApiPropertyOptional({ description: 'Original row number, for error reporting' })
  rowNumber?: number;
}