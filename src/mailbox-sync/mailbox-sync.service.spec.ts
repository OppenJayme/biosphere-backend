import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GmailClient, GmailApiError } from './gmail.client';
import { MailboxSyncService } from './mailbox-sync.service';

const INQUIRY_ID = '9a81836f-1111-4111-8111-111111111111';
const VISIT_ID = '9a81836f-2222-4222-8222-222222222222';
const NOW = new Date('2026-11-11T04:00:00.000Z');

const encode = (text: string) =>
  Buffer.from(text, 'utf8').toString('base64url');

const gmailMessage = (
  id: string,
  headers: Record<string, string>,
  text = 'We will arrive at 1 PM.',
  receivedAt = '2026-11-11T03:00:00.000Z',
) => ({
  id,
  internalDate: String(Date.parse(receivedAt)),
  payload: {
    mimeType: 'text/plain',
    headers: Object.entries({
      'Message-ID': `<${id}@mail.gmail.com>`,
      // What Gmail writes for a genuine sender; tests override it to forge.
      'Authentication-Results':
        'mx.google.com; dkim=pass header.i=@example.com; spf=pass; dmarc=pass header.from=example.com',
      ...headers,
    }).map(([name, value]) => ({ name, value })),
    body: { data: encode(text) },
  },
});

describe('MailboxSyncService', () => {
  const env: Record<string, string | undefined> = {};
  const config = { get: jest.fn((key: string) => env[key]) };
  const gmail = {
    isConfigured: jest.fn(() => true),
    listMessageIds: jest.fn(),
    getMessage: jest.fn(),
  };
  const prisma = {
    gmail_sync_state: { findUnique: jest.fn(), upsert: jest.fn() },
    communication_history: { findFirst: jest.fn(), create: jest.fn() },
    inquiry: { findMany: jest.fn() },
    visit_request: { findMany: jest.fn() },
    audit_log: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  let service: MailboxSyncService;
  let messages: Record<string, ReturnType<typeof gmailMessage>>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    jest.setSystemTime(NOW);
    Object.assign(env, {
      GMAIL_SYNC_ENABLED: 'true',
      GMAIL_MAILBOX: 'Museum@Example.com',
      GMAIL_SYNC_INTERVAL_SECONDS: undefined,
      GMAIL_SYNC_LOOKBACK_DAYS: undefined,
    });
    messages = {};
    gmail.isConfigured.mockReturnValue(true);
    gmail.listMessageIds.mockImplementation(() =>
      Promise.resolve(Object.keys(messages).reverse()),
    );
    gmail.getMessage.mockImplementation((id: string) =>
      Promise.resolve(messages[id]),
    );
    prisma.gmail_sync_state.findUnique.mockResolvedValue(null);
    prisma.communication_history.findFirst.mockResolvedValue(null);
    prisma.inquiry.findMany.mockResolvedValue([]);
    prisma.visit_request.findMany.mockResolvedValue([]);
    prisma.communication_history.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'entry-1', created_at: NOW, ...data }),
    );
    prisma.$transaction.mockImplementation(
      (callback: (client: unknown) => unknown) =>
        Promise.resolve(callback(prisma)),
    );
    service = new MailboxSyncService(
      prisma as unknown as PrismaService,
      gmail as unknown as GmailClient,
      config as unknown as ConfigService,
    );
  });

  afterEach(() => jest.useRealTimers());

  it('imports a reply matched by In-Reply-To from the record email', async () => {
    messages.r1 = gmailMessage('r1', {
      From: 'Maria <MARIA@example.com>',
      Subject: 'Re: About your visit',
      'In-Reply-To': '<sent-1@smtp-relay.mailin.fr>',
    });
    prisma.communication_history.findFirst.mockResolvedValue({
      inquiry: null,
      visit_request: { id: VISIT_ID, email_address: 'maria@example.com' },
    });

    await expect(service.sync()).resolves.toEqual({
      checked: 1,
      imported: 1,
      skipped: 0,
      failed: 0,
    });

    expect(gmail.listMessageIds).toHaveBeenCalledWith(
      // No saved progress: look back 14 days from now.
      `in:inbox -from:me after:${Math.floor((NOW.getTime() - 14 * 86_400_000) / 1000)}`,
    );
    expect(prisma.communication_history.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          direction: 'OUTBOUND',
          external_message_id: { in: ['<sent-1@smtp-relay.mailin.fr>'] },
        },
      }),
    );
    expect(prisma.communication_history.create).toHaveBeenCalledWith({
      data: {
        visit_request_id: VISIT_ID,
        recorded_by: null,
        direction: 'INBOUND',
        communication_type: 'VISITOR_REPLY',
        subject: 'Re: About your visit',
        message: 'We will arrive at 1 PM.',
        sent_at: new Date('2026-11-11T03:00:00.000Z'),
        external_message_id: '<r1@mail.gmail.com>',
      },
    });
    expect(prisma.audit_log.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        user_id: null,
        affected_record_id: VISIT_ID,
        affected_record_type: 'visit_request',
        action: 'IMPORT_VISITOR_REPLY',
        details: { entryId: 'entry-1' },
      }),
    });
    expect(prisma.gmail_sync_state.upsert).toHaveBeenCalledWith({
      where: { mailbox: 'museum@example.com' },
      create: expect.objectContaining({
        mailbox: 'museum@example.com',
        last_message_at: new Date('2026-11-11T03:00:00.000Z'),
        last_success_at: NOW,
        last_error: null,
      }),
      update: expect.objectContaining({ last_success_at: NOW }),
    });
  });

  it('falls back to the subject reference code plus the sender email', async () => {
    messages.r1 = gmailMessage('r1', {
      From: 'juan@example.com',
      Subject: 'Re: We received your BioSphere museum inquiry (Ref 9A81836F)',
    });
    prisma.inquiry.findMany.mockResolvedValue([{ id: INQUIRY_ID }]);

    await expect(service.sync()).resolves.toMatchObject({ imported: 1 });

    expect(prisma.inquiry.findMany).toHaveBeenCalledWith({
      where: {
        id: {
          gte: '9a81836f-0000-0000-0000-000000000000',
          lte: '9a81836f-ffff-ffff-ffff-ffffffffffff',
        },
        email_address: { equals: 'juan@example.com', mode: 'insensitive' },
      },
      select: { id: true },
      take: 2,
    });
    expect(prisma.communication_history.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ inquiry_id: INQUIRY_ID }),
    });
  });

  it('skips a thread reply sent from a different address', async () => {
    messages.r1 = gmailMessage('r1', {
      From: 'someone-else@example.com',
      Subject: 'Fwd: About your visit (Ref 9A81836F)',
      'In-Reply-To': '<sent-1@smtp-relay.mailin.fr>',
    });
    prisma.communication_history.findFirst.mockResolvedValue({
      inquiry: null,
      visit_request: { id: VISIT_ID, email_address: 'maria@example.com' },
    });

    await expect(service.sync()).resolves.toEqual({
      checked: 1,
      imported: 0,
      skipped: 1,
      failed: 0,
    });
    expect(prisma.communication_history.create).not.toHaveBeenCalled();
  });

  it('skips a reference shared by two of the sender records', async () => {
    messages.r1 = gmailMessage('r1', {
      From: 'maria@example.com',
      Subject: 'Re: (Ref 9A81836F)',
    });
    prisma.inquiry.findMany.mockResolvedValue([{ id: INQUIRY_ID }]);
    prisma.visit_request.findMany.mockResolvedValue([{ id: VISIT_ID }]);

    await expect(service.sync()).resolves.toMatchObject({ imported: 0 });
  });

  it('skips automated mail and mail with no reference', async () => {
    messages.auto = gmailMessage('auto', {
      From: 'maria@example.com',
      Subject: 'Automatic reply (Ref 9A81836F)',
      'Auto-Submitted': 'auto-replied',
    });
    messages.other = gmailMessage('other', {
      From: 'newsletter@example.com',
      Subject: 'Hello',
    });

    await expect(service.sync()).resolves.toEqual({
      checked: 2,
      imported: 0,
      skipped: 2,
      failed: 0,
    });
    expect(prisma.inquiry.findMany).not.toHaveBeenCalled();
  });

  it.each([
    ['no Authentication-Results header', undefined],
    [
      'a failed DMARC check',
      'mx.google.com; spf=softfail; dmarc=fail header.from=example.com',
    ],
    [
      'a DKIM signature from another domain only',
      'mx.google.com; dkim=pass header.i=@attacker.test; spf=fail; dmarc=none',
    ],
  ])('never imports a forged reply with %s (AC-2)', async (_label, results) => {
    const forged = gmailMessage('r1', {
      From: 'juan@example.com',
      Subject: 'Re: (Ref 9A81836F)',
    });
    forged.payload.headers = forged.payload.headers
      .filter((header) => header.name !== 'Authentication-Results')
      .concat(
        results ? [{ name: 'Authentication-Results', value: results }] : [],
      );
    messages.r1 = forged;
    prisma.inquiry.findMany.mockResolvedValue([{ id: INQUIRY_ID }]);

    await expect(service.sync()).resolves.toMatchObject({
      imported: 0,
      skipped: 1,
    });
    expect(prisma.communication_history.create).not.toHaveBeenCalled();
  });

  it('skips one reply the database rejects and still imports the next', async () => {
    messages.bad = gmailMessage(
      'bad',
      { From: 'juan@example.com', Subject: 'Re: (Ref 9A81836F)' },
      'first reply',
      '2026-11-11T02:00:00.000Z',
    );
    messages.good = gmailMessage(
      'good',
      { From: 'juan@example.com', Subject: 'Re: (Ref 9A81836F)' },
      'second reply',
      '2026-11-11T03:00:00.000Z',
    );
    gmail.listMessageIds.mockResolvedValue(['good', 'bad']);
    prisma.inquiry.findMany.mockResolvedValue([{ id: INQUIRY_ID }]);
    prisma.communication_history.create
      .mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError(
          'value too long: first reply',
          {
            code: 'P2000',
            clientVersion: 'test',
          },
        ),
      )
      .mockImplementationOnce(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'entry-2', created_at: NOW, ...data }),
      );

    await expect(service.sync()).resolves.toEqual({
      checked: 2,
      imported: 1,
      skipped: 0,
      failed: 1,
    });
    const saved = prisma.gmail_sync_state.upsert.mock.calls[0][0] as {
      update: { last_error: string; last_message_at: Date };
    };
    expect(saved.update.last_error).toBe(
      '1 matched repl(ies) could not be imported; see the server log.',
    );
    expect(saved.update.last_error).not.toContain('first reply');
    expect(saved.update.last_message_at).toEqual(
      new Date('2026-11-11T03:00:00.000Z'),
    );
  });

  it('stops at a database outage and resumes from the last handled message', async () => {
    messages.r1 = gmailMessage(
      'r1',
      { From: 'juan@example.com', Subject: 'Re: (Ref 9A81836F)' },
      'private reply text',
      '2026-11-11T02:00:00.000Z',
    );
    prisma.inquiry.findMany.mockResolvedValue([{ id: INQUIRY_ID }]);
    prisma.communication_history.create.mockRejectedValue(
      new Error('connection lost while writing private reply text'),
    );

    const failure = service.sync();

    await expect(failure).rejects.toThrow(
      'The mailbox could not be checked: Unexpected error while checking the mailbox; see the server log.',
    );
    const saved = prisma.gmail_sync_state.upsert.mock.calls[0][0] as {
      update: { last_error: string; last_message_at: Date | null };
    };
    expect(saved.update.last_error).not.toContain('private reply text');
    // Not advanced past the message that failed, so the next run retries it.
    expect(saved.update.last_message_at).toBeNull();
  });

  it('treats an already-imported reply as skipped', async () => {
    messages.r1 = gmailMessage('r1', {
      From: 'juan@example.com',
      Subject: 'Re: (Ref 9A81836F)',
    });
    prisma.inquiry.findMany.mockResolvedValue([{ id: INQUIRY_ID }]);
    prisma.communication_history.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await expect(service.sync()).resolves.toMatchObject({
      imported: 0,
      skipped: 1,
    });
  });

  it('resumes five minutes before the newest message already seen', async () => {
    prisma.gmail_sync_state.findUnique.mockResolvedValue({
      last_message_at: new Date('2026-11-11T03:00:00.000Z'),
    });

    await service.sync();

    expect(gmail.listMessageIds).toHaveBeenCalledWith(
      `in:inbox -from:me after:${Date.parse('2026-11-11T02:55:00.000Z') / 1000}`,
    );
  });

  it('records the error and keeps progress when Gmail fails', async () => {
    gmail.listMessageIds.mockRejectedValue(
      new GmailApiError(
        'Google token refresh failed (HTTP 400, invalid_grant).',
      ),
    );

    await expect(service.sync()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(prisma.gmail_sync_state.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          last_checked_at: NOW,
          last_error: 'Google token refresh failed (HTTP 400, invalid_grant).',
        }),
      }),
    );
  });

  it('shares one run between overlapping calls', async () => {
    const [first, second] = [service.sync(), service.sync()];
    await Promise.all([first, second]);
    expect(gmail.listMessageIds).toHaveBeenCalledTimes(1);
  });

  it('refuses to run when sync is off or not configured', async () => {
    env.GMAIL_SYNC_ENABLED = 'false';
    await expect(service.sync()).rejects.toThrow(
      'Mailbox sync is not set up on this server.',
    );
    env.GMAIL_SYNC_ENABLED = 'true';
    gmail.isConfigured.mockReturnValue(false);
    await expect(service.sync()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(gmail.listMessageIds).not.toHaveBeenCalled();
  });

  it('never starts polling in the test environment', () => {
    env.NODE_ENV = 'test';
    const setIntervalSpy = jest.spyOn(global, 'setInterval');
    service.onModuleInit();
    expect(setIntervalSpy).not.toHaveBeenCalled();
    env.NODE_ENV = undefined;
  });

  it('reports status without exposing credentials', async () => {
    prisma.gmail_sync_state.findUnique.mockResolvedValue({
      last_checked_at: NOW,
      last_success_at: NOW,
      last_message_at: null,
      last_error: null,
    });
    await expect(service.getStatus()).resolves.toEqual({
      enabled: true,
      configured: true,
      mailbox: 'museum@example.com',
      intervalSeconds: 120,
      lastCheckedAt: NOW,
      lastSuccessAt: NOW,
      lastMessageAt: null,
      lastError: null,
    });
  });
});
