import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { FaqAssistantController } from './faq-assistant.controller';
import { FaqAssistantService } from './faq-assistant.service';
import { FaqController } from './faq.controller';
import { FaqService } from './faq.service';
import { FaqUnansweredController } from './faq-unanswered.controller';
import { FaqUnansweredService } from './faq-unanswered.service';

@Module({
  imports: [PrismaModule],
  controllers: [FaqController, FaqAssistantController, FaqUnansweredController],
  providers: [FaqService, FaqAssistantService, FaqUnansweredService],
  exports: [FaqService],
})
export class FaqModule {}
