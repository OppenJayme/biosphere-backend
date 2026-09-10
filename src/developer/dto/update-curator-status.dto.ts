import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
type AccountStatus = 'ACTIVE' | 'INACTIVE';

export class UpdateCuratorStatusDto {
  @IsIn(['ACTIVE', 'INACTIVE'])
  status!: AccountStatus;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  @MaxLength(500)
  authorizationReason?: string;
}
