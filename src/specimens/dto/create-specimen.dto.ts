// src/specimens/dto/create-specimen.dto.ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreateSpecimenDto {
  @ApiPropertyOptional({
    description: 'Left null if not yet assigned (REQ-4.4-03)',
  })
  @IsOptional()
  @IsString()
  accessionNumber?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  scientificName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  commonName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  kingdom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phylum?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  class?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  order?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  family?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  genus?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  species?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  habitat?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  conservationStatus?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ecologicalRole?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  collector?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  donor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  collectionDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  collectionLocation?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
