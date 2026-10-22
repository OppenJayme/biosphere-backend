import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { ListUnansweredQuestionsQueryDto } from './dto/list-unanswered-questions-query.dto';
import { ReviewUnansweredQuestionDto } from './dto/review-unanswered-question.dto';
import { FaqUnansweredQuestionPage } from './entities/faq-unanswered-question.entity';
import { FaqUnansweredService } from './faq-unanswered.service';

@ApiTags('faq-knowledge')
@Roles('CURATOR')
@Controller('faq/unanswered')
export class FaqUnansweredController {
  constructor(private readonly service: FaqUnansweredService) {}

  @Get()
  @ApiOperation({
    summary:
      'Public assistant questions with no approved answer (last 90 days), grouped by wording',
  })
  @ApiOkResponse({ type: FaqUnansweredQuestionPage })
  list(
    @Query() query: ListUnansweredQuestionsQueryDto,
  ): Promise<FaqUnansweredQuestionPage> {
    return this.service.list(query);
  }

  @Patch(':id/review')
  @ApiOperation({
    summary:
      'Mark an unanswered wording as reviewed, optionally linking the FAQ entry that now answers it',
  })
  review(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewUnansweredQuestionDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ id: string; reviewedCount: number }> {
    return this.service.review(id, dto, user.accountId);
  }
}
