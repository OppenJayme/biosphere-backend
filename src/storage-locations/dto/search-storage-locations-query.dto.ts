import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { trimString } from '../../common/transforms/trim-string.transform';

export enum StorageUnitLifecycleFilter {
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
  ALL = 'ALL',
}

function parseBooleanQuery({ value }: { value: unknown }): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

export class SearchStorageLocationsQueryDto {
  @ApiPropertyOptional({
    maxLength: 100,
    description: 'Case-insensitive partial match against the storage label',
  })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({
    maxLength: 100,
    description: 'Exact, case-insensitive curator-managed unit type',
  })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  unitType?: string;

  @ApiPropertyOptional({
    maxLength: 100,
    description: 'Exact, case-insensitive curator-managed storage type',
  })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  storageType?: string;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @Transform(parseBooleanQuery)
  @IsBoolean()
  holdsSpecimens?: boolean;

  @ApiPropertyOptional({
    enum: StorageUnitLifecycleFilter,
    default: StorageUnitLifecycleFilter.ACTIVE,
  })
  @IsOptional()
  @IsEnum(StorageUnitLifecycleFilter)
  lifecycle = StorageUnitLifecycleFilter.ACTIVE;

  @ApiPropertyOptional({ default: 1, minimum: 1, maximum: 1000000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000)
  page = 1;

  @ApiPropertyOptional({ default: 25, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;
}
