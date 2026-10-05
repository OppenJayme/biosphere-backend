import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { trimFaqText } from './faq-text.transform';

// Only the question is accepted: the assistant collects no name, email, or
// other personal information (REQ-4.11-07), and the text is never stored.
export class AskFaqAssistantDto {
  @ApiProperty({ example: 'What time does the museum open?', maxLength: 500 })
  @Transform(trimFaqText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  question!: string;
}
