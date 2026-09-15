import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import type { account_status as AccountStatus } from '../../generated/prisma/client';

export class UpdateCuratorStatusDto {
  @IsIn(['ACTIVE', 'INACTIVE'])
  status!: AccountStatus;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  authorizationReason!: string;
}
