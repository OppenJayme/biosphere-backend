import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class ReviewUnansweredQuestionDto {
  @ApiPropertyOptional({
    description:
      'FAQ entry the curator added or improved to answer this question, if any',
  })
  @IsOptional()
  @IsUUID()
  faqEntryId?: string;
}
