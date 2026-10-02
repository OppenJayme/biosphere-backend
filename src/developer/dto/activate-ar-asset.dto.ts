import { IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { trimString } from '../../common/transforms/trim-string.transform';
import { AR_AUTHORIZATION_REFERENCE_MAX_LENGTH } from './create-ar-asset.dto';

// Activation makes an asset available to visitors, so it must carry the
// documented authorization (REQ-4.2-05). Deactivation needs none.
// Required, but enforced by DeveloperService rather than here: an activation
// attempt without a reference must reach the service so it is audited
// (REQ-4.2-09). Only the type and length are checked here.
export class ActivateArAssetDto {
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(AR_AUTHORIZATION_REFERENCE_MAX_LENGTH)
  authorizationReference?: string;
}
