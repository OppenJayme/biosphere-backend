import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { VisitRequestsService } from './visit-requests.service';
import { VisitRequestsController } from './visit-requests.controller';

@Module({
  imports: [PrismaModule, MailModule, NotificationsModule],
  controllers: [VisitRequestsController],
  providers: [VisitRequestsService],
  exports: [VisitRequestsService],
})
export class VisitRequestsModule {}
