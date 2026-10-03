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
      items: [],
    });
    expect(prisma.audit_log.findMany).not.toHaveBeenCalled();
  });

  it('caps the items at the limit but counts every alert', async () => {
    const feed = await service.getFeed(2);

    expect(feed.items).toHaveLength(2);
    expect(feed.total).toBe(3);
  });
});
