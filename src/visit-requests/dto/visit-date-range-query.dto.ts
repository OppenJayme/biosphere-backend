import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';
import { DATE_ONLY_PATTERN } from '../../communication-history/dto/date-filter';

// Longest range one calendar or availability request may cover: a month
// view padded to whole weeks is at most 42 days, so 93 leaves room for a
// three-month view without allowing unbounded scans.
export const MAX_VISIT_RANGE_DAYS = 93;

export class VisitDateRangeQueryDto {
  @ApiProperty({ example: '2026-11-01', description: 'YYYY-MM-DD, inclusive' })
  @Matches(DATE_ONLY_PATTERN, { message: 'from must be in YYYY-MM-DD format' })
  from!: string;

  @ApiProperty({
    example: '2026-11-30',
    description: `YYYY-MM-DD, inclusive; at most ${MAX_VISIT_RANGE_DAYS} days after from`,
  })
  @Matches(DATE_ONLY_PATTERN, { message: 'to must be in YYYY-MM-DD format' })
  to!: string;
}
