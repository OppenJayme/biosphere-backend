import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { trimString } from '../../common/transforms/trim-string.transform';
import { AR_AUTHORIZATION_REFERENCE_MAX_LENGTH } from './create-ar-asset.dto';

// Activation makes an asset available to visitors, so it must carry the
// documented authorization (REQ-4.2-05). Deactivation needs none.
export class ActivateArAssetDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(AR_AUTHORIZATION_REFERENCE_MAX_LENGTH)
  authorizationReference!: string;
}
