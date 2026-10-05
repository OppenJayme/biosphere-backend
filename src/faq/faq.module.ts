import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { FaqAssistantController } from './faq-assistant.controller';
import { FaqAssistantService } from './faq-assistant.service';
import { FaqController } from './faq.controller';
import { FaqService } from './faq.service';

@Module({
  imports: [PrismaModule],
  controllers: [FaqController, FaqAssistantController],
  providers: [FaqService, FaqAssistantService],
  exports: [FaqService],
})
export class FaqModule {}
