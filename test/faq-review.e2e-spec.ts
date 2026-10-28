import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SUPABASE_CLIENT } from '../src/supabase/supabase.constants';

type Item = {
  id: string;
  question_hash: string;
  question: string;
  repeat_count: number;
  status: string;
  first_submitted_at: Date;
  last_submitted_at: Date;
  expires_at: Date;
};
type Receipt = { id: string; queue_id: string; question_hash: string };
const curatorId = '22222222-2222-4222-8222-222222222222';
const tokenId = '11111111-1111-4111-8111-111111111111';
const originalReviewFlag = process.env.FAQ_REVIEW_ENABLED;

describe('Opt-in FAQ review HTTP boundary', () => {
  let app: INestApplication<App>;
  let config: ConfigService;
  let items: Map<string, Item>;
  let receipts: Map<string, Receipt>;
  const database = {
    audit_log: { create: jest.fn() },
    user_account: { findUnique: jest.fn() },
    faq_review_item: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    faq_review_receipt: { findUnique: jest.fn(), create: jest.fn() },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    config = new ConfigService({ FAQ_REVIEW_ENABLED: 'false' });
    items = new Map();
    receipts = new Map();
    jest.resetAllMocks();
    database.$transaction.mockImplementation(
      (operation: (tx: unknown) => unknown) => operation(database),
    );
    database.audit_log.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => ({
        id: crypto.randomUUID(),
        ...data,
      }),
    );
    database.user_account.findUnique.mockImplementation(
      ({ where }: { where: { auth_user_id: string } }) => ({
        id: curatorId,
        role: where.auth_user_id === 'curator' ? 'CURATOR' : 'DEVELOPER',
        status: 'ACTIVE',
      }),
    );
    database.faq_review_item.findUnique.mockImplementation(
      ({ where }: { where: { id?: string; question_hash?: string } }) =>
        [...items.values()].find((item) =>
          where.id
            ? item.id === where.id
            : item.question_hash === where.question_hash,
        ) ?? null,
    );
    database.faq_review_item.findMany.mockImplementation(
      ({
        where,
        take,
      }: {
        where: { expires_at: { gt: Date } };
        take: number;
      }) =>
        [...items.values()]
          .filter((item) => item.expires_at > where.expires_at.gt)
          .slice(0, take),
    );
    database.faq_review_item.upsert.mockImplementation(
      ({
        where,
        create,
        update,
      }: {
        where: { question_hash: string };
        create: Omit<Item, 'id'>;
        update: { last_submitted_at: Date };
      }) => {
        const found = [...items.values()].find(
          (item) => item.question_hash === where.question_hash,
        );
        const item = found
          ? {
              ...found,
              status: 'PENDING',
              last_submitted_at: update.last_submitted_at,
              repeat_count: found.repeat_count + 1,
            }
          : { id: crypto.randomUUID(), ...create };
        items.set(item.id, item);
        return item;
      },
    );
    database.faq_review_item.updateMany.mockImplementation(
      ({
        where,
        data,
      }: {
        where: { id: string; expires_at: { gt: Date } };
        data: { status: string };
      }) => {
        const item = items.get(where.id);
        if (!item || item.expires_at <= where.expires_at.gt)
          return { count: 0 };
        items.set(item.id, { ...item, ...data });
        return { count: 1 };
      },
    );
    database.faq_review_item.deleteMany.mockImplementation(
      ({ where }: { where: { id?: string; expires_at?: { lte: Date } } }) => {
        let count = 0;
        for (const item of items.values())
          if (
            (!where.id || item.id === where.id) &&
            (!where.expires_at || item.expires_at <= where.expires_at.lte)
          ) {
            items.delete(item.id);
            count++;
            for (const receipt of receipts.values())
              if (receipt.queue_id === item.id) receipts.delete(receipt.id);
          }
        return { count };
      },
    );
    database.faq_review_receipt.findUnique.mockImplementation(
      ({ where }: { where: { id: string } }) => {
        const found = receipts.get(where.id);
        return found ? { ...found, queue: items.get(found.queue_id) } : null;
      },
    );
    database.faq_review_receipt.create.mockImplementation(
      ({ data }: { data: Receipt }) => {
        receipts.set(data.id, data);
        return data;
      },
    );
    const fixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ConfigService)
      .useValue(config)
      .overrideProvider(PrismaService)
      .useValue(database)
      .overrideProvider(SUPABASE_CLIENT)
      .useValue({
        auth: {
          getUser: (token: string) =>
            token === 'curator' || token === 'developer'
              ? { data: { user: { id: token } }, error: null }
              : { data: { user: null }, error: { message: 'Denied' } },
        },
      })
      .compile();
    app = fixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    if (originalReviewFlag === undefined) delete process.env.FAQ_REVIEW_ENABLED;
    else process.env.FAQ_REVIEW_ENABLED = originalReviewFlag;
  });

  it('reports review collection disabled without touching the queue database', async () => {
    await request(app.getHttpServer())
      .get('/faq/assistant/review-policy')
      .expect(200)
      .expect({ enabled: false, retentionDays: 30 });
    await request(app.getHttpServer())
      .post('/faq/assistant/review-submissions')
      .send({
        question: 'TEST missing museum topic?',
        consent: true,
        submissionId: '11111111-1111-4111-8111-111111111111',
      })
      .expect(503);
    expect(database.faq_review_item.upsert).not.toHaveBeenCalled();
  });

  it('accepts explicit consent when enabled and returns only a generic receipt', async () => {
    config.set('FAQ_REVIEW_ENABLED', 'true');
    await request(app.getHttpServer())
      .post('/faq/assistant/review-submissions')
      .send({
        question: 'TEST missing museum topic?',
        consent: true,
        submissionId: tokenId,
      })
      .expect(201)
      .expect({ accepted: true });
  });

  it('lets a curator read the queue while anonymous and Developer callers cannot', async () => {
    config.set('FAQ_REVIEW_ENABLED', 'true');
    await request(app.getHttpServer()).get('/faq/review-queue').expect(401);
    await request(app.getHttpServer())
      .get('/faq/review-queue')
      .auth('developer', { type: 'bearer' })
      .expect(403);
    await request(app.getHttpServer())
      .post('/faq/assistant/review-submissions')
      .send({
        question: 'TEST missing museum topic?',
        consent: true,
        submissionId: tokenId,
      })
      .expect(201);
    await request(app.getHttpServer())
      .get('/faq/review-queue')
      .auth('curator', { type: 'bearer' })
      .expect(200)
      .expect((response) => {
        const data = response.body as {
          items: Array<{ question: string; repeatCount: number }>;
        };
        expect(data.items).toHaveLength(1);
        expect(data.items[0].question).toBe('TEST missing museum topic?');
        expect(data.items[0].repeatCount).toBe(1);
        expect(JSON.stringify(data)).not.toMatch(
          /question_hash|submissionId|queue_id/,
        );
      });
  });

  it('records an explicit curator disposition without publishing knowledge or copying question text into audit details', async () => {
    config.set('FAQ_REVIEW_ENABLED', 'true');
    await request(app.getHttpServer())
      .post('/faq/assistant/review-submissions')
      .send({
        question: 'TEST private review wording?',
        consent: true,
        submissionId: tokenId,
      })
      .expect(201);
    const listed = await request(app.getHttpServer())
      .get('/faq/review-queue')
      .auth('curator', { type: 'bearer' })
      .expect(200);
    const id = (listed.body as { items: Array<{ id: string }> }).items[0].id;
    await request(app.getHttpServer())
      .patch('/faq/review-queue/' + id)
      .auth('developer', { type: 'bearer' })
      .send({ status: 'REVIEWED' })
      .expect(403);
    await request(app.getHttpServer())
      .patch('/faq/review-queue/' + id)
      .auth('curator', { type: 'bearer' })
      .send({ status: 'REVIEWED' })
      .expect(200)
      .expect({ updated: true });
    await request(app.getHttpServer())
      .get('/faq/review-queue')
      .auth('curator', { type: 'bearer' })
      .expect(200)
      .expect((response) =>
        expect(
          (response.body as { items: Array<{ status: string }> }).items[0]
            .status,
        ).toBe('REVIEWED'),
      );
    expect(JSON.stringify(database.audit_log.create.mock.calls)).not.toContain(
      'TEST private review wording?',
    );
  });

  it('lets curators remove submitted text without leaving it in audit payloads', async () => {
    config.set('FAQ_REVIEW_ENABLED', 'true');
    await request(app.getHttpServer())
      .post('/faq/assistant/review-submissions')
      .send({
        question: 'TEST remove private wording',
        consent: true,
        submissionId: tokenId,
      })
      .expect(201);
    const listed = await request(app.getHttpServer())
      .get('/faq/review-queue')
      .auth('curator', { type: 'bearer' })
      .expect(200);
    const id = (listed.body as { items: Array<{ id: string }> }).items[0].id;
    await request(app.getHttpServer())
      .delete('/faq/review-queue/' + id)
      .expect(401);
    await request(app.getHttpServer())
      .delete('/faq/review-queue/' + id)
      .auth('developer', { type: 'bearer' })
      .expect(403);
    await request(app.getHttpServer())
      .delete('/faq/review-queue/' + id)
      .auth('curator', { type: 'bearer' })
      .expect(200)
      .expect({ removed: true });
    await request(app.getHttpServer())
      .get('/faq/review-queue')
      .auth('curator', { type: 'bearer' })
      .expect(200)
      .expect((response) =>
        expect((response.body as { items: unknown[] }).items).toEqual([]),
      );
    expect(JSON.stringify(database.audit_log.create.mock.calls)).not.toContain(
      'TEST remove private wording',
    );
  });

  it('groups separate opt-ins but does not count a same-ID retry twice or extend expiry', async () => {
    config.set('FAQ_REVIEW_ENABLED', 'true');
    const submit = (submissionId: string, question: string) =>
      request(app.getHttpServer())
        .post('/faq/assistant/review-submissions')
        .send({ question, consent: true, submissionId });
    await submit(tokenId, 'TEST repeated question?').expect(201);
    const first = await request(app.getHttpServer())
      .get('/faq/review-queue')
      .auth('curator', { type: 'bearer' })
      .expect(200);
    const expiry = (first.body as { items: Array<{ expiresAt: string }> })
      .items[0].expiresAt;
    await submit(tokenId, 'TEST repeated question?').expect(201);
    await submit(
      '33333333-3333-4333-8333-333333333333',
      '  test   repeated question? ',
    ).expect(201);
    await submit(tokenId, 'Different question?').expect(409);
    await request(app.getHttpServer())
      .get('/faq/review-queue')
      .auth('curator', { type: 'bearer' })
      .expect(200)
      .expect((response) => {
        const data = response.body as {
          items: Array<{ repeatCount: number; expiresAt: string }>;
        };
        expect(data.items).toHaveLength(1);
        expect(data.items[0]).toMatchObject({
          repeatCount: 2,
          expiresAt: expiry,
        });
      });
  });

  it('requires explicit boolean consent and rejects personal/linkage/history fields', async () => {
    config.set('FAQ_REVIEW_ENABLED', 'true');
    for (const consent of [false, undefined, 'true'])
      await request(app.getHttpServer())
        .post('/faq/assistant/review-submissions')
        .send({ question: 'TEST?', consent, submissionId: tokenId })
        .expect(400);
    for (const extra of [
      { email: 'test@example.com' },
      { history: ['chat'] },
      { accountId: curatorId },
    ])
      await request(app.getHttpServer())
        .post('/faq/assistant/review-submissions')
        .send({
          question: 'TEST?',
          consent: true,
          submissionId: tokenId,
          ...extra,
        })
        .expect(400);
    await request(app.getHttpServer())
      .post('/faq/assistant/review-submissions')
      .send({ question: 'x'.repeat(501), consent: true, submissionId: tokenId })
      .expect(400);
    expect(database.faq_review_item.upsert).not.toHaveBeenCalled();
  });

  it('hides expired text and refuses late dispositions even before physical cleanup', async () => {
    config.set('FAQ_REVIEW_ENABLED', 'true');
    items.set(tokenId, {
      id: tokenId,
      question_hash: 'a'.repeat(64),
      question: 'EXPIRED private question',
      repeat_count: 1,
      status: 'PENDING',
      first_submitted_at: new Date(0),
      last_submitted_at: new Date(0),
      expires_at: new Date(1),
    });
    await request(app.getHttpServer())
      .get('/faq/review-queue')
      .auth('curator', { type: 'bearer' })
      .expect(200)
      .expect((response) =>
        expect((response.body as { items: unknown[] }).items).toEqual([]),
      );
    await request(app.getHttpServer())
      .patch('/faq/review-queue/' + tokenId)
      .auth('curator', { type: 'bearer' })
      .send({ status: 'REVIEWED' })
      .expect(404);
  });

  it('returns a safe retryable error without claiming success when persistence fails', async () => {
    config.set('FAQ_REVIEW_ENABLED', 'true');
    database.$transaction.mockRejectedValueOnce(
      new Error('PRIVATE DATABASE DIAGNOSTIC'),
    );
    await request(app.getHttpServer())
      .post('/faq/assistant/review-submissions')
      .send({
        question: 'TEST failed write',
        consent: true,
        submissionId: tokenId,
      })
      .expect(503)
      .expect((response) =>
        expect(JSON.stringify(response.body)).not.toMatch(
          /PRIVATE|TEST failed write/,
        ),
      );
    await request(app.getHttpServer())
      .post('/faq/assistant/review-submissions')
      .send({
        question: 'TEST failed write',
        consent: true,
        submissionId: tokenId,
      })
      .expect(201);
  });

  it('rejects invalid pagination, dispositions and identifiers', async () => {
    config.set('FAQ_REVIEW_ENABLED', 'true');
    await request(app.getHttpServer())
      .get('/faq/review-queue?page=0')
      .auth('curator', { type: 'bearer' })
      .expect(400);
    await request(app.getHttpServer())
      .patch('/faq/review-queue/' + tokenId)
      .auth('curator', { type: 'bearer' })
      .send({ status: 'ACTIVE' })
      .expect(400);
    await request(app.getHttpServer())
      .delete('/faq/review-queue/not-a-uuid')
      .auth('curator', { type: 'bearer' })
      .expect(400);
  });

  it('does not return queued text when audit persistence fails', async () => {
    config.set('FAQ_REVIEW_ENABLED', 'true');
    await request(app.getHttpServer())
      .post('/faq/assistant/review-submissions')
      .send({
        question: 'TEST audit-private text',
        consent: true,
        submissionId: tokenId,
      })
      .expect(201);
    database.audit_log.create.mockRejectedValueOnce(
      new Error('PRIVATE audit driver diagnostic'),
    );
    await request(app.getHttpServer())
      .get('/faq/review-queue')
      .auth('curator', { type: 'bearer' })
      .expect(503)
      .expect((response) =>
        expect(JSON.stringify(response.body)).not.toMatch(
          /audit-private|PRIVATE/,
        ),
      );
  });

  it('rate-limits public opt-in requests even when same-ID retries do not increase repeats', async () => {
    config.set('FAQ_REVIEW_ENABLED', 'true');
    for (let index = 0; index < 10; index++)
      await request(app.getHttpServer())
        .post('/faq/assistant/review-submissions')
        .send({
          question: 'TEST retry throttle',
          consent: true,
          submissionId: tokenId,
        })
        .expect(201);
    await request(app.getHttpServer())
      .post('/faq/assistant/review-submissions')
      .send({
        question: 'TEST retry throttle',
        consent: true,
        submissionId: tokenId,
      })
      .expect(429);
    await request(app.getHttpServer())
      .get('/faq/review-queue')
      .auth('curator', { type: 'bearer' })
      .expect(200)
      .expect((response) =>
        expect(
          (response.body as { items: Array<{ repeatCount: number }> }).items[0]
            .repeatCount,
        ).toBe(1),
      );
  });
});
