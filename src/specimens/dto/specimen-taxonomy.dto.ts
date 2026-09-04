import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class SpecimenTaxonomyDto {
  @ApiPropertyOptional() @IsOptional() @IsString() kingdom?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phylum?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() class?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() orderName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() family?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() genus?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() species?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() habitat?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() ecologicalRole?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() conservationStatus?: string;
}