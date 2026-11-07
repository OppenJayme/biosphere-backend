import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';
import { trimString } from '../../common/transforms/trim-string.transform';

// Curator handover (REQ-4.1-09). Both IDs are user_account IDs.
export class HandOverCuratorDto {
  @IsUUID()
  outgoingCuratorId!: string;

  @IsUUID()
  successorCuratorId!: string;

  // Why the handover is happening and who authorized it, kept in the audit
  // log (REQ-4.1-11).
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  authorizationReason!: string;
}
