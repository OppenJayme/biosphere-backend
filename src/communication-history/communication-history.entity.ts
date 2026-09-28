import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// One entry in an inquiry's or visit request's curator timeline (SRS
// REQ-4.8-11, REQ-4.9-14): status changes, referrals, and internal notes.
// Outbound email entries will use the same shape once email is added.
export class CommunicationEntry {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: 'INTERNAL' })
  direction!: string;

  @ApiProperty({ example: 'STATUS_CHANGE' })
  type!: string;

  @ApiPropertyOptional({ nullable: true })
  subject!: string | null;

  @ApiProperty()
  message!: string;

  @ApiPropertyOptional({ nullable: true })
  recipientEmail!: string | null;

  @ApiPropertyOptional({ nullable: true })
  deliveryResult!: string | null;

  @ApiPropertyOptional({ nullable: true })
  sentAt!: Date | null;

  @ApiProperty({ description: 'Account id of the acting curator' })
  recordedBy!: string;

  @ApiProperty()
  createdAt!: Date;
}
