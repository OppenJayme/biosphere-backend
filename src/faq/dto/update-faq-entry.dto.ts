import { ApiPropertyOptional } from '@nestjs/swagger';
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

export class UpdateFaqEntryDto {
  @ApiPropertyOptional()
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(trimFaqText)
  @IsString()
  @IsNotEmpty()
  question?: string;

  @ApiPropertyOptional()
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(trimFaqText)
  @IsString()
  @IsNotEmpty()
  answer?: string;

  @ApiPropertyOptional({ type: [String] })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(normalizeFaqTermList)
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  alternativeWording?: string[];

  @ApiPropertyOptional({ type: [String] })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(normalizeFaqTermList)
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  keywords?: string[];

  @ApiPropertyOptional({ maxLength: 100, nullable: true })
  @IsOptional()
  @ValidateIf((_object, value: unknown) => value !== null)
  @Transform(trimFaqText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  category?: string | null;
}
