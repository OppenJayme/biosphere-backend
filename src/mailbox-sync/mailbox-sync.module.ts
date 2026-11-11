import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { GmailClient } from './gmail.client';
import { MailboxSyncController } from './mailbox-sync.controller';
import { MailboxSyncService } from './mailbox-sync.service';

@Module({
  imports: [PrismaModule],
  controllers: [MailboxSyncController],
  providers: [GmailClient, MailboxSyncService],
})
export class MailboxSyncModule {}
