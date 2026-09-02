import { IsBoolean, IsIn, IsOptional, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';
import {
  SUPPORTED_AR_MODEL_FORMATS,
  type ArModelFormat,
} from './create-ar-asset.dto';

// Hand-written rather than PartialType(CreateArAssetDto) to avoid pulling in
// @nestjs/mapped-types as a new dependency for one small DTO. Swap it in if
// that package is already part of the project.
export class UpdateArAssetDto {
  @IsOptional()
  @IsUUID()
  exhibitId!: string;

  @IsOptional()
  @IsIn(SUPPORTED_AR_MODEL_FORMATS)
  modelFormat?: ArModelFormat;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  isEnabled?: boolean;
}