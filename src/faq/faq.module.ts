import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { FaqAssistantController } from './faq-assistant.controller';
import { FaqAssistantService } from './faq-assistant.service';
import { FaqController } from './faq.controller';
import { FaqService } from './faq.service';
import {
  FaqReviewQueueController,
  FaqReviewSubmissionController,
} from './faq-review.controller';
import { FaqReviewService } from './faq-review.service';

@Module({
  imports: [PrismaModule],
  controllers: [
    FaqController,
    FaqAssistantController,
    FaqReviewSubmissionController,
    FaqReviewQueueController,
  ],
  providers: [FaqService, FaqAssistantService, FaqReviewService],
  exports: [FaqService],
})
export class FaqModule {}
