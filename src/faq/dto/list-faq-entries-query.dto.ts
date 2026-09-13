import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { FaqStatus } from '../entities/faq-entry.entity';
import { trimFaqText } from './faq-text.transform';

export class ListFaqEntriesQueryDto {
  @ApiPropertyOptional({ enum: FaqStatus })
  @IsOptional()
  @IsEnum(FaqStatus)
  status?: FaqStatus;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @Transform(trimFaqText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  category?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1, maximum: 1000000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000)
  page = 1;

  @ApiPropertyOptional({ default: 25, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;
}
