import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { trimString } from '../../common/transforms/trim-string.transform';

// Documented authorization for an AR deployment (REQ-4.2-05), e.g. the
// curator's approval memo reference. Stored in the audit log entry of every
// upload, replacement, move, and activation.
export const AR_AUTHORIZATION_REFERENCE_MAX_LENGTH = 500;

// Approved single-file AR delivery formats for <model-viewer>. A plain .gltf
// may reference separate binary and texture files, so it is not accepted by
// the current one-file upload workflow. Extend this list only alongside the
// storage rules and public exhibit-page AR runtime.
export const SUPPORTED_AR_MODEL_FORMATS = ['glb', 'usdz'] as const;
export type ArModelFormat = (typeof SUPPORTED_AR_MODEL_FORMATS)[number];

// The actual file is sent as multipart form-data alongside this DTO
// (see DeveloperController#createArAsset, field name "file").
export class CreateArAssetDto {
  @IsUUID()
  exhibitId!: string;

  @IsIn(SUPPORTED_AR_MODEL_FORMATS)
  modelFormat!: ArModelFormat;

  // Multipart fields arrive as strings ("true"/"false"), so this needs an
  // explicit transform rather than relying on ValidationPipe's implicit
  // conversion.
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  isEnabled?: boolean = false;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(AR_AUTHORIZATION_REFERENCE_MAX_LENGTH)
  authorizationReference!: string;
}
