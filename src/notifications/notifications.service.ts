import { Injectable } from '@nestjs/common';
import { referenceCode } from '../mail/visitor-email';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_NOTIFICATION_LIMIT } from './dto/list-notifications-query.dto';
import {
  CuratorNotification,
  CuratorNotificationFeed,
  CuratorNotificationType,
  NotificationRecordType,
} from './entities/curator-notification.entity';
import {
  ALERT_AUDIT_ACTION,
  RECEIPT_AUDIT_ACTION,
} from './submission-notifications.service';

const PENDING_ORDER = [{ created_at: 'desc' as const }, { id: 'asc' as const }];

const FAILURE_TITLES: Record<string, string> = {
  [RECEIPT_AUDIT_ACTION]: 'Receipt email to the visitor was not delivered',
  [ALERT_AUDIT_ACTION]: 'Curator alert email was not delivered',
};

// In-system alerts for new public submissions (REQ-4.8-08, REQ-4.9-07,
// REQ-4.3-05), plus undelivered submission emails, which SRS 3.4 requires
// to be surfaced to an authorized user in-system. There is no notification
// table yet, so the feed is derived from submissions that are still Pending
// and their FAILED email audit entries: an alert clears when a curator
// reviews, refers, or decides the record. Read/dismiss state (REQ-4.3-07)
// needs its own table and is not stored.
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async getFeed(
    limit = DEFAULT_NOTIFICATION_LIMIT,
  ): Promise<CuratorNotificationFeed> {
    const select = { id: true, created_at: true };
    const [inquiries, visitRequests] = await Promise.all([
      this.prisma.inquiry.findMany({
        where: { status: 'PENDING' },
        select,
        orderBy: PENDING_ORDER,
      }),
      this.prisma.visit_request.findMany({
        where: { status: 'PENDING' },
        select,
        orderBy: PENDING_ORDER,
      }),
    ]);

    const pendingIds = [...inquiries, ...visitRequests].map((row) => row.id);
    const failures =
      pendingIds.length === 0
        ? []
        : await this.prisma.audit_log.findMany({
            where: {
              action: { in: [RECEIPT_AUDIT_ACTION, ALERT_AUDIT_ACTION] },
              status: 'FAILED',
              affected_record_type: {
                in: [
                  NotificationRecordType.INQUIRY,
                  NotificationRecordType.VISIT_REQUEST,
                ],
              },
              affected_record_id: { in: pendingIds },
            },
            select: {
              action: true,
              affected_record_id: true,
              affected_record_type: true,
              created_at: true,
            },
            orderBy: PENDING_ORDER,
          });

    const items = [
      ...inquiries.map((row) =>
        this.toNotification(
          CuratorNotificationType.NEW_INQUIRY,
          NotificationRecordType.INQUIRY,
          'New general inquiry',
          row.id,
          row.created_at,
        ),
      ),
      ...visitRequests.map((row) =>
        this.toNotification(
          CuratorNotificationType.NEW_VISIT_REQUEST,
          NotificationRecordType.VISIT_REQUEST,
          'New visit request',
          row.id,
          row.created_at,
        ),
      ),
      ...failures.map((row) =>
        this.toNotification(
          CuratorNotificationType.SUBMISSION_EMAIL_FAILED,
          row.affected_record_type as NotificationRecordType,
          FAILURE_TITLES[row.action],
          row.affected_record_id!,
          row.created_at,
          row.action,
        ),
      ),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return {
      total: items.length,
      pendingInquiries: inquiries.length,
      pendingVisitRequests: visitRequests.length,
      emailFailures: failures.length,
      items: items.slice(0, limit),
    };
  }

  private toNotification(
    type: CuratorNotificationType,
    recordType: NotificationRecordType,
    title: string,
    recordId: string,
    createdAt: Date,
    // Distinguishes the receipt and alert failures for the same record.
    keySuffix?: string,
  ): CuratorNotification {
    return {
      id: [type, keySuffix, recordId].filter(Boolean).join(':'),
      type,
      title,
      recordType,
      recordId,
      referenceCode: referenceCode(recordId),
      createdAt,
    };
  }
}
