import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MailService } from '../mail/mail.service';
import { SubmissionNotificationsService } from '../notifications/submission-notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { VisitRequestsService } from '../visit-requests/visit-requests.service';
import { InquiriesService } from './inquiries.service';
import { InquiryStatus } from './entities/inquiry.entity';

const INQUIRY_ID = '11111111-1111-4111-8111-111111111111';
const CURATOR_ID = '22222222-2222-4222-8222-222222222222';
const VISIT_ID = '33333333-3333-4333-8333-333333333333';
const ENTRY_ID = '44444444-4444-4444-8444-444444444444';
const CREATED_AT = new Date('2026-09-01T00:00:00.000Z');

const inquiryRecord = (overrides: Record<string, unknown> = {}) => ({
  id: INQUIRY_ID,
  reviewed_by: null,
  full_name: 'Juan Dela Cruz',
  email_address: 'juan@example.com',
  contact_number: null,
  organization_name: null,
  inquiry_type: 'GENERAL',
  message: 'Are you open on Saturdays?',
  attachment_path: null,
  status: 'PENDING',
  created_at: CREATED_AT,
  updated_at: CREATED_AT,
  consent_accepted_at: CREATED_AT,
  visit_request: null,
  ...overrides,
});

const historyRow = (overrides: Record<string, unknown> = {}) => ({
  id: ENTRY_ID,
  inquiry_id: INQUIRY_ID,
  visit_request_id: null,
  recorded_by: CURATOR_ID,
  direction: 'INTERNAL',
  communication_type: 'NOTE',
  recipient_email: null,
  subject: null,
  message: 'Called the school.',
  delivery_result: null,
  sent_at: null,
  created_at: CREATED_AT,
  ...overrides,
});

describe('InquiriesService', () => {
  const inquiryDelegate = {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  };
  const historyDelegate = { create: jest.fn(), findMany: jest.fn() };
  const auditDelegate = { create: jest.fn() };
  const mail = { send: jest.fn() };
  const prisma = {
    inquiry: inquiryDelegate,
    communication_history: historyDelegate,
    audit_log: auditDelegate,
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(
    (callback: (client: unknown) => unknown) =>
      Promise.resolve(callback(prisma)),
  );
  const visitRequestsService = { createFromReferral: jest.fn() };
  const submissionNotifications = { announce: jest.fn() };
  let service: InquiriesService;

  beforeEach(() => {
    jest.clearAllMocks();
    historyDelegate.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(historyRow(data)),
    );
    mail.send.mockResolvedValue({ delivered: true, result: 'SENT <msg-1>' });
    service = new InquiriesService(
      prisma as unknown as PrismaService,
      visitRequestsService as unknown as VisitRequestsService,
      mail as unknown as MailService,
      submissionNotifications as unknown as SubmissionNotificationsService,
    );
  });

  it('emails a curator reply and records it without changing status', async () => {
    inquiryDelegate.findUnique.mockResolvedValue(inquiryRecord());

    const entry = await service.sendReply(
      INQUIRY_ID,
      { message: 'Yes, we are open on Saturdays from 9 to 4.' },
      CURATOR_ID,
    );

    expect(mail.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'juan@example.com',
        subject: 'Re: your BioSphere museum inquiry (Ref 11111111)',
        text: expect.stringContaining(
          'Yes, we are open on Saturdays from 9 to 4.',
        ),
      }),
    );
    expect(inquiryDelegate.update).not.toHaveBeenCalled();
    expect(entry).toMatchObject({
      direction: 'OUTBOUND',
      type: 'MESSAGE_EMAIL',
      deliveryResult: 'SENT <msg-1>',
    });
    expect(auditDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'EMAIL_VISITOR',
        details: {
          entryId: ENTRY_ID,
          communicationType: 'MESSAGE_EMAIL',
          delivered: true,
        },
      }),
    });
  });

  it('includes the reference code in receipts and search', async () => {
    inquiryDelegate.create.mockResolvedValue(inquiryRecord());
    inquiryDelegate.findMany.mockResolvedValue([]);

    await expect(
      service.create({
        name: 'Juan Dela Cruz',
        email: 'juan@example.com',
        message: 'Hello',
        consentAccepted: true,
      }),
    ).resolves.toMatchObject({ referenceCode: '11111111' });

    await service.findAll({ search: '11111111' });
    const { where } = inquiryDelegate.findMany.mock.calls[0][0] as {
      where: { OR: object[] };
    };
    expect(where.OR).toContainEqual({
      id: {
        gte: '11111111-0000-0000-0000-000000000000',
        lte: '11111111-ffff-ffff-ffff-ffffffffffff',
      },
    });
  });

  it('stores a submission with consent and returns a receipt without personal data', async () => {
    inquiryDelegate.create.mockResolvedValue(inquiryRecord());

    const receipt = await service.create({
      name: 'Juan Dela Cruz',
      email: 'juan@example.com',
      message: 'Are you open on Saturdays?',
      consentAccepted: true,
    });

    expect(receipt).toEqual({
      id: INQUIRY_ID,
      referenceCode: '11111111',
      status: InquiryStatus.PENDING,
      submittedAt: CREATED_AT,
    });
    expect(inquiryDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        full_name: 'Juan Dela Cruz',
        email_address: 'juan@example.com',
        inquiry_type: 'GENERAL',
        status: 'PENDING',
        consent_accepted_at: expect.any(Date),
      }),
    });
    expect(auditDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        user_id: null,
        action: 'SUBMIT_INQUIRY',
        affected_record_id: INQUIRY_ID,
        details: { inquiryType: 'GENERAL' },
      }),
    });
    expect(submissionNotifications.announce).toHaveBeenCalledWith({
      recordType: 'inquiry',
      id: INQUIRY_ID,
      submittedAt: CREATED_AT,
      visitorName: 'Juan Dela Cruz',
      visitorEmail: 'juan@example.com',
    });
  });

  it('does not announce a submission that failed to save', async () => {
    inquiryDelegate.create.mockRejectedValue(new Error('db down'));

    await expect(
      service.create({
        name: 'Juan Dela Cruz',
        email: 'juan@example.com',
        message: 'Are you open on Saturdays?',
        consentAccepted: true,
      }),
    ).rejects.toThrow('db down');
    expect(submissionNotifications.announce).not.toHaveBeenCalled();
  });

  it('filters by submission date in museum time, both ends inclusive', async () => {
    inquiryDelegate.findMany.mockResolvedValue([]);

    await service.findAll({
      submittedFrom: '2026-09-01',
      submittedTo: '2026-09-30',
    });

    expect(inquiryDelegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: undefined,
          created_at: {
            gte: new Date('2026-08-31T16:00:00.000Z'),
            lt: new Date('2026-09-30T16:00:00.000Z'),
          },
        },
      }),
    );
  });

  it.each([
    [
      'a reversed range',
      { submittedFrom: '2026-09-30', submittedTo: '2026-09-01' },
    ],
    ['an impossible date', { submittedFrom: '2026-02-30' }],
  ])('rejects %s', async (_label, query) => {
    await expect(service.findAll(query)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(inquiryDelegate.findMany).not.toHaveBeenCalled();
  });

  it('maps stored rows to the curator entity', async () => {
    inquiryDelegate.findMany.mockResolvedValue([
      inquiryRecord({ visit_request: { id: VISIT_ID } }),
    ]);

    await expect(
      service.findAll({ status: InquiryStatus.PENDING }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: INQUIRY_ID,
        name: 'Juan Dela Cruz',
        email: 'juan@example.com',
        status: InquiryStatus.PENDING,
        visitRequestId: VISIT_ID,
      }),
    ]);
    expect(inquiryDelegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: InquiryStatus.PENDING } }),
    );
  });

  it('searches name, email, organization, type, and message', async () => {
    inquiryDelegate.findMany.mockResolvedValue([]);

    await service.findAll({ search: 'san carlos' });

    const search = { contains: 'san carlos', mode: 'insensitive' };
    expect(inquiryDelegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: undefined,
          OR: [
            { full_name: search },
            { email_address: search },
            { organization_name: search },
            { inquiry_type: search },
            { message: search },
          ],
        },
      }),
    );
  });

  it('changes status, records it in the timeline, and audits it', async () => {
    inquiryDelegate.findUnique.mockResolvedValue(inquiryRecord());
    inquiryDelegate.update.mockResolvedValue(
      inquiryRecord({ status: 'REVIEWED', reviewed_by: CURATOR_ID }),
    );

    const result = await service.update(
      INQUIRY_ID,
      { status: InquiryStatus.REVIEWED, note: 'Answered by phone.' },
      CURATOR_ID,
    );

    expect(result.status).toBe(InquiryStatus.REVIEWED);
    expect(inquiryDelegate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: INQUIRY_ID },
        data: expect.objectContaining({
          status: 'REVIEWED',
          reviewed_by: CURATOR_ID,
        }),
      }),
    );
    expect(historyDelegate.create).toHaveBeenCalledWith({
      data: {
        inquiry_id: INQUIRY_ID,
        recorded_by: CURATOR_ID,
        direction: 'INTERNAL',
        communication_type: 'STATUS_CHANGE',
        message:
          'Status changed from PENDING to REVIEWED.\n\nAnswered by phone.',
      },
    });
    expect(auditDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        user_id: CURATOR_ID,
        action: 'UPDATE_INQUIRY_STATUS',
        details: { previousStatus: 'PENDING', status: 'REVIEWED' },
      }),
    });
  });

  it('makes no writes when the status is unchanged', async () => {
    inquiryDelegate.findUnique.mockResolvedValue(
      inquiryRecord({ status: 'REVIEWED' }),
    );

    await service.update(
      INQUIRY_ID,
      { status: InquiryStatus.REVIEWED },
      CURATOR_ID,
    );

    expect(inquiryDelegate.update).not.toHaveBeenCalled();
    expect(historyDelegate.create).not.toHaveBeenCalled();
    expect(auditDelegate.create).not.toHaveBeenCalled();
  });

  it('closes a reviewed inquiry', async () => {
    inquiryDelegate.findUnique.mockResolvedValue(
      inquiryRecord({ status: 'REVIEWED' }),
    );
    inquiryDelegate.update.mockResolvedValue(
      inquiryRecord({ status: 'CLOSED' }),
    );

    await expect(
      service.update(INQUIRY_ID, { status: InquiryStatus.CLOSED }, CURATOR_ID),
    ).resolves.toMatchObject({ status: InquiryStatus.CLOSED });
  });

  it.each([
    ['PENDING', InquiryStatus.CLOSED],
    ['CLOSED', InquiryStatus.REVIEWED],
    ['TURNED_TO_VISIT_REQUEST', InquiryStatus.CLOSED],
  ] as const)('rejects %s -> %s and writes nothing', async (from, to) => {
    inquiryDelegate.findUnique.mockResolvedValue(
      inquiryRecord({ status: from }),
    );

    await expect(
      service.update(INQUIRY_ID, { status: to }, CURATOR_ID),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(inquiryDelegate.update).not.toHaveBeenCalled();
    expect(historyDelegate.create).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown inquiry', async () => {
    inquiryDelegate.findUnique.mockResolvedValue(null);

    await expect(service.findOne(INQUIRY_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  describe('refer', () => {
    const referral = {
      phone: '0917 123 4567',
      organization: 'University of San Carlos',
      purpose: 'Class field trip',
      visitorCount: 20,
      preferredSchedules: [
        { date: '2030-10-15', startTime: '09:00', endTime: '11:00' },
      ],
    };

    it('opens a Pending visit request and marks the inquiry as referred', async () => {
      inquiryDelegate.findUnique.mockResolvedValue(inquiryRecord());
      visitRequestsService.createFromReferral.mockResolvedValue(VISIT_ID);
      inquiryDelegate.update.mockResolvedValue(
        inquiryRecord({
          status: 'TURNED_TO_VISIT_REQUEST',
          reviewed_by: CURATOR_ID,
          visit_request: { id: VISIT_ID },
        }),
      );

      const result = await service.refer(
        INQUIRY_ID,
        { ...referral, note: 'Teacher asked for a guided tour.' },
        CURATOR_ID,
      );

      expect(result.visitRequestId).toBe(VISIT_ID);
      expect(result.inquiry).toMatchObject({
        status: InquiryStatus.TURNED_TO_VISIT_REQUEST,
        visitRequestId: VISIT_ID,
      });
      expect(visitRequestsService.createFromReferral).toHaveBeenCalledWith(
        prisma,
        {
          sourceInquiryId: INQUIRY_ID,
          name: 'Juan Dela Cruz',
          email: 'juan@example.com',
          phone: '0917 123 4567',
          organization: 'University of San Carlos',
          purpose: 'Class field trip',
          visitorCount: 20,
          preferredSchedules: referral.preferredSchedules,
          consentAcceptedAt: CREATED_AT,
        },
        CURATOR_ID,
      );
      expect(historyDelegate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          inquiry_id: INQUIRY_ID,
          communication_type: 'REFERRAL',
          message:
            'Status changed from PENDING to TURNED_TO_VISIT_REQUEST.\n\n' +
            `Referred to visit request ${VISIT_ID}.\n\n` +
            'Teacher asked for a guided tour.',
        }),
      });
      expect(auditDelegate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'REFER_INQUIRY',
          details: { previousStatus: 'PENDING', visitRequestId: VISIT_ID },
        }),
      });
    });

    it("uses the inquiry's own phone and organization when omitted", async () => {
      inquiryDelegate.findUnique.mockResolvedValue(
        inquiryRecord({
          contact_number: '0918 000 0000',
          organization_name: 'Cebu Normal University',
        }),
      );
      visitRequestsService.createFromReferral.mockResolvedValue(VISIT_ID);
      inquiryDelegate.update.mockResolvedValue(
        inquiryRecord({ status: 'TURNED_TO_VISIT_REQUEST' }),
      );

      await service.refer(
        INQUIRY_ID,
        { visitorCount: 5, preferredSchedules: referral.preferredSchedules },
        CURATOR_ID,
      );

      expect(visitRequestsService.createFromReferral).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({
          phone: '0918 000 0000',
          organization: 'Cebu Normal University',
          purpose: null,
        }),
        CURATOR_ID,
      );
    });

    it('requires phone and organization the inquiry does not have', async () => {
      inquiryDelegate.findUnique.mockResolvedValue(inquiryRecord());

      await expect(
        service.refer(
          INQUIRY_ID,
          { visitorCount: 5, preferredSchedules: referral.preferredSchedules },
          CURATOR_ID,
        ),
      ).rejects.toThrow('The inquiry has no phone or organization');
      expect(visitRequestsService.createFromReferral).not.toHaveBeenCalled();
      expect(inquiryDelegate.update).not.toHaveBeenCalled();
    });

    it('rejects referring a closed or already referred inquiry', async () => {
      for (const status of ['CLOSED', 'TURNED_TO_VISIT_REQUEST']) {
        inquiryDelegate.findUnique.mockResolvedValue(inquiryRecord({ status }));

        await expect(
          service.refer(INQUIRY_ID, referral, CURATOR_ID),
        ).rejects.toBeInstanceOf(BadRequestException);
      }
      expect(visitRequestsService.createFromReferral).not.toHaveBeenCalled();
    });

    it('rejects an inquiry without a consent record', async () => {
      inquiryDelegate.findUnique.mockResolvedValue(
        inquiryRecord({ consent_accepted_at: null }),
      );

      await expect(
        service.refer(INQUIRY_ID, referral, CURATOR_ID),
      ).rejects.toThrow('no consent record');
      expect(visitRequestsService.createFromReferral).not.toHaveBeenCalled();
    });
  });

  it('adds an internal note without copying its text into the audit log', async () => {
    inquiryDelegate.findUnique.mockResolvedValue(inquiryRecord());

    const entry = await service.addNote(
      INQUIRY_ID,
      { message: 'Called the school.' },
      CURATOR_ID,
    );

    expect(entry).toMatchObject({
      id: ENTRY_ID,
      type: 'NOTE',
      direction: 'INTERNAL',
      message: 'Called the school.',
      recordedBy: CURATOR_ID,
    });
    expect(auditDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'ADD_INQUIRY_NOTE',
        details: { entryId: ENTRY_ID },
      }),
    });
  });

  it('lists the timeline oldest first and 404s for an unknown inquiry', async () => {
    inquiryDelegate.findUnique.mockResolvedValueOnce(inquiryRecord());
    historyDelegate.findMany.mockResolvedValue([historyRow()]);

    await expect(service.listHistory(INQUIRY_ID)).resolves.toEqual([
      expect.objectContaining({ id: ENTRY_ID, type: 'NOTE' }),
    ]);
    expect(historyDelegate.findMany).toHaveBeenCalledWith({
      where: { inquiry_id: INQUIRY_ID },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
    });

    inquiryDelegate.findUnique.mockResolvedValueOnce(null);
    await expect(service.listHistory(INQUIRY_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
