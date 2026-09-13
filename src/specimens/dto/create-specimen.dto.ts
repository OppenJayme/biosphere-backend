import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { trimString } from '../../common/transforms/trim-string.transform';
import { SpecimenGender } from '../entities/specimen.entity';

export class CreateSpecimenDto {
  @ApiPropertyOptional({
    description: 'Existing collection UUID, or null while unassigned',
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  collectionId?: string | null;

  @ApiPropertyOptional({
    description: 'Nullable until assigned or confirmed (REQ-4.4-03)',
    nullable: true,
  })
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
  @MaxLength(100)
  specimenCategory?: string | null;

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

  @ApiPropertyOptional({
    description: 'Curator-entered or curator-approved classification status',
    nullable: true,
  })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  classificationStatus?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  remarks?: string | null;
}
