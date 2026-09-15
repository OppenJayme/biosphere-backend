import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { normalizeFaqTermList, trimFaqText } from './faq-text.transform';

export class CreateFaqEntryDto {
  @ApiProperty({ example: 'What are the museum opening hours?' })
  @Transform(trimFaqText)
  @IsString()
  @IsNotEmpty()
  question!: string;

  @ApiProperty({
    example: 'The museum is open during the approved posted hours.',
  })
  @Transform(trimFaqText)
  @IsString()
  @IsNotEmpty()
  answer!: string;

  @ApiPropertyOptional({
    type: [String],
    default: [],
    description: 'Curator-approved alternative visitor phrasings',
  })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(normalizeFaqTermList)
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  alternativeWording: string[] = [];

  @ApiPropertyOptional({
    type: [String],
    default: [],
    description: 'Curator-approved matching keywords',
  })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(normalizeFaqTermList)
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  keywords: string[] = [];

  @ApiPropertyOptional({ maxLength: 100, nullable: true })
  @IsOptional()
  @ValidateIf((_object, value: unknown) => value !== null)
  @Transform(trimFaqText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  category?: string | null;
}
