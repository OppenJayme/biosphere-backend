import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { trimString } from '../../common/transforms/trim-string.transform';
import {
  AR_AUTHORIZATION_REFERENCE_MAX_LENGTH,
  SUPPORTED_AR_MODEL_FORMATS,
  type ArModelFormat,
} from './create-ar-asset.dto';

// Hand-written rather than PartialType(CreateArAssetDto) to avoid pulling in
// @nestjs/mapped-types as a new dependency for one small DTO. Swap it in if
// that package is already part of the project.
export class UpdateArAssetDto {
  @IsOptional()
  @IsUUID()
  exhibitId?: string;

  @IsOptional()
  @IsIn(SUPPORTED_AR_MODEL_FORMATS)
  modelFormat?: ArModelFormat;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  isEnabled?: boolean;

  // Optional here because deactivating needs no authorization; the service
  // requires it (and audits its absence) when the update replaces the file,
  // moves the asset, or activates it.
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(AR_AUTHORIZATION_REFERENCE_MAX_LENGTH)
  authorizationReference?: string;
}
