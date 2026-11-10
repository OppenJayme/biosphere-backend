import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { trimString } from '../../common/transforms/trim-string.transform';

export const MAX_VISITOR_MESSAGE_LENGTH = 5000;

// A curator-written email to the visitor: an inquiry reply (REQ-4.8-09) or a
// visit-request message such as a request for more information
// (REQ-4.9-10). The record's status does not change.
export class SendVisitorMessageDto {
  @ApiPropertyOptional({
    example: 'About your field trip request',
    maxLength: 150,
    description: 'Defaults to a subject with the reference number',
  })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  subject?: string;

  @ApiProperty({
    example: 'Could you send us the list of students joining the visit?',
    maxLength: MAX_VISITOR_MESSAGE_LENGTH,
  })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_VISITOR_MESSAGE_LENGTH)
  message!: string;
}
