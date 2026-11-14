import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MailEventsController } from './mail-events.controller';
import { MailEventsService } from './mail-events.service';

@Module({
  imports: [PrismaModule],
  controllers: [MailEventsController],
  providers: [MailEventsService],
})
export class MailEventsModule {}
