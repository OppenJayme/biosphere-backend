import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { FAQ_AI_PROVIDER } from './ai/ai-provider';
import { FaqAiComposerService } from './ai/faq-ai-composer.service';
import { GeminiProvider } from './ai/gemini.provider';
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
  providers: [
    FaqService,
    FaqAssistantService,
    FaqReviewService,
    GeminiProvider,
    // Swap the provider here to use another model; nothing else changes.
    { provide: FAQ_AI_PROVIDER, useExisting: GeminiProvider },
    FaqAiComposerService,
  ],
  exports: [FaqService],
})
export class FaqModule {}
