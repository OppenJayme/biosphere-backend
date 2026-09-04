import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { SpecimenTaxonomyDto } from './specimen-taxonomy.dto';
import { SpecimenProvenanceDto } from './specimen-provenance.dto';

export class CreateSpecimenDto {
  @ApiPropertyOptional() @IsOptional() @IsString() accessionNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() specimenCategory?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() scientificName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() commonName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() remarks?: string;

  @ApiPropertyOptional({ type: SpecimenTaxonomyDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SpecimenTaxonomyDto)
  taxonomy?: SpecimenTaxonomyDto;

  @ApiPropertyOptional({ type: SpecimenProvenanceDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SpecimenProvenanceDto)
  provenance?: SpecimenProvenanceDto;
}