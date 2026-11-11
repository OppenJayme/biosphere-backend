import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../auth/decorators/roles.decorator';
import { MAILBOX_SYNC_RATE_LIMIT } from '../config/rate-limit.config';
import { MailboxSyncResult, MailboxSyncStatus } from './mailbox-sync.entity';
import { MailboxSyncService } from './mailbox-sync.service';

// Curator-only: the status names the museum mailbox, and a manual run
// reads it.
@ApiTags('mailbox-sync')
@Roles('CURATOR')
@Controller('mailbox-sync')
export class MailboxSyncController {
  constructor(private readonly mailboxSync: MailboxSyncService) {}

  @Get('status')
  @ApiOperation({ summary: 'When visitor replies were last checked' })
  @ApiOkResponse({ type: MailboxSyncStatus })
  getStatus(): Promise<MailboxSyncStatus> {
    return this.mailboxSync.getStatus();
  }

  @Post('run')
  @HttpCode(200)
  @Throttle({ default: MAILBOX_SYNC_RATE_LIMIT })
  @ApiOperation({
    summary: 'Check the museum mailbox for visitor replies now',
  })
  @ApiOkResponse({ type: MailboxSyncResult })
  run(): Promise<MailboxSyncResult> {
    return this.mailboxSync.sync();
  }
}
