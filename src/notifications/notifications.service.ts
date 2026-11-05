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
import { REPORT_TIMEZONE } from '../reports/report-period';

const PENDING_ORDER = [{ created_at: 'desc' as const }, { id: 'asc' as const }];

const OPERATIONAL_TITLES = {
  [CuratorNotificationType.SYNC_FAILED]:
    'An offline draft could not be synchronized',
  [CuratorNotificationType.BACKUP_FAILED]: 'A backup failed',
  [CuratorNotificationType.REPORT_FAILED]: 'A report could not be generated',
  [CuratorNotificationType.SPECIMEN_ARCHIVED]: 'A specimen was archived',
  [CuratorNotificationType.SPECIMEN_RESTORED]:
    'An archived specimen was restored',
  [CuratorNotificationType.LOT_MOVED]:
    'Specimens were moved to another storage location',
  [CuratorNotificationType.LOT_DEACCESSIONED]: 'Specimens were deaccessioned',
  [CuratorNotificationType.LOT_MISSING_LOSS]:
    'Specimens were recorded missing or lost',
  [CuratorNotificationType.RECORD_INCOMPLETE]:
    'A specimen has been Uncataloged for more than 7 days',
} as const;

// Days a change event stays in the feed, and days a specimen may stay
// Uncataloged before it is flagged; both in museum calendar days.
const CHANGE_EVENT_DAYS = 7;
const INCOMPLETE_RECORD_DAYS = 7;

// The significant operations that notify other curators (team decision,
// 2026-11-06). These audit actions are written by SpecimensService and
// SpecimenLotsService; every other action stays in the audit log only.
const CHANGE_EVENT_TYPES = {
  ARCHIVE_SPECIMEN: CuratorNotificationType.SPECIMEN_ARCHIVED,
  RESTORE_SPECIMEN: CuratorNotificationType.SPECIMEN_RESTORED,
  MOVE_SPECIMEN_LOT: CuratorNotificationType.LOT_MOVED,
} as const;
const LOSS_EVENT_TYPES = {
  DEACCESSION: CuratorNotificationType.LOT_DEACCESSIONED,
  MISSING_LOSS: CuratorNotificationType.LOT_MISSING_LOSS,
} as const;
// Actions that start a new Uncataloged period for an existing specimen.
const UNCATALOGED_AGAIN_ACTIONS = [
  'REOPEN_SPECIMEN_CATALOGING',
  'RESTORE_SPECIMEN',
];

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
    const [inquiries, visitRequests, operational, changes, incomplete] =
      await Promise.all([
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
        accountId ? this.changeEventAlerts(accountId) : [],
        this.incompleteRecordAlerts(),
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
      ...changes,
      ...incomplete,
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
      changeEvents: changes.length,
      incompleteRecords: incomplete.length,
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

  // Latest rejection per draft whose content never reached the server. Once a
  // receipt exists for the draft ID, its content is a specimen; a conflicting
  // re-send cannot sync and is corrected by editing that record online
  // (REQ-4.14-10), so it is not an unresolved sync failure. The database
  // returns only unresolved drafts, so the count is exact and needs no cap.
  private async unresolvedSyncFailures(
    accountId: string,
  ): Promise<CuratorNotification[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; affected_record_id: string; created_at: Date }>
    >`
      SELECT DISTINCT ON (a.affected_record_id)
        a.id, a.affected_record_id, a.created_at
      FROM public.audit_log a
      WHERE a.module = ${OFFLINE_SYNC_AUDIT_MODULE}
        AND a.action = ${OFFLINE_SYNC_AUDIT_ACTION}
        AND a.status = 'FAILED'
        AND a.user_id = ${accountId}::uuid
        AND a.affected_record_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.offline_draft_sync r
          WHERE r.created_by = a.user_id
            AND r.client_draft_id = a.affected_record_id
        )
      ORDER BY a.affected_record_id, a.created_at DESC, a.id DESC
    `;
    return rows.map((row) =>
      this.operationalNotification(
        CuratorNotificationType.SYNC_FAILED,
        NotificationRecordType.OFFLINE_DRAFT,
        row.id,
        row.affected_record_id,
        row.created_at,
      ),
    );
  }

  // A failure is recovered when a backup of the same type completes after the
  // failure ended, by completion time, so overlapping runs resolve correctly.
  private async unresolvedBackupFailures(): Promise<CuratorNotification[]> {
    const recovered = await this.prisma.backup_history.findMany({
      where: { status: 'COMPLETED', completed_at: { not: null } },
      distinct: ['backup_type'],
      select: { backup_type: true, completed_at: true },
      orderBy: [{ backup_type: 'asc' }, { completed_at: 'desc' }],
    });
    const failures = await this.prisma.backup_history.findMany({
      where: {
        status: 'FAILED',
        OR: [
          { backup_type: { notIn: recovered.map((row) => row.backup_type) } },
          ...recovered.map((row) => ({
            backup_type: row.backup_type,
            // The failure ended (or, unfinished, started) after the recovery.
            OR: [
              { completed_at: { gt: row.completed_at! } },
              { completed_at: null, started_at: { gt: row.completed_at! } },
            ],
          })),
        ],
      },
      select: { id: true, started_at: true, completed_at: true },
      orderBy: [{ started_at: 'desc' }, { id: 'asc' }],
    });
    return failures.map((row) =>
      this.operationalNotification(
        CuratorNotificationType.BACKUP_FAILED,
        NotificationRecordType.BACKUP,
        row.id,
        row.id,
        row.completed_at ?? row.started_at,
      ),
    );
  }

  // Latest failure per report type with no later success of that type for
  // the same curator. Both checks run in the database (the success lookup is
  // an EXISTS per failure), so the result is exact and bounded by report types.
  private async unresolvedReportFailures(
    accountId: string,
  ): Promise<CuratorNotification[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; created_at: Date }>
    >`
      SELECT DISTINCT ON (f.details->>'reportType') f.id, f.created_at
      FROM public.audit_log f
      WHERE f.module = ${REPORT_AUDIT_MODULE}
        AND f.action = ${REPORT_AUDIT_ACTION}
        AND f.status = 'FAILED'
        AND f.user_id = ${accountId}::uuid
        AND NOT EXISTS (
          SELECT 1 FROM public.audit_log s
          WHERE s.module = f.module
            AND s.action = f.action
            AND s.status = 'SUCCESS'
            AND s.user_id = f.user_id
            AND s.details->>'reportType' IS NOT DISTINCT FROM f.details->>'reportType'
            AND s.created_at > f.created_at
        )
      ORDER BY f.details->>'reportType', f.created_at DESC, f.id DESC
    `;
    return rows.map((row) =>
      this.operationalNotification(
        CuratorNotificationType.REPORT_FAILED,
        NotificationRecordType.REPORT,
        row.id,
        row.id,
        row.created_at,
      ),
    );
  }

  // Significant changes by other curators in the last 7 calendar days. Each
  // operation writes exactly one audit row, so there is one alert per event;
  // the actor never sees their own successful changes (team decision).
  private async changeEventAlerts(
    accountId: string,
  ): Promise<CuratorNotification[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        action: string;
        specimen_id: string;
        adjustment_type: string | null;
        created_at: Date;
      }>
    >`
      SELECT a.id, a.action,
        CASE WHEN a.module = 'specimens' THEN a.affected_record_id::text
          ELSE a.details->>'specimenId' END AS specimen_id,
        a.details->>'adjustmentType' AS adjustment_type,
        a.created_at
      FROM public.audit_log a
      WHERE a.status = 'SUCCESS'
        AND a.user_id IS DISTINCT FROM ${accountId}::uuid
        AND (a.created_at AT TIME ZONE ${REPORT_TIMEZONE})::date
          >= (now() AT TIME ZONE ${REPORT_TIMEZONE})::date - ${CHANGE_EVENT_DAYS}::int
        AND (
          (a.module = 'specimens'
            AND a.action IN ('ARCHIVE_SPECIMEN', 'RESTORE_SPECIMEN'))
          OR (a.module = 'specimen_lots' AND a.action = 'MOVE_SPECIMEN_LOT')
          OR (a.module = 'specimen_lots'
            AND a.action = 'ADJUST_SPECIMEN_LOT_QUANTITY'
            AND a.details->>'adjustmentType' IN ('DEACCESSION', 'MISSING_LOSS'))
        )
      ORDER BY a.created_at DESC, a.id DESC
    `;
    return rows.flatMap((row) => {
      const type =
        row.action === 'ADJUST_SPECIMEN_LOT_QUANTITY'
          ? LOSS_EVENT_TYPES[
              row.adjustment_type as keyof typeof LOSS_EVENT_TYPES
            ]
          : CHANGE_EVENT_TYPES[row.action as keyof typeof CHANGE_EVENT_TYPES];
      // A lot row without its specimen cannot open a record; skip it.
      if (!type || !row.specimen_id) return [];
      return [
        this.operationalNotification(
          type,
          NotificationRecordType.SPECIMEN,
          row.id,
          row.specimen_id,
          row.created_at,
        ),
      ];
    });
  }

  // Active specimens Uncataloged for more than 7 calendar days, counted from
  // creation or the latest reopen/restore. Visible to every curator; resolves
  // once cataloged or archived. A new Uncataloged period gets a new key, so a
  // dismissal from an earlier period does not hide it.
  private async incompleteRecordAlerts(): Promise<CuratorNotification[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{ specimen_id: string; period_id: string; overdue_at: Date }>
    >`
      SELECT s.id AS specimen_id,
        COALESCE(e.id, s.id) AS period_id,
        (((GREATEST(s.created_at, COALESCE(e.created_at, s.created_at))
          AT TIME ZONE ${REPORT_TIMEZONE})::date + ${INCOMPLETE_RECORD_DAYS + 1}::int)::timestamp
          AT TIME ZONE ${REPORT_TIMEZONE}) AS overdue_at
      FROM public.specimen s
      LEFT JOIN LATERAL (
        SELECT a.id, a.created_at FROM public.audit_log a
        WHERE a.affected_record_id = s.id
          AND a.module = 'specimens'
          AND a.action = ANY(${UNCATALOGED_AGAIN_ACTIONS}::text[])
          AND a.status = 'SUCCESS'
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT 1
      ) e ON true
      WHERE s.status = 'UNCATALOGED'
        AND s.archived_at IS NULL
        AND (GREATEST(s.created_at, COALESCE(e.created_at, s.created_at))
          AT TIME ZONE ${REPORT_TIMEZONE})::date
          < (now() AT TIME ZONE ${REPORT_TIMEZONE})::date - ${INCOMPLETE_RECORD_DAYS}::int
      ORDER BY overdue_at DESC, s.id DESC
    `;
    return rows.map((row) =>
      this.operationalNotification(
        CuratorNotificationType.RECORD_INCOMPLETE,
        NotificationRecordType.SPECIMEN,
        row.period_id,
        row.specimen_id,
        row.overdue_at,
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
