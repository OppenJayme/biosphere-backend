import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import type { AccountStatus } from '../entities/curator-account.entity';

export class UpdateCuratorStatusDto {
  @IsIn(['ACTIVE', 'INACTIVE'])
  status!: AccountStatus;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  @MaxLength(500)
  authorizationReason?: string;
}