import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';
import { trimString } from '../../common/transforms/trim-string.transform';

/** The signed-in curator turns their work over to a successor (REQ-4.1-09). */
export class HandOverCuratorAccountDto {
  @ApiProperty({
    format: 'uuid',
    description:
      "The successor's own active curator account (public.user_account.id)",
  })
  @IsUUID()
  successorAccountId!: string;

  @ApiProperty({ example: 'Retiring on 30 June 2027', maxLength: 500 })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
