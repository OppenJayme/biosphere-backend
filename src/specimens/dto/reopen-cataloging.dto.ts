import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { trimString } from '../../common/transforms/trim-string.transform';

/** Requires a durable explanation for the audited Cataloged-to-draft change. */
export class ReopenCatalogingDto {
  @ApiProperty({
    maxLength: 500,
    description: 'Why this Cataloged record needs additional catalog work',
  })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
