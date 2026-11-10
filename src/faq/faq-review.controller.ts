import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { PUBLIC_FORM_RATE_LIMIT } from '../config/rate-limit.config';
import { SubmitFaqReviewDto } from './dto/submit-faq-review.dto';
import { FaqReviewService } from './faq-review.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { FaqReviewQueryDto } from './dto/faq-review-query.dto';
import { ReviewFaqQuestionDto } from './dto/review-faq-question.dto';

@ApiTags('faq-review')
@Public()
@Throttle({ default: PUBLIC_FORM_RATE_LIMIT })
@Controller('faq/assistant')
export class FaqReviewSubmissionController {
  constructor(private readonly service: FaqReviewService) {}

  @Get('review-policy')
  policy() {
    return this.service.policy();
  }

  @Post('review-submissions')
  submit(@Body() dto: SubmitFaqReviewDto) {
    return this.service.submit(dto);
  }
}

@ApiTags('faq-review')
@Roles('CURATOR')
@Controller('faq/review-queue')
export class FaqReviewQueueController {
  constructor(private readonly service: FaqReviewService) {}

  @Get()
  list(
    @Query() query: FaqReviewQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.list(query.page, user.accountId);
  }

  @Patch(':id')
  review(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewFaqQuestionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.review(id, dto.status, user.accountId);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.remove(id, user.accountId);
  }
}
