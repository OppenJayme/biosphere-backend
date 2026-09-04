import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';

export class SpecimenProvenanceDto {
  @ApiPropertyOptional() @IsOptional() @IsString() collector?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() donor?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() collectionDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() collectionLocation?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() preservationType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() preservationMethod?: string;
}