import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { trimString } from '../../common/transforms/trim-string.transform';
import { SpecimenGender } from '../entities/specimen.entity';

/**
 * Candidate values from a record that has not been saved yet (or is being
 * edited). Core and provenance fields are both accepted so a multi-section
 * entry form can check before any section is saved.
 */
export class CheckSpecimenDuplicatesDto {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  accessionNumber?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  scientificName?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  commonName?: string | null;

  @ApiPropertyOptional({ enum: SpecimenGender, nullable: true })
  @IsOptional()
  @IsEnum(SpecimenGender)
  gender?: SpecimenGender | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  collector?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  donor?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  collectionLocation?: string | null;

  @ApiPropertyOptional({
    description: 'Calendar date in YYYY-MM-DD format',
    example: '2026-09-10',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'collectionDate must use YYYY-MM-DD format',
  })
  @IsDateString({ strict: true })
  collectionDate?: string | null;

  @ApiPropertyOptional({
    description:
      'Specimen being edited, so it is not reported as a duplicate of itself',
  })
  @IsOptional()
  @IsUUID()
  excludeSpecimenId?: string;
}
