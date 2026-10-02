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
import { VisitRequestStatus } from '../entities/visit-request.entity';

export class ListVisitRequestsQueryDto {
  @ApiPropertyOptional({ enum: VisitRequestStatus })
  @IsOptional()
  @IsEnum(VisitRequestStatus)
  status?: VisitRequestStatus;

  @ApiPropertyOptional({
    maxLength: 100,
    description:
      'Case-insensitive match on contact person, email, organization, or purpose',
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

  @ApiPropertyOptional({
    example: '2026-10-01',
    description:
      'Visit on or after this date (YYYY-MM-DD): the approved date, or any preferred date while none is approved',
  })
  @IsOptional()
  @Matches(DATE_ONLY_PATTERN, {
    message: 'visitDateFrom must be in YYYY-MM-DD format',
  })
  visitDateFrom?: string;

  @ApiPropertyOptional({
    example: '2026-10-31',
    description:
      'Visit on or before this date (YYYY-MM-DD): the approved date, or any preferred date while none is approved',
  })
  @IsOptional()
  @Matches(DATE_ONLY_PATTERN, {
    message: 'visitDateTo must be in YYYY-MM-DD format',
  })
  visitDateTo?: string;
}
