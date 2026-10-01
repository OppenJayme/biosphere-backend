import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
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
  SPECIMEN_CATEGORY = 'specimenCategory',
  FAMILY = 'family',
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
      'Search identifiers, names, category, classification, remarks, collection name, taxonomy, collector, or tag names',
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

  @ApiPropertyOptional({
    maxLength: 100,
    description: 'Exact classification status, ignoring case',
  })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  classificationStatus?: string;

  @ApiPropertyOptional({
    maxLength: 100,
    description: 'Exact taxonomic kingdom, ignoring case',
  })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  kingdom?: string;

  @ApiPropertyOptional({
    maxLength: 100,
    description: 'Exact taxonomic phylum, ignoring case',
  })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  phylum?: string;

  @ApiPropertyOptional({
    maxLength: 100,
    description: 'Exact taxonomic class, ignoring case',
  })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  taxonClass?: string;

  @ApiPropertyOptional({
    maxLength: 100,
    description: 'Exact taxonomic order, ignoring case',
  })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  taxonOrder?: string;

  @ApiPropertyOptional({
    maxLength: 100,
    description: 'Exact taxonomic family, ignoring case',
  })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  family?: string;

  @ApiPropertyOptional({
    maxLength: 100,
    description: 'Exact taxonomic genus, ignoring case',
  })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  genus?: string;

  @ApiPropertyOptional({
    maxLength: 100,
    description: 'Exact taxonomic species, ignoring case',
  })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  species?: string;

  @ApiPropertyOptional({
    maxLength: 100,
    description: 'Exact tag name, ignoring case',
  })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  tag?: string;

  @ApiPropertyOptional({
    maxLength: 100,
    description:
      'Only specimens with an active lot in this condition, ignoring case',
  })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  conditionClass?: string;

  @ApiPropertyOptional({
    description:
      'Only specimens with an active lot in this storage unit (and, by default, its descendants)',
  })
  @IsOptional()
  @IsUUID()
  storageUnitId?: string;

  @ApiPropertyOptional({
    type: Boolean,
    default: true,
    description:
      'Whether storageUnitId also matches lots in child units, e.g. every drawer of a cabinet',
  })
  @IsOptional()
  @Transform(parseBooleanQuery)
  @IsBoolean()
  includeDescendantUnits = true;

  @ApiPropertyOptional({
    description: 'Date added on or after this ISO 8601 date or timestamp',
    example: '2026-01-01',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  createdFrom?: string;

  @ApiPropertyOptional({
    description:
      'Date added on or before this ISO 8601 timestamp; a plain date includes that whole day (UTC)',
    example: '2026-12-31',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  createdTo?: string;

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
