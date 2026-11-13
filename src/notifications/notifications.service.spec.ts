import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

const INQUIRY_ID = '11111111-1111-4111-8111-111111111111';
const OLDER_INQUIRY_ID = '22222222-2222-4222-8222-222222222222';
const VISIT_ID = '33333333-3333-4333-8333-333333333333';

describe('NotificationsService', () => {
  const prisma = {
    inquiry: { findMany: jest.fn() },
    visit_request: { findMany: jest.fn() },
    audit_log: { findMany: jest.fn() },
    backup_history: { findMany: jest.fn() },
    offline_draft_sync: { findMany: jest.fn() },
    $queryRaw: jest.fn(),
  };
  let service: NotificationsService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.inquiry.findMany.mockResolvedValue([
      { id: INQUIRY_ID, created_at: new Date('2026-09-03T00:00:00.000Z') },
      {
        id: OLDER_INQUIRY_ID,
        created_at: new Date('2026-09-01T00:00:00.000Z'),
      },
    ]);
    prisma.visit_request.findMany.mockResolvedValue([
      { id: VISIT_ID, created_at: new Date('2026-09-02T00:00:00.000Z') },
    ]);
    prisma.audit_log.findMany.mockResolvedValue([]);
    prisma.backup_history.findMany.mockResolvedValue([]);
    prisma.offline_draft_sync.findMany.mockResolvedValue([]);
    prisma.$queryRaw.mockResolvedValue([]);
    service = new NotificationsService(prisma as unknown as PrismaService);
  });

  it('lists pending submissions newest first with counts', async () => {
    const feed = await service.getFeed();

    expect(feed).toMatchObject({
      total: 3,
      pendingInquiries: 2,
      pendingVisitRequests: 1,
      emailFailures: 0,
    });
    expect(feed.items.map((item) => item.recordId)).toEqual([
      INQUIRY_ID,
      VISIT_ID,
      OLDER_INQUIRY_ID,
    ]);
    expect(feed.items[1]).toEqual({
      id: `NEW_VISIT_REQUEST:${VISIT_ID}`,
      type: 'NEW_VISIT_REQUEST',
      title: 'New visit request',
      recordType: 'visit_request',
      recordId: VISIT_ID,
      referenceCode: '33333333',
      createdAt: new Date('2026-09-02T00:00:00.000Z'),
    });
  });

  it('reads only Pending records and never selects visitor details', async () => {
    await service.getFeed();

    for (const delegate of [prisma.inquiry, prisma.visit_request]) {
      expect(delegate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'PENDING' },
          select: { id: true, created_at: true },
        }),
      );
    }
  });

  it('surfaces undelivered receipts and alerts on pending records', async () => {
    prisma.audit_log.findMany.mockResolvedValue([
      {
        action: 'EMAIL_SUBMISSION_RECEIPT',
        affected_record_id: VISIT_ID,
        affected_record_type: 'visit_request',
        created_at: new Date('2026-09-04T00:00:00.000Z'),
      },
      {
        action: 'ALERT_CURATORS',
        affected_record_id: VISIT_ID,
        affected_record_type: 'visit_request',
        created_at: new Date('2026-09-04T00:00:00.000Z'),
      },
    ]);

    const feed = await service.getFeed();

    expect(prisma.audit_log.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          action: { in: ['EMAIL_SUBMISSION_RECEIPT', 'ALERT_CURATORS'] },
          status: 'FAILED',
          affected_record_type: { in: ['inquiry', 'visit_request'] },
          affected_record_id: {
            in: [INQUIRY_ID, OLDER_INQUIRY_ID, VISIT_ID],
          },
        },
      }),
    );
    expect(feed).toMatchObject({ total: 5, emailFailures: 2 });
    expect(feed.items.slice(0, 2)).toEqual([
      expect.objectContaining({
        id: `SUBMISSION_EMAIL_FAILED:EMAIL_SUBMISSION_RECEIPT:${VISIT_ID}`,
        type: 'SUBMISSION_EMAIL_FAILED',
        title: 'Receipt email to the visitor was not delivered',
        recordType: 'visit_request',
        referenceCode: '33333333',
      }),
      expect.objectContaining({
        id: `SUBMISSION_EMAIL_FAILED:ALERT_CURATORS:${VISIT_ID}`,
        title: 'Curator alert email was not delivered',
      }),
    ]);
  });

  it('skips the failure lookup when nothing is pending', async () => {
    prisma.inquiry.findMany.mockResolvedValue([]);
    prisma.visit_request.findMany.mockResolvedValue([]);

    await expect(service.getFeed()).resolves.toEqual({
      total: 0,
      pendingInquiries: 0,
      pendingVisitRequests: 0,
      emailFailures: 0,
      operationalAlerts: 0,
      changeEvents: 0,
      incompleteRecords: 0,
      items: [],
    });
    expect(prisma.audit_log.findMany).not.toHaveBeenCalled();
  });

  it('caps the items at the limit but counts every alert', async () => {
    const feed = await service.getFeed(2);

    expect(feed.items).toHaveLength(2);
    expect(feed.total).toBe(3);
  });
  describe('operational alerts (REQ-4.3-05, REQ-4.3-10)', () => {
    const ACCOUNT = '44444444-4444-4444-8444-444444444444';
    const DRAFT = '55555555-5555-4555-8555-555555555555';
    const SYNC_EVENT = '66666666-6666-4666-8666-666666666661';
    const REPORT_EVENT = '66666666-6666-4666-8666-666666666662';
    const BACKUP = '77777777-7777-4777-8777-777777777777';
    type Where = { where: { module?: string; status?: string } };

    beforeEach(() => {
      prisma.inquiry.findMany.mockResolvedValue([]);
      prisma.visit_request.findMany.mockResolvedValue([]);
    });

    // The database returns only matching rows; route by the queried data.
    function unresolvedRows(rows: {
      sync?: unknown[];
      reports?: unknown[];
      changes?: unknown[];
      incomplete?: unknown[];
      replies?: unknown[];
    }) {
      prisma.$queryRaw.mockImplementation((strings: TemplateStringsArray) => {
        const sql = strings.join('?');
        if (sql.includes('offline_draft_sync'))
          return Promise.resolve(rows.sync ?? []);
        if (sql.includes('MOVE_SPECIMEN_LOT'))
          return Promise.resolve(rows.changes ?? []);
        if (sql.includes('FROM public.specimen s'))
          return Promise.resolve(rows.incomplete ?? []);
        if (sql.includes('FROM public.communication_history c'))
          return Promise.resolve(rows.replies ?? []);
        return Promise.resolve(rows.reports ?? []);
      });
    }
    function sqlOf(call: number) {
      return (prisma.$queryRaw.mock.calls[call][0] as string[]).join('?');
    }

    it('alerts curators to visitor replies nobody has followed up', async () => {
      const ENTRY = '77777777-7777-4777-8777-777777777777';
      const VISIT = '5b2c0e7d-3333-4333-8333-333333333333';
      unresolvedRows({
        replies: [
          {
            id: ENTRY,
            inquiry_id: null,
            visit_request_id: VISIT,
            created_at: new Date('2026-11-14T03:10:00Z'),
          },
        ],
      });

      const feed = await service.getFeed(20, ACCOUNT);

      expect(feed.items).toContainEqual(
        expect.objectContaining({
          id: `VISITOR_REPLY:${ENTRY}`,
          type: 'VISITOR_REPLY',
          title: 'A visitor replied by email',
          recordType: 'visit_request',
          recordId: VISIT,
          referenceCode: '5B2C0E7D',
        }),
      );
      const sql = (prisma.$queryRaw.mock.calls as Array<[string[]]>)
        .map(([strings]) => strings.join('?'))
        .find((text) => text.includes('FROM public.communication_history c'));
      // Cleared by any later curator-recorded entry on the same record.
      expect(sql).toContain("c.direction = 'INBOUND'");
      expect(sql).toContain('r.recorded_by IS NOT NULL');
      expect(sql).toContain('r.created_at > c.created_at');
    });

    it('maps unresolved sync failures for the acting curator', async () => {
      unresolvedRows({
        sync: [
          {
            id: SYNC_EVENT,
            affected_record_id: DRAFT,
            created_at: new Date('2026-11-05T02:00:00Z'),
          },
        ],
      });

      const feed = await service.getFeed(20, ACCOUNT);

      expect(feed.operationalAlerts).toBe(1);
      expect(feed.items).toEqual([
        {
          id: `SYNC_FAILED:${SYNC_EVENT}`,
          type: 'SYNC_FAILED',
          title: 'An offline draft could not be synchronized',
          recordType: 'offline_draft',
          recordId: DRAFT,
          referenceCode: '55555555',
          createdAt: new Date('2026-11-05T02:00:00Z'),
        },
      ]);
      const sync = sqlOf(0);
      // Latest rejection per draft, drafts with a receipt excluded, no cap.
      expect(sync).toContain('DISTINCT ON (a.affected_record_id)');
      expect(sync).toContain('NOT EXISTS');
      expect(sync).not.toMatch(/LIMIT/i);
      expect(prisma.$queryRaw.mock.calls[0]).toContain(ACCOUNT);
    });

    it('maps unresolved report failures and checks success in the database', async () => {
      unresolvedRows({
        reports: [
          { id: REPORT_EVENT, created_at: new Date('2026-11-05T01:00:00Z') },
        ],
      });

      const feed = await service.getFeed(20, ACCOUNT);

      expect(feed.items[0]).toMatchObject({
        id: `REPORT_FAILED:${REPORT_EVENT}`,
        type: 'REPORT_FAILED',
        recordType: 'report',
        recordId: REPORT_EVENT,
      });
      const reports = sqlOf(1);
      expect(reports).toContain("DISTINCT ON (f.details->>'reportType')");
      expect(reports).toMatch(/NOT EXISTS[\s\S]*'SUCCESS'/);
      expect(reports).not.toMatch(/LIMIT/i);
    });

    it('counts every unresolved failure, not only the displayed items', async () => {
      unresolvedRows({
        sync: Array.from({ length: 150 }, (_, index) => ({
          id: `66666666-6666-4666-8666-${String(index).padStart(12, '0')}`,
          affected_record_id: `55555555-5555-4555-8555-${String(index).padStart(12, '0')}`,
          created_at: new Date(Date.UTC(2026, 10, 5, 0, 0, index)),
        })),
      });

      const feed = await service.getFeed(5, ACCOUNT);

      expect(feed.operationalAlerts).toBe(150);
      expect(feed.items).toHaveLength(5);
      // Newest first, regardless of the order the database returned them in.
      expect(feed.items[0].createdAt).toEqual(
        new Date(Date.UTC(2026, 10, 5, 0, 2, 29)),
      );
    });

    it('resolves backup failures by completion time, per backup type', async () => {
      const recoveredAt = new Date('2026-11-04T05:00:00Z');
      prisma.backup_history.findMany.mockImplementation(({ where }: Where) =>
        Promise.resolve(
          where.status === 'COMPLETED'
            ? [{ backup_type: 'INCREMENTAL', completed_at: recoveredAt }]
            : [
                {
                  id: BACKUP,
                  started_at: new Date('2026-11-05T01:00:00Z'),
                  completed_at: new Date('2026-11-05T01:05:00Z'),
                },
              ],
        ),
      );

      // Backups concern every curator, so no account is needed.
      const feed = await service.getFeed();

      expect(prisma.backup_history.findMany).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: {
            status: 'COMPLETED',
            completed_at: { not: null },
            NOT: {
              backup_type: { startsWith: 'SYNTHETIC\\_', mode: 'insensitive' },
            },
          },
          distinct: ['backup_type'],
          orderBy: [{ backup_type: 'asc' }, { completed_at: 'desc' }],
        }),
      );
      // Failures of a recovered type count only if they ended after the
      // recovery completed; unrecovered types are always unresolved.
      expect(prisma.backup_history.findMany).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: {
            status: 'FAILED',
            NOT: {
              backup_type: { startsWith: 'SYNTHETIC\\_', mode: 'insensitive' },
            },
            OR: [
              { backup_type: { notIn: ['INCREMENTAL'] } },
              {
                backup_type: 'INCREMENTAL',
                OR: [
                  { completed_at: { gt: recoveredAt } },
                  { completed_at: null, started_at: { gt: recoveredAt } },
                ],
              },
            ],
          },
        }),
      );
      expect(feed.operationalAlerts).toBe(1);
      expect(feed.items[0]).toMatchObject({
        id: `BACKUP_FAILED:${BACKUP}`,
        type: 'BACKUP_FAILED',
        recordType: 'backup_history',
        createdAt: new Date('2026-11-05T01:05:00Z'),
      });
    });

    it('omits personal and change alerts without an account', async () => {
      await service.getFeed();

      // Only the shared incomplete-record and visitor-reply lookups run.
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
      expect(sqlOf(0)).toContain('FROM public.specimen s');
      expect(sqlOf(1)).toContain('FROM public.communication_history c');
    });

    it('maps significant changes by other curators to one alert per event', async () => {
      const SPECIMEN = '88888888-8888-4888-8888-888888888888';
      const at = (minute: number) => new Date(Date.UTC(2026, 10, 6, 1, minute));
      const event = (n: number) =>
        `99999999-9999-4999-8999-${String(n).padStart(12, '0')}`;
      unresolvedRows({
        changes: [
          {
            id: event(1),
            action: 'ARCHIVE_SPECIMEN',
            specimen_id: SPECIMEN,
            adjustment_type: null,
            created_at: at(5),
          },
          {
            id: event(2),
            action: 'RESTORE_SPECIMEN',
            specimen_id: SPECIMEN,
            adjustment_type: null,
            created_at: at(4),
          },
          {
            id: event(3),
            action: 'MOVE_SPECIMEN_LOT',
            specimen_id: SPECIMEN,
            adjustment_type: null,
            created_at: at(3),
          },
          {
            id: event(4),
            action: 'ADJUST_SPECIMEN_LOT_QUANTITY',
            specimen_id: SPECIMEN,
            adjustment_type: 'DEACCESSION',
            created_at: at(2),
          },
          {
            id: event(5),
            action: 'ADJUST_SPECIMEN_LOT_QUANTITY',
            specimen_id: SPECIMEN,
            adjustment_type: 'MISSING_LOSS',
            created_at: at(1),
          },
          // Defensive: a row the query should never return maps to nothing.
          {
            id: event(6),
            action: 'ADJUST_SPECIMEN_LOT_QUANTITY',
            specimen_id: SPECIMEN,
            adjustment_type: 'ADDITION',
            created_at: at(0),
          },
        ],
      });

      const feed = await service.getFeed(20, ACCOUNT);

      expect(feed.changeEvents).toBe(5);
      expect(feed.items.map((item) => [item.id, item.recordType])).toEqual([
        [`SPECIMEN_ARCHIVED:${event(1)}`, 'specimen'],
        [`SPECIMEN_RESTORED:${event(2)}`, 'specimen'],
        [`LOT_MOVED:${event(3)}`, 'specimen'],
        [`LOT_DEACCESSIONED:${event(4)}`, 'specimen'],
        [`LOT_MISSING_LOSS:${event(5)}`, 'specimen'],
      ]);
      expect(feed.items.every((item) => item.recordId === SPECIMEN)).toBe(true);
      const changes = sqlOf(2);
      // The actor is excluded, only significant actions are read, 7-day window.
      expect(changes).toContain('a.user_id IS DISTINCT FROM');
      expect(prisma.$queryRaw.mock.calls[2]).toContain(ACCOUNT);
      expect(changes).toContain("'DEACCESSION', 'MISSING_LOSS'");
      expect(changes).not.toContain('UPDATE_SPECIMEN');
      expect(prisma.$queryRaw.mock.calls[2]).toContain(7);
    });

    it('maps overdue Uncataloged records with a per-period key', async () => {
      const SPECIMEN = '88888888-8888-4888-8888-888888888888';
      const PERIOD = '77777777-7777-4777-8777-777777777771';
      unresolvedRows({
        incomplete: [
          {
            specimen_id: SPECIMEN,
            period_id: PERIOD,
            overdue_at: new Date('2026-11-05T16:00:00Z'),
          },
        ],
      });

      const feed = await service.getFeed(20, ACCOUNT);

      expect(feed.incompleteRecords).toBe(1);
      expect(feed.items[0]).toEqual({
        id: `RECORD_INCOMPLETE:${PERIOD}`,
        type: 'RECORD_INCOMPLETE',
        title: 'A specimen has been Uncataloged for more than 7 days',
        recordType: 'specimen',
        recordId: SPECIMEN,
        referenceCode: '88888888',
        createdAt: new Date('2026-11-05T16:00:00Z'),
      });
      const incomplete = sqlOf(3);
      expect(incomplete).toContain("s.status = 'UNCATALOGED'");
      expect(incomplete).toContain('s.archived_at IS NULL');
    });
  });
});
