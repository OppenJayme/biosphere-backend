import { ApiProperty } from '@nestjs/swagger';

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
  @ApiProperty({
    example: 'NEW_INQUIRY:9a81836f-0000-4000-8000-000000000000',
    description: 'Stable key built from the type and the record id',
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
  @ApiProperty({ description: 'Every alert in the feed, before `limit`' })
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
