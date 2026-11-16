import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PushModule } from '../push/push.module';
import { GmailClient } from './gmail.client';
import { MailboxSyncController } from './mailbox-sync.controller';
import { MailboxSyncService } from './mailbox-sync.service';

@Module({
  imports: [PrismaModule, PushModule],
  controllers: [MailboxSyncController],
  providers: [GmailClient, MailboxSyncService],
})
export class MailboxSyncModule {}
