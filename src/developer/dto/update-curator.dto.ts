import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import type { AccountStatus } from '../entities/curator-account.entity';

export class UpdateCuratorStatusDto {
  @IsIn(['ACTIVE', 'INACTIVE'])
  status!: AccountStatus;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  authorizationReason?: string;
}