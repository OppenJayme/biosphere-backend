import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { normalizeTagName, TAG_NAME_PATTERN } from './tag-name.transform';

function parseQueryInteger({ value }: { value: unknown }): unknown {
  if (typeof value !== 'string') return value;
  return /^\d+$/.test(value) ? Number(value) : value;
}

export class ListTagsQueryDto {
  @ApiPropertyOptional({
    maxLength: 100,
    description: 'Case-insensitive tag-name search for curator autocomplete',
  })
  @IsOptional()
  @Transform(normalizeTagName)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(TAG_NAME_PATTERN, {
    message: 'search must not contain control characters',
  })
  search?: string;

  @ApiPropertyOptional({ default: 25, minimum: 1, maximum: 100 })
  @IsOptional()
  @Transform(parseQueryInteger)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;
}
