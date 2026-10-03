import { ConfigService } from '@nestjs/config';
import { MailService, OutgoingEmail } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationRecordType } from './entities/curator-notification.entity';
import {
  NewSubmission,
  SubmissionNotificationsService,
} from './submission-notifications.service';

const INQUIRY_ID = '9a81836f-1111-4111-8111-111111111111';
const VISIT_ID = '5b2c0e7d-3333-4333-8333-333333333333';
const SUBMITTED_AT = new Date('2026-10-01T06:05:00.000Z');

const inquirySubmission = (
  overrides: Partial<NewSubmission> = {},
): NewSubmission => ({
  recordType: NotificationRecordType.INQUIRY,
  id: INQUIRY_ID,
  submittedAt: SUBMITTED_AT,
  visitorName: 'Juan <Dela> Cruz',
  visitorEmail: 'juan@example.com',
  ...overrides,
});

describe('SubmissionNotificationsService', () => {
  const prisma = {
    user_account: { findMany: jest.fn() },
    audit_log: { create: jest.fn() },
  };
  const mail = { send: jest.fn() };
  const env: Record<string, string | undefined> = {};
  const config = { get: jest.fn((key: string) => env[key]) };
  let service: SubmissionNotificationsService;

  const sentTo = (address: string): OutgoingEmail => {
    const call = mail.send.mock.calls.find(
      ([email]: [OutgoingEmail]) => email.to === address,
    ) as [OutgoingEmail] | undefined;
    if (!call) throw new Error(`No email sent to ${address}`);
    return call[0];
  };
  const auditFor = (action: string) =>
    (
      prisma.audit_log.create.mock.calls as Array<
        [{ data: Record<string, unknown> }]
      >
    ).find(([arg]) => arg.data.action === action)?.[0].data;

  beforeEach(() => {
    jest.clearAllMocks();
    env.FRONTEND_URL = 'https://curator.example/';
    env.CURATOR_ALERT_EMAILS = undefined;
    prisma.user_account.findMany.mockResolvedValue([
      { full_name: 'Curator One', users: { email: 'one@museum.example' } },
      { full_name: 'Curator Two', users: { email: 'TWO@museum.example ' } },
      { full_name: 'No Email', users: { email: null } },
    ]);
    mail.send.mockResolvedValue({ delivered: true, result: 'SENT <id>' });
    service = new SubmissionNotificationsService(
      prisma as unknown as PrismaService,
      mail as unknown as MailService,
      config as unknown as ConfigService,
    );
  });

  it('emails every active curator a link to the record', async () => {
    await service.announce(inquirySubmission());

    expect(prisma.user_account.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { role: 'CURATOR', status: 'ACTIVE' },
      }),
    );
    const alert = sentTo('one@museum.example');
    expect(sentTo('two@museum.example').toName).toBe('Curator Two');
    expect(alert.subject).toBe('New general inquiry received (Ref 9A81836F)');
    expect(alert.text).toContain('Hello Curator One,');
    expect(alert.text).toContain('October 1, 2026 at 2:05');
    expect(alert.text).toContain(
      `https://curator.example/public-website?tab=inquiries&selected=${INQUIRY_ID}`,
    );
    expect(auditFor('ALERT_CURATORS')).toEqual(
      expect.objectContaining({
        user_id: null,
        affected_record_id: INQUIRY_ID,
        affected_record_type: 'inquiry',
        module: 'inquiries',
        details: { recipients: 2, delivered: 2 },
        status: 'SUCCESS',
      }),
    );
  });

  it('alerts only the configured recipients when CURATOR_ALERT_EMAILS is set', async () => {
    env.CURATOR_ALERT_EMAILS =
      ' Two@museum.example , museum@museum.example, not-an-address';

    await service.announce(inquirySubmission());

    const recipients = (mail.send.mock.calls as Array<[OutgoingEmail]>)
      .map(([email]) => email.to)
      .filter((to) => to !== 'juan@example.com');
    expect(recipients).toEqual(['two@museum.example', 'museum@museum.example']);
    expect(sentTo('two@museum.example').toName).toBe('Curator Two');
    expect(sentTo('museum@museum.example').text).toContain('Hello Curator,');
    expect(auditFor('ALERT_CURATORS')).toEqual(
      expect.objectContaining({ details: { recipients: 2, delivered: 2 } }),
    );
  });

  it('keeps visitor details out of the curator alert', async () => {
    await service.announce(inquirySubmission());

    const alert = sentTo('one@museum.example');
    for (const body of [alert.subject, alert.text, alert.html]) {
      expect(body).not.toContain('Juan');
      expect(body).not.toContain('juan@example.com');
    }
  });

  it('sends the visitor an escaped receipt and audits its delivery', async () => {
    await service.announce(inquirySubmission());

    const receipt = sentTo('juan@example.com');
    expect(receipt.subject).toBe(
      'We received your BioSphere museum inquiry (Ref 9A81836F)',
    );
    expect(receipt.html).toContain('Juan &lt;Dela&gt; Cruz');
    expect(receipt.html).not.toContain('<Dela>');
    expect(auditFor('EMAIL_SUBMISSION_RECEIPT')).toEqual(
      expect.objectContaining({
        details: { delivered: true },
        status: 'SUCCESS',
      }),
    );
  });

  it('lists the preferred schedules on a visit request receipt', async () => {
    await service.announce(
      inquirySubmission({
        recordType: NotificationRecordType.VISIT_REQUEST,
        id: VISIT_ID,
        receiptDetails: [['Preferred option 1', 'October 15, 2030']],
      }),
    );

    const receipt = sentTo('juan@example.com');
    expect(receipt.text).toContain('Preferred option 1: October 15, 2030');
    expect(receipt.text).toContain('This is not yet an approval.');
    expect(sentTo('one@museum.example').text).toContain(
      `tab=visits&selected=${VISIT_ID}`,
    );
    expect(auditFor('ALERT_CURATORS')).toEqual(
      expect.objectContaining({ module: 'visit-requests' }),
    );
  });

  it('omits the link when FRONTEND_URL is not set', async () => {
    env.FRONTEND_URL = undefined;

    await service.announce(inquirySubmission());

    const alert = sentTo('one@museum.example');
    expect(alert.text).toContain('Sign in to BioSphere to review it.');
    expect(alert.html).not.toContain('href=');
  });

  it('audits a partly failed alert as FAILED', async () => {
    mail.send.mockImplementation((email: OutgoingEmail) =>
      Promise.resolve(
        email.to === 'two@museum.example'
          ? { delivered: false, result: 'FAILED 500' }
          : { delivered: true, result: 'SENT <id>' },
      ),
    );

    await service.announce(inquirySubmission());

    expect(auditFor('ALERT_CURATORS')).toEqual(
      expect.objectContaining({
        details: { recipients: 2, delivered: 1 },
        status: 'FAILED',
      }),
    );
  });

  it('audits a missing curator recipient as FAILED', async () => {
    prisma.user_account.findMany.mockResolvedValue([]);

    await service.announce(inquirySubmission());

    expect(auditFor('ALERT_CURATORS')).toEqual(
      expect.objectContaining({
        details: { recipients: 0, delivered: 0 },
        status: 'FAILED',
      }),
    );
  });

  it('never throws, and still sends the receipt when the curator lookup fails', async () => {
    prisma.user_account.findMany.mockRejectedValue(new Error('db down'));

    await expect(service.announce(inquirySubmission())).resolves.toBe(
      undefined,
    );
    expect(sentTo('juan@example.com')).toBeDefined();
  });
});
