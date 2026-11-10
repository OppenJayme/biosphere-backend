import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { trimFaqText } from './faq-text.transform';

// Question plus optional public FAQ choice/topic IDs and up to four earlier
// visitor questions from the same open chat. Nothing is persisted; history
// only helps interpret follow-ups and never adds facts (REQ-4.11-07).
export const FAQ_HISTORY_MAX_ITEMS = 4;
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

  @ApiPropertyOptional({
    type: [String],
    maxItems: FAQ_HISTORY_MAX_ITEMS,
    description:
      'Earlier visitor questions in this chat, oldest first. Used only to interpret follow-ups; never stored.',
  })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value)
      ? value.map((item: unknown) =>
          typeof item === 'string' ? item.trim().replace(/\s+/g, ' ') : item,
        )
      : value,
  )
  @IsArray()
  @ArrayMaxSize(FAQ_HISTORY_MAX_ITEMS)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(500, { each: true })
  history?: string[];
}
