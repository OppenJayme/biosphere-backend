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

    function auditRows(rows: {
      sync?: unknown[];
      reportFailed?: unknown[];
      reportSuccess?: unknown[];
    }) {
      prisma.audit_log.findMany.mockImplementation(({ where }: Where) => {
        if (where.module === 'offline-sync')
          return Promise.resolve(rows.sync ?? []);
        if (where.module === 'reports')
          return Promise.resolve(
            where.status === 'FAILED'
              ? (rows.reportFailed ?? [])
              : (rows.reportSuccess ?? []),
          );
        return Promise.resolve([]);
      });
    }

    it('shows the latest rejection per draft until the draft synchronizes', async () => {
      auditRows({
        sync: [
          {
            id: SYNC_EVENT,
            affected_record_id: DRAFT,
            created_at: new Date('2026-11-05T02:00:00Z'),
          },
          {
            id: REPORT_EVENT,
            affected_record_id: DRAFT,
            created_at: new Date('2026-11-05T01:00:00Z'),
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
      expect(prisma.audit_log.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            module: 'offline-sync',
            status: 'FAILED',
            user_id: ACCOUNT,
          }) as unknown,
        }),
      );

      prisma.offline_draft_sync.findMany.mockResolvedValue([
        {
          client_draft_id: DRAFT,
          synchronized_at: new Date('2026-11-05T03:00:00Z'),
        },
      ]);
      expect((await service.getFeed(20, ACCOUNT)).operationalAlerts).toBe(0);
    });

    it('keeps a payload conflict whose receipt predates the rejection', async () => {
      auditRows({
        sync: [
          {
            id: SYNC_EVENT,
            affected_record_id: DRAFT,
            created_at: new Date('2026-11-05T02:00:00Z'),
          },
        ],
      });
      prisma.offline_draft_sync.findMany.mockResolvedValue([
        {
          client_draft_id: DRAFT,
          synchronized_at: new Date('2026-11-04T00:00:00Z'),
        },
      ]);

      expect((await service.getFeed(20, ACCOUNT)).operationalAlerts).toBe(1);
    });

    it('clears a report failure once the same type succeeds later', async () => {
      const failed = {
        id: REPORT_EVENT,
        details: { reportType: 'INVENTORY' },
        created_at: new Date('2026-11-05T01:00:00Z'),
      };
      auditRows({ reportFailed: [failed] });
      expect((await service.getFeed(20, ACCOUNT)).items[0]).toMatchObject({
        id: `REPORT_FAILED:${REPORT_EVENT}`,
        recordType: 'report',
        recordId: REPORT_EVENT,
      });

      auditRows({
        reportFailed: [failed],
        reportSuccess: [
          {
            details: { reportType: 'VISIT_REQUEST_SUMMARY' },
            created_at: new Date('2026-11-05T02:00:00Z'),
          },
        ],
      });
      expect((await service.getFeed(20, ACCOUNT)).operationalAlerts).toBe(1);

      auditRows({
        reportFailed: [failed],
        reportSuccess: [
          {
            details: { reportType: 'INVENTORY' },
            created_at: new Date('2026-11-05T02:00:00Z'),
          },
        ],
      });
      expect((await service.getFeed(20, ACCOUNT)).operationalAlerts).toBe(0);
    });

    it('shows backup failures newer than the last completed backup of that type', async () => {
      prisma.backup_history.findMany.mockImplementation(({ where }: Where) =>
        Promise.resolve(
          where.status === 'FAILED'
            ? [
                {
                  id: BACKUP,
                  backup_type: 'SCHEDULED_FULL',
                  started_at: new Date('2026-11-05T01:00:00Z'),
                  completed_at: new Date('2026-11-05T01:05:00Z'),
                },
                {
                  id: '77777777-7777-4777-8777-777777777778',
                  backup_type: 'INCREMENTAL',
                  started_at: new Date('2026-11-04T01:00:00Z'),
                  completed_at: null,
                },
              ]
            : [
                {
                  backup_type: 'INCREMENTAL',
                  started_at: new Date('2026-11-04T05:00:00Z'),
                },
              ],
        ),
      );

      // Backups concern every curator, so no account is needed.
      const feed = await service.getFeed();

      expect(feed.operationalAlerts).toBe(1);
      expect(feed.items[0]).toMatchObject({
        id: `BACKUP_FAILED:${BACKUP}`,
        type: 'BACKUP_FAILED',
        recordType: 'backup_history',
        createdAt: new Date('2026-11-05T01:05:00Z'),
      });
    });

    it('omits personal sync and report alerts without an account', async () => {
      await service.getFeed();

      expect(prisma.audit_log.findMany).not.toHaveBeenCalled();
    });
  });
});
