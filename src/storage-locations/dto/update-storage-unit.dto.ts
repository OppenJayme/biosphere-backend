import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';
import { trimString } from '../../common/transforms/trim-string.transform';

export class UpdateStorageUnitDto {
  @ApiPropertyOptional()
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  label?: string;

  @ApiPropertyOptional({
    description: 'Curator-managed structural classification',
  })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  unitType?: string;

  @ApiPropertyOptional({
    description: 'Curator-managed storage classification',
  })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  storageType?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  size?: string | null;

  @ApiPropertyOptional()
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  holdsSpecimens?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number | null;
}
