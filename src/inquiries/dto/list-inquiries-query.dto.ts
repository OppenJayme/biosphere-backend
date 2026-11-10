import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { DATE_ONLY_PATTERN } from '../../communication-history/dto/date-filter';
import { optionalSearchTerm } from '../../communication-history/dto/search-query.transform';
import { InquiryStatus } from '../entities/inquiry.entity';

export class ListInquiriesQueryDto {
  @ApiPropertyOptional({ enum: InquiryStatus })
  @IsOptional()
  @IsEnum(InquiryStatus)
  status?: InquiryStatus;

  @ApiPropertyOptional({
    maxLength: 100,
    description:
      'Case-insensitive match on name, email, organization, inquiry type, or message',
  })
  @IsOptional()
  @Transform(optionalSearchTerm)
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({
    example: '2026-09-01',
    description: 'Submitted on or after this date (YYYY-MM-DD, museum time)',
  })
  @IsOptional()
  @Matches(DATE_ONLY_PATTERN, {
    message: 'submittedFrom must be in YYYY-MM-DD format',
  })
  submittedFrom?: string;

  @ApiPropertyOptional({
    example: '2026-09-30',
    description: 'Submitted on or before this date (YYYY-MM-DD, museum time)',
  })
  @IsOptional()
  @Matches(DATE_ONLY_PATTERN, {
    message: 'submittedTo must be in YYYY-MM-DD format',
  })
  submittedTo?: string;
}
