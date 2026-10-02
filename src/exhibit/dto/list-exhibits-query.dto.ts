import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ExhibitStatus } from '../entities/exhibit.entity';

export class ListExhibitsQueryDto {
  @ApiPropertyOptional({ enum: ExhibitStatus })
  @IsOptional()
  @IsEnum(ExhibitStatus)
  status?: ExhibitStatus;

  @ApiPropertyOptional({
    maxLength: 100,
    description:
      'Case-insensitive match on slug, common name, scientific name, or accession number',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({
    description: 'true: has an enabled AR asset; false: no enabled AR asset',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  arEnabled?: boolean;
}
