import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { trimString } from '../../common/transforms/trim-string.transform';
import { SpecimenGender, SpecimenStatus } from '../entities/specimen.entity';

export enum SpecimenSortField {
  UPDATED_AT = 'updatedAt',
  CREATED_AT = 'createdAt',
  ACCESSION_NUMBER = 'accessionNumber',
  SCIENTIFIC_NAME = 'scientificName',
  COMMON_NAME = 'commonName',
  STATUS = 'status',
}

export enum SortDirection {
  ASC = 'asc',
  DESC = 'desc',
}

function parseBooleanQuery({ value }: { value: unknown }): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

export class SearchSpecimensQueryDto {
  @ApiPropertyOptional({
    maxLength: 100,
    description:
      'Search identifiers, names, category, classification, remarks, or collection name',
  })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ enum: SpecimenStatus })
  @IsOptional()
  @IsEnum(SpecimenStatus)
  status?: SpecimenStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  collectionId?: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  specimenCategory?: string;

  @ApiPropertyOptional({ enum: SpecimenGender })
  @IsOptional()
  @IsEnum(SpecimenGender)
  gender?: SpecimenGender;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @Transform(parseBooleanQuery)
  @IsBoolean()
  publicDisplay?: boolean;

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

  @ApiPropertyOptional({
    enum: SpecimenSortField,
    default: SpecimenSortField.UPDATED_AT,
  })
  @IsOptional()
  @IsEnum(SpecimenSortField)
  sortBy = SpecimenSortField.UPDATED_AT;

  @ApiPropertyOptional({
    enum: SortDirection,
    default: SortDirection.DESC,
  })
  @IsOptional()
  @IsEnum(SortDirection)
  sortDirection = SortDirection.DESC;
}
