import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

function parseBooleanQuery({ value }: { value: unknown }): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

export class ListSpecimenLotsQueryDto {
  @ApiPropertyOptional({
    type: Boolean,
    default: false,
    description:
      'Also return lots that were emptied or fully moved (is_active = false)',
  })
  @IsOptional()
  @Transform(parseBooleanQuery)
  @IsBoolean()
  includeInactive = false;
}
