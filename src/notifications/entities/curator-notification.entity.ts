import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum CuratorNotificationType {
  NEW_INQUIRY = 'NEW_INQUIRY',
  NEW_VISIT_REQUEST = 'NEW_VISIT_REQUEST',
  // The visitor receipt or the curator alert for a submission was not
  // delivered (SRS 3.4: delivery failures are surfaced in-system).
  SUBMISSION_EMAIL_FAILED = 'SUBMISSION_EMAIL_FAILED',
}

// Matches audit_log.affected_record_type, so the frontend opens the record
// the same way from a notification or an audit entry (REQ-4.3-06).
export enum NotificationRecordType {
  INQUIRY = 'inquiry',
  VISIT_REQUEST = 'visit_request',
}

// One in-system alert. It carries no visitor personal data (REQ-4.3-08):
// the curator opens the record to see who submitted it.
export class CuratorNotification {
  @ApiPropertyOptional({
    nullable: true,
    description:
      'First read time for the acting curator; present when state management is enabled',
  })
  readAt?: Date | null;
  @ApiProperty({
    example: 'NEW_INQUIRY:9a81836f-0000-4000-8000-000000000000',
    description: 'Source-event key; enabled email-failure alerts use their unique audit event ID',
  })
  id!: string;

  @ApiProperty({ enum: CuratorNotificationType })
  type!: CuratorNotificationType;

  @ApiProperty({ example: 'New general inquiry' })
  title!: string;

  @ApiProperty({ enum: NotificationRecordType })
  recordType!: NotificationRecordType;

  @ApiProperty()
  recordId!: string;

  @ApiProperty({ example: '9A81836F' })
  referenceCode!: string;

  @ApiProperty({
    description:
      'When the visitor submitted the record, or when the email failed',
  })
  createdAt!: Date;
}

export class CuratorNotificationFeed {
  @ApiPropertyOptional({
    description:
      'True only after the state migration is deployed and feature enabled',
  })
  stateManagementEnabled?: boolean;

  @ApiPropertyOptional({
    description:
      'Unread, non-dismissed alerts for the acting curator, before limit; separate from unresolved work counts',
  })
  unreadTotal?: number;
  @ApiProperty({ description: 'Visible alerts before limit; excludes this curator dismissed items when enabled' })
  total!: number;

  @ApiProperty()
  pendingInquiries!: number;

  @ApiProperty()
  pendingVisitRequests!: number;

  @ApiProperty({
    description: 'Undelivered receipts and curator alerts on pending records',
  })
  emailFailures!: number;

  @ApiProperty({
    type: [CuratorNotification],
    description: 'Newest first, at most `limit` items',
  })
  items!: CuratorNotification[];
}
