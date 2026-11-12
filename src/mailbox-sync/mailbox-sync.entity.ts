import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MailboxSyncStatus {
  @ApiProperty({ description: 'GMAIL_SYNC_ENABLED is true on this server' })
  enabled!: boolean;

  @ApiProperty({ description: 'Gmail OAuth credentials and mailbox are set' })
  configured!: boolean;

  @ApiPropertyOptional({ nullable: true, example: 'museum@example.com' })
  mailbox!: string | null;

  @ApiProperty({ example: 120 })
  intervalSeconds!: number;

  @ApiPropertyOptional({ nullable: true })
  lastCheckedAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  lastSuccessAt!: Date | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Newest mailbox message seen so far',
  })
  lastMessageAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  lastError!: string | null;
}

export class MailboxSyncResult {
  @ApiProperty({ description: 'Mailbox messages read in this run' })
  checked!: number;

  @ApiProperty({ description: 'Visitor replies added to a timeline' })
  imported!: number;

  @ApiProperty({
    description:
      'Messages left in the mailbox only: unmatched, unauthenticated, automated, or already imported',
  })
  skipped!: number;

  @ApiProperty({
    description:
      'Matched replies that could not be saved; details are in the server log only',
  })
  failed!: number;
}
