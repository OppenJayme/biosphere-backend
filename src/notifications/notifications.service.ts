import {
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UpdateNotificationStateDto } from './dto/update-notification-state.dto';
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
// to be surfaced in-system. Source alerts stay derived from Pending records.
// Optional recipient state never changes those business records or audit events.
@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly config?: ConfigService,
  ) {}

  private get stateEnabled() {
    return this.config?.get<string>('NOTIFICATION_STATE_ENABLED') === 'true';
  }

  async getFeed(
    limit = DEFAULT_NOTIFICATION_LIMIT,
    accountId?: string,
  ): Promise<CuratorNotificationFeed> {
    if (!this.stateEnabled) return this.sourceFeed(limit);
    if (!accountId) throw new UnauthorizedException();
    const source = await this.sourceFeed(Number.MAX_SAFE_INTEGER);
    const states = source.items.length
      ? await this.prisma.user_notification_state.findMany({
          where: {
            user_account_id: accountId,
            notification_id: { in: source.items.map((item) => item.id) },
          },
        })
      : [];
    const byId = new Map(states.map((state) => [state.notification_id, state]));
    const visible = source.items
      .filter((item) => !byId.get(item.id)?.dismissed_at)
      .map((item) => ({ ...item, readAt: byId.get(item.id)?.read_at ?? null }));
    return {
      ...source,
      stateManagementEnabled: true,
      total: visible.length,
      unreadTotal: visible.filter((item) => item.readAt === null).length,
      items: visible.slice(0, limit),
    };
  }

  async updateState(
    accountId: string,
    dto: UpdateNotificationStateDto,
  ): Promise<void> {
    if (!this.stateEnabled)
      throw new ServiceUnavailableException(
        'Notification state is not enabled.',
      );
    const source = await this.sourceFeed(Number.MAX_SAFE_INTEGER);
    if (!source.items.some((item) => item.id === dto.notificationId)) {
      throw new NotFoundException('Notification is no longer available.');
    }
    // Atomic per-recipient upsert: repeat READ/DISMISSED preserves the first timestamps.
    await this.prisma.$executeRaw`
      INSERT INTO public.user_notification_state(user_account_id, notification_id, read_at, dismissed_at)
      VALUES (${accountId}::uuid, ${dto.notificationId}, CURRENT_TIMESTAMP,
        CASE WHEN ${dto.state === 'DISMISSED'} THEN CURRENT_TIMESTAMP ELSE NULL END)
      ON CONFLICT (user_account_id, notification_id) DO UPDATE SET
        read_at = COALESCE(user_notification_state.read_at, EXCLUDED.read_at),
        dismissed_at = CASE WHEN EXCLUDED.dismissed_at IS NULL THEN user_notification_state.dismissed_at
          ELSE COALESCE(user_notification_state.dismissed_at,
            GREATEST(user_notification_state.read_at, EXCLUDED.dismissed_at)) END
    `;
  }

  private async sourceFeed(
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
              id: true,
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
      ...failures.map((row) => ({
        ...this.toNotification(
          CuratorNotificationType.SUBMISSION_EMAIL_FAILED,
          row.affected_record_type as NotificationRecordType,
          FAILURE_TITLES[row.action],
          row.affected_record_id!,
          row.created_at,
          row.action,
        ),
        ...(this.stateEnabled
          ? { id: `SUBMISSION_EMAIL_FAILED:${row.id}` }
          : {}),
      })),
    ].sort(
      (a, b) =>
        b.createdAt.getTime() - a.createdAt.getTime() ||
        (this.stateEnabled ? a.id.localeCompare(b.id) : 0),
    );

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
