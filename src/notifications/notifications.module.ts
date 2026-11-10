import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { SubmissionNotificationsService } from './submission-notifications.service';

@Module({
  imports: [PrismaModule, MailModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, SubmissionNotificationsService],
  exports: [SubmissionNotificationsService],
})
export class NotificationsModule {}
