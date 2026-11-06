import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { trimString } from '../../common/transforms/trim-string.transform';
import { UserAccountStatus } from '../entities/user-account-summary.entity';

/** A curator activating or deactivating another curator (REQ-4.1-08). */
export class UpdateCuratorAccountStatusDto {
  @ApiProperty({ enum: UserAccountStatus })
  @IsEnum(UserAccountStatus)
  status!: UserAccountStatus;

  @ApiProperty({ example: 'Left the museum on 30 October', maxLength: 500 })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
