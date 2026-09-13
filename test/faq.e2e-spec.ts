/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- Supertest bodies and Jest asymmetric matchers are typed as any. */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SUPABASE_CLIENT } from '../src/supabase/supabase.constants';

describe('FAQ knowledge management (e2e)', () => {
  const curatorToken = 'curator-faq-token';
  const developerToken = 'developer-faq-token';
  const curatorAuthId = '11111111-1111-4111-8111-111111111111';
  const curatorAccountId = '22222222-2222-4222-8222-222222222222';
  const developerAuthId = '33333333-3333-4333-8333-333333333333';
  const entryId = '44444444-4444-4444-8444-444444444444';
  const secondEntryId = '55555555-5555-4555-8555-555555555555';
  const testDate = new Date('2026-01-01T00:00:00.000Z');

  type FaqRecord = {
    id: string;
    question: string;
    answer: string;
    alternative_wording: string[];
    keywords: string[];
    category: string | null;
    status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
    created_by: string;
    updated_by: string | null;
    created_at: Date;
    updated_at: Date;
  };

  let app: INestApplication<App>;
  let entries: FaqRecord[];
  let auditCreate: jest.Mock;
  let faqCreate: jest.Mock;
  let faqUpdate: jest.Mock;

  const initialRecord = (overrides: Partial<FaqRecord> = {}): FaqRecord => ({
    id: entryId,
    question: 'When is the museum open?',
    answer: 'Please refer to the approved visiting hours.',
    alternative_wording: ['What are the opening hours?'],
    keywords: ['hours', 'open'],
    category: 'Visit',
    status: 'INACTIVE',
    created_by: curatorAccountId,
    updated_by: curatorAccountId,
    created_at: testDate,
    updated_at: testDate,
    ...overrides,
  });

  beforeEach(async () => {
    entries = [initialRecord()];
    auditCreate = jest.fn(({ data }: { data: Record<string, unknown> }) => ({
      id: crypto.randomUUID(),
      ...data,
    }));

    faqCreate = jest.fn(({ data }: { data: Omit<FaqRecord, 'id'> }) => {
      const created = { id: secondEntryId, ...data };
      entries.push(created);
      return created;
    });
    faqUpdate = jest.fn(
      ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<FaqRecord>;
      }) => {
        const index = entries.findIndex((entry) => entry.id === where.id);
        entries[index] = { ...entries[index], ...data };
        return entries[index];
      },
    );

    const matchesWhere = (
      entry: FaqRecord,
      where?: {
        status?: FaqRecord['status'];
        category?: { equals: string };
      },
    ) => {
      if (where?.status && entry.status !== where.status) return false;
      if (
        where?.category?.equals &&
        entry.category?.toLowerCase() !== where.category.equals.toLowerCase()
      ) {
        return false;
      }
      return true;
    };

    const faqDelegate = {
      create: faqCreate,
      findUnique: jest.fn(
        ({ where }: { where: { id: string } }) =>
          entries.find((entry) => entry.id === where.id) ?? null,
      ),
      findMany: jest.fn(
        ({
          where,
          skip,
          take,
        }: {
          where?: Parameters<typeof matchesWhere>[1];
          skip: number;
          take: number;
        }) =>
          entries
            .filter((entry) => matchesWhere(entry, where))
            .sort(
              (left, right) =>
                right.updated_at.getTime() - left.updated_at.getTime() ||
                left.id.localeCompare(right.id),
            )
            .slice(skip, skip + take),
      ),
      count: jest.fn(
        ({ where }: { where?: Parameters<typeof matchesWhere>[1] }) =>
          entries.filter((entry) => matchesWhere(entry, where)).length,
      ),
      update: faqUpdate,
    };

    const prismaMock = {
      user_account: {
        findUnique: jest.fn(
          ({ where }: { where: { auth_user_id: string } }) => {
            if (where.auth_user_id === curatorAuthId) {
              return {
                id: curatorAccountId,
                role: 'CURATOR',
                status: 'ACTIVE',
              };
            }
            if (where.auth_user_id === developerAuthId) {
              return {
                id: '66666666-6666-4666-8666-666666666666',
                role: 'DEVELOPER',
                status: 'ACTIVE',
              };
            }
            return null;
          },
        ),
      },
      faq_entry: faqDelegate,
      audit_log: { create: auditCreate },
      $transaction: jest.fn(
        (
          input: Array<Promise<unknown>> | ((transaction: unknown) => unknown),
        ) =>
          Array.isArray(input)
            ? Promise.all(input)
            : Promise.resolve(input(prismaMock)),
      ),
    };

    const getUser = jest.fn((token: string) => {
      const id =
        token === curatorToken
          ? curatorAuthId
          : token === developerToken
            ? developerAuthId
            : null;
      return id
        ? {
            data: { user: { id, email: 'faq@example.com', app_metadata: {} } },
            error: null,
          }
        : { data: { user: null }, error: { message: 'Invalid token' } };
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideProvider(SUPABASE_CLIENT)
      .useValue({ auth: { getUser } })
      .compile();

    app = moduleFixture.createNestApplication();
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
  });

  it('requires an authenticated active Curator', async () => {
    await request(app.getHttpServer()).get('/faq/entries').expect(401);
    await request(app.getHttpServer())
      .get('/faq/entries')
      .set('Authorization', `Bearer ${developerToken}`)
      .expect(403);
  });

  it('strictly validates bodies, IDs, status, and pagination', async () => {
    await request(app.getHttpServer())
      .post('/faq/entries')
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({ question: 'Question?', answer: 'Answer.', status: 'ACTIVE' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/faq/entries')
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({ question: '   ', answer: 'Answer.' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/faq/entries')
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({ question: 'Question?', answer: 'Answer.', keywords: [''] })
      .expect(400);
    await request(app.getHttpServer())
      .post('/faq/entries')
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({
        question: 'Question?',
        answer: 'Answer.',
        alternativeWording: null,
      })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/faq/entries/${entryId}`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({ answer: null })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/faq/entries/${entryId}`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({ keywords: null })
      .expect(400);
    await request(app.getHttpServer())
      .get('/faq/entries?status=PUBLISHED')
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(400);
    await request(app.getHttpServer())
      .get('/faq/entries?page=0&limit=101')
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(400);
    await request(app.getHttpServer())
      .get('/faq/entries?unknown=true')
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(400);
    await request(app.getHttpServer())
      .get('/faq/entries/not-a-uuid')
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(400);
  });

  it('creates normalized inactive knowledge with curator attribution and audit', async () => {
    const response = await request(app.getHttpServer())
      .post('/faq/entries')
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({
        question: '  Where is the museum?  ',
        answer: '  See the approved directions.  ',
        alternativeWording: [
          ' Where are you located? ',
          'where   are you located?',
        ],
        keywords: [' location ', 'LOCATION', ' museum '],
        category: ' Location ',
      })
      .expect(201);

    expect(response.body).toMatchObject({
      id: secondEntryId,
      question: 'Where is the museum?',
      answer: 'See the approved directions.',
      alternativeWording: ['Where are you located?'],
      keywords: ['location', 'museum'],
      category: 'Location',
      status: 'INACTIVE',
      createdBy: curatorAccountId,
      updatedBy: curatorAccountId,
    });
    expect(response.body).not.toHaveProperty('created_by');
    expect(faqCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'INACTIVE',
        created_by: curatorAccountId,
        updated_by: curatorAccountId,
      }),
    });
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        user_id: curatorAccountId,
        affected_record_id: secondEntryId,
        action: 'CREATE_FAQ_ENTRY',
        module: 'faq',
        status: 'SUCCESS',
      }),
    });
  });

  it('lists and retrieves management knowledge with filters and pagination', async () => {
    entries.push(
      initialRecord({
        id: secondEntryId,
        category: 'Collection',
        status: 'ACTIVE',
        updated_at: new Date('2026-01-02T00:00:00.000Z'),
      }),
    );

    const list = await request(app.getHttpServer())
      .get('/faq/entries?status=ACTIVE&category=collection&page=1&limit=10')
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(200);
    expect(list.body).toMatchObject({ total: 1, page: 1, limit: 10 });
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].id).toBe(secondEntryId);

    await request(app.getHttpServer())
      .get(`/faq/entries/${entryId}`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          id: entryId,
          status: 'INACTIVE',
        });
      });
  });

  it('updates approved fields, rejects a no-op, and records changed fields', async () => {
    await request(app.getHttpServer())
      .patch(`/faq/entries/${entryId}`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({ answer: '  Updated approved answer. ', category: null })
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          answer: 'Updated approved answer.',
          category: null,
          updatedBy: curatorAccountId,
        });
      });

    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'UPDATE_FAQ_ENTRY',
        details: { fields: ['answer', 'category'] },
      }),
    });

    await request(app.getHttpServer())
      .patch(`/faq/entries/${entryId}`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({ answer: 'Updated approved answer.', category: null })
      .expect(400);
  });

  it('supports explicit lifecycle actions and keeps archived records immutable', async () => {
    await request(app.getHttpServer())
      .patch(`/faq/entries/${entryId}/activate`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(200)
      .expect((response) => expect(response.body.status).toBe('ACTIVE'));
    await request(app.getHttpServer())
      .patch(`/faq/entries/${entryId}/deactivate`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(200)
      .expect((response) => expect(response.body.status).toBe('INACTIVE'));
    await request(app.getHttpServer())
      .patch(`/faq/entries/${entryId}/archive`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(200)
      .expect((response) => expect(response.body.status).toBe('ARCHIVED'));

    await request(app.getHttpServer())
      .get(`/faq/entries/${entryId}`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/faq/entries/${entryId}`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({ answer: 'This must not be accepted.' })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/faq/entries/${entryId}/activate`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(400);
    await request(app.getHttpServer())
      .delete(`/faq/entries/${entryId}`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(404);

    expect(faqUpdate).toHaveBeenCalledTimes(3);
    expect(auditCreate).toHaveBeenCalledTimes(3);
  });
});
