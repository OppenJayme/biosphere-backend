import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

export enum UnansweredQuestionReviewFilter {
  OPEN = 'OPEN',
  REVIEWED = 'REVIEWED',
  ALL = 'ALL',
}

export class ListUnansweredQuestionsQueryDto {
  @ApiPropertyOptional({
    enum: UnansweredQuestionReviewFilter,
    default: UnansweredQuestionReviewFilter.OPEN,
  })
  @IsOptional()
  @IsEnum(UnansweredQuestionReviewFilter)
  review: UnansweredQuestionReviewFilter = UnansweredQuestionReviewFilter.OPEN;

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
