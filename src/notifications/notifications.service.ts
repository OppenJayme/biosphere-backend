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
import {
  OFFLINE_SYNC_AUDIT_ACTION,
  OFFLINE_SYNC_AUDIT_MODULE,
} from '../offline-sync/offline-sync-audit';
import {
  REPORT_AUDIT_ACTION,
  REPORT_AUDIT_MODULE,
} from '../reports/reports.service';

const PENDING_ORDER = [{ created_at: 'desc' as const }, { id: 'asc' as const }];

// Rows arrive newest first; keep the first row for each key.
function latestBy<T>(rows: T[], key: (row: T) => string): T[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const value = key(row);
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function reportTypeOf(row: { details: unknown }): string {
  const details = row.details as { reportType?: unknown } | null;
  return typeof details?.reportType === 'string' ? details.reportType : '';
}

const OPERATIONAL_TITLES = {
  [CuratorNotificationType.SYNC_FAILED]:
    'An offline draft could not be synchronized',
  [CuratorNotificationType.BACKUP_FAILED]: 'A backup failed',
  [CuratorNotificationType.REPORT_FAILED]: 'A report could not be generated',
} as const;

const FAILURE_TITLES: Record<string, string> = {
  [RECEIPT_AUDIT_ACTION]: 'Receipt email to the visitor was not delivered',
  [ALERT_AUDIT_ACTION]: 'Curator alert email was not delivered',
};

// In-system alerts for new public submissions (REQ-4.8-08, REQ-4.9-07,
// REQ-4.3-05), plus undelivered submission emails, which SRS 3.4 requires
// to be surfaced in-system. Source alerts stay derived from Pending records.
// Operational alerts (sync, backup and report failures) derive from audit and
// backup history and clear when their failure is resolved (REQ-4.3-10).
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
    if (!this.stateEnabled) return this.sourceFeed(limit, accountId);
    if (!accountId) throw new UnauthorizedException();
    const source = await this.sourceFeed(Number.MAX_SAFE_INTEGER, accountId);
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
    const source = await this.sourceFeed(Number.MAX_SAFE_INTEGER, accountId);
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
    accountId?: string,
  ): Promise<CuratorNotificationFeed> {
    const select = { id: true, created_at: true };
    const [inquiries, visitRequests, operational] = await Promise.all([
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
      this.operationalAlerts(accountId),
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
      ...operational,
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
      operationalAlerts: operational.length,
      items: items.slice(0, limit),
    };
  }

  // Failures that stay internal (REQ-4.3-10). Sync and report failures belong
  // to the curator who hit them; backup failures concern every curator.
  private async operationalAlerts(
    accountId?: string,
  ): Promise<CuratorNotification[]> {
    const [syncFailures, backupFailures, reportFailures] = await Promise.all([
      accountId ? this.unresolvedSyncFailures(accountId) : [],
      this.unresolvedBackupFailures(),
      accountId ? this.unresolvedReportFailures(accountId) : [],
    ]);
    return [...syncFailures, ...backupFailures, ...reportFailures];
  }

  // Latest rejection per draft, until that draft ID synchronizes later.
  private async unresolvedSyncFailures(
    accountId: string,
  ): Promise<CuratorNotification[]> {
    const failures = await this.prisma.audit_log.findMany({
      where: {
        module: OFFLINE_SYNC_AUDIT_MODULE,
        action: OFFLINE_SYNC_AUDIT_ACTION,
        status: 'FAILED',
        user_id: accountId,
        affected_record_id: { not: null },
      },
      select: { id: true, affected_record_id: true, created_at: true },
      orderBy: PENDING_ORDER,
    });
    const latest = latestBy(failures, (row) => row.affected_record_id!);
    if (latest.length === 0) return [];

    const receipts = await this.prisma.offline_draft_sync.findMany({
      where: {
        created_by: accountId,
        client_draft_id: { in: latest.map((row) => row.affected_record_id!) },
      },
      select: { client_draft_id: true, synchronized_at: true },
    });
    const syncedAt = new Map(
      receipts.map((row) => [row.client_draft_id, row.synchronized_at]),
    );
    return latest
      .filter((row) => {
        const synced = syncedAt.get(row.affected_record_id!);
        return !synced || synced <= row.created_at;
      })
      .map((row) =>
        this.operationalNotification(
          CuratorNotificationType.SYNC_FAILED,
          NotificationRecordType.OFFLINE_DRAFT,
          row.id,
          row.affected_record_id!,
          row.created_at,
        ),
      );
  }

  // Failed backups newer than the last completed backup of the same type.
  private async unresolvedBackupFailures(): Promise<CuratorNotification[]> {
    const [failures, completed] = await Promise.all([
      this.prisma.backup_history.findMany({
        where: { status: 'FAILED' },
        select: {
          id: true,
          backup_type: true,
          started_at: true,
          completed_at: true,
        },
        orderBy: [{ started_at: 'desc' }, { id: 'asc' }],
      }),
      this.prisma.backup_history.findMany({
        where: { status: 'COMPLETED' },
        distinct: ['backup_type'],
        select: { backup_type: true, started_at: true },
        orderBy: [{ backup_type: 'asc' }, { started_at: 'desc' }],
      }),
    ]);
    const lastCompleted = new Map(
      completed.map((row) => [row.backup_type, row.started_at]),
    );
    return failures
      .filter((row) => {
        const completedAt = lastCompleted.get(row.backup_type);
        return !completedAt || completedAt < row.started_at;
      })
      .map((row) =>
        this.operationalNotification(
          CuratorNotificationType.BACKUP_FAILED,
          NotificationRecordType.BACKUP,
          row.id,
          row.id,
          row.completed_at ?? row.started_at,
        ),
      );
  }

  // Latest failure per report type, until that type generates successfully.
  private async unresolvedReportFailures(
    accountId: string,
  ): Promise<CuratorNotification[]> {
    const where = {
      module: REPORT_AUDIT_MODULE,
      action: REPORT_AUDIT_ACTION,
      user_id: accountId,
    };
    const failures = await this.prisma.audit_log.findMany({
      where: { ...where, status: 'FAILED' },
      select: { id: true, details: true, created_at: true },
      orderBy: PENDING_ORDER,
    });
    const latest = latestBy(failures, (row) => reportTypeOf(row));
    if (latest.length === 0) return [];

    const oldest = latest[latest.length - 1].created_at;
    const successes = await this.prisma.audit_log.findMany({
      where: { ...where, status: 'SUCCESS', created_at: { gt: oldest } },
      select: { details: true, created_at: true },
    });
    return latest
      .filter(
        (failure) =>
          !successes.some(
            (success) =>
              reportTypeOf(success) === reportTypeOf(failure) &&
              success.created_at > failure.created_at,
          ),
      )
      .map((row) =>
        this.operationalNotification(
          CuratorNotificationType.REPORT_FAILED,
          NotificationRecordType.REPORT,
          row.id,
          row.id,
          row.created_at,
        ),
      );
  }

  // Keyed by the source event, which the state table accepts as TYPE:uuid.
  private operationalNotification(
    type: keyof typeof OPERATIONAL_TITLES,
    recordType: NotificationRecordType,
    eventId: string,
    recordId: string,
    createdAt: Date,
  ): CuratorNotification {
    return {
      ...this.toNotification(
        type,
        recordType,
        OPERATIONAL_TITLES[type],
        recordId,
        createdAt,
      ),
      id: `${type}:${eventId}`,
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
