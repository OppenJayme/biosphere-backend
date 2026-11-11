import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// One entry in an inquiry's or visit request's curator timeline (SRS
// REQ-4.8-12, REQ-4.9-14): status changes, referrals, internal notes,
// outbound emails, and visitor replies imported from the museum mailbox.
export class CommunicationEntry {
  @ApiProperty()
  id!: string;

  @ApiProperty({
    example: 'INTERNAL',
    enum: ['INTERNAL', 'OUTBOUND', 'INBOUND'],
  })
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

  @ApiPropertyOptional({
    nullable: true,
    description: 'When an email was sent, or when a visitor reply was received',
  })
  sentAt!: Date | null;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Account id of the acting curator; null for an imported visitor reply',
  })
  recordedBy!: string | null;

  @ApiProperty()
  createdAt!: Date;
}
