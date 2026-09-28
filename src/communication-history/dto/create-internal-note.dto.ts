import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { trimString } from '../../common/transforms/trim-string.transform';

export const MAX_INTERNAL_NOTE_LENGTH = 2000;

// A curator's internal note, e.g. information the visitor sent to the
// museum's external mailbox (SRS REQ-4.8-12, REQ-4.9-10/14).
export class CreateInternalNoteDto {
  @ApiProperty({
    example: 'Visitor replied by email: the class size is now 25.',
    maxLength: MAX_INTERNAL_NOTE_LENGTH,
  })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_INTERNAL_NOTE_LENGTH)
  message!: string;
}
