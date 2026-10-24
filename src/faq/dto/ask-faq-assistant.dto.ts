import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { trimFaqText } from './faq-text.transform';

// Question plus optional public FAQ choice/topic IDs; no personal information or
// conversation history is accepted or persisted (REQ-4.11-07).
export class AskFaqAssistantDto {
  @ApiProperty({ example: 'What time does the museum open?', maxLength: 500 })
  @Transform(trimFaqText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  question!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Explicit visitor choice; must still refer to active public knowledge.',
  })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsUUID()
  selectedFaqId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Last answered public FAQ, used only for explicit supported follow-ups; not conversation history.',
  })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsUUID()
  contextFaqId?: string;
}
