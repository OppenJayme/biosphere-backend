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
        OR?: Array<{
          question?: { contains: string };
          id?: { in: string[] };
        }>;
      },
    ) => {
      if (where?.status && entry.status !== where.status) return false;
      const search = where?.OR?.[0]?.question?.contains.toLowerCase();
      const termMatchIds = where?.OR?.find((clause) => clause.id)?.id?.in;
      if (
        search &&
        ![entry.question, entry.answer, entry.category ?? ''].some((value) =>
          value.toLowerCase().includes(search),
        ) &&
        !termMatchIds?.includes(entry.id)
      ) {
        return false;
      }
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
          skip?: number;
          take?: number;
        }) =>
          entries
            .filter((entry) => matchesWhere(entry, where))
            .sort(
              (left, right) =>
                right.updated_at.getTime() - left.updated_at.getTime() ||
                left.id.localeCompare(right.id),
            )
            .slice(
              skip ?? 0,
              take === undefined ? undefined : (skip ?? 0) + take,
            ),
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
      // Emulates the keyword/alternative-wording ILIKE lookup in FaqService.
      $queryRaw: jest.fn(({ values }: { values: string[] }) => {
        const term = values[0]
          .slice(1, -1)
          .replace(/\\(.)/g, '$1')
          .toLowerCase();
        return entries
          .filter((entry) =>
            [...entry.keywords, ...entry.alternative_wording].some((value) =>
              value.toLowerCase().includes(term),
            ),
          )
          .map((entry) => ({ id: entry.id }));
      }),
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

  // Exercise the API directly: browser maxLength must not be the only protection.
  it('rejects a 101-character category on create without adding or changing entries', async () => {
    const before = await request(app.getHttpServer())
      .get('/faq/entries')
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(200);

    const rejected = await request(app.getHttpServer())
      .post('/faq/entries')
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({
        question: 'Where is the test gallery?',
        answer: 'Use the approved directions.',
        category: 'C'.repeat(101),
      })
      .expect(400);
    expect(rejected.body.message).toContain(
      'category must be shorter than or equal to 100 characters',
    );

    const after = await request(app.getHttpServer())
      .get('/faq/entries')
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(200);
    expect(after.body).toEqual(before.body);
  });

  it('rejects a 101-character category on edit without changing any entry fields', async () => {
    const before = await request(app.getHttpServer())
      .get(`/faq/entries/${entryId}`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(200);

    const rejected = await request(app.getHttpServer())
      .patch(`/faq/entries/${entryId}`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({
        answer: 'This otherwise valid change must not be partially saved.',
        category: 'C'.repeat(101),
      })
      .expect(400);
    expect(rejected.body.message).toContain(
      'category must be shorter than or equal to 100 characters',
    );

    const after = await request(app.getHttpServer())
      .get(`/faq/entries/${entryId}`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(200);
    expect(after.body).toEqual(before.body);
  });

  it('accepts a 100-character category on create and preserves it on readback', async () => {
    const category = 'C'.repeat(100);
    const created = await request(app.getHttpServer())
      .post('/faq/entries')
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({
        question: 'Where is the test gallery?',
        answer: 'Use the approved directions.',
        category,
      })
      .expect(201);
    expect(created.body).toMatchObject({ category, status: 'INACTIVE' });

    const retrieved = await request(app.getHttpServer())
      .get(`/faq/entries/${created.body.id}`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(200);
    expect(retrieved.body).toEqual(created.body);
  });

  it('accepts a 100-character category on edit without changing other knowledge fields', async () => {
    const category = 'C'.repeat(100);
    const before = await request(app.getHttpServer())
      .get(`/faq/entries/${entryId}`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(200);

    const updated = await request(app.getHttpServer())
      .patch(`/faq/entries/${entryId}`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({ category })
      .expect(200);
    expect(updated.body).toEqual({
      ...before.body,
      category,
      updatedAt: expect.any(String),
    });

    const retrieved = await request(app.getHttpServer())
      .get(`/faq/entries/${entryId}`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(200);
    expect(retrieved.body).toEqual(updated.body);
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

  it('searches management knowledge by text', async () => {
    entries.push(
      initialRecord({
        id: secondEntryId,
        question: 'Where can I leave my car?',
        answer: 'Use the lot near the gate.',
        keywords: ['parking'],
        category: 'Facilities',
      }),
    );

    await request(app.getHttpServer())
      .get('/faq/entries?search=PARKING')
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.total).toBe(1);
        expect(response.body.items[0].id).toBe(secondEntryId);
      });
    await request(app.getHttpServer())
      .get('/faq/entries?search=')
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(400);
  });

  describe('public FAQ Assistant', () => {
    beforeEach(() => {
      entries = [
        initialRecord({ status: 'ACTIVE' }),
        initialRecord({
          id: secondEntryId,
          question: 'Is there parking for visitors?',
          answer: 'Inactive draft answer.',
          alternative_wording: [],
          keywords: ['parking'],
          status: 'INACTIVE',
        }),
      ];
    });

    it('asks the visitor to choose when active approved questions have equal strongest matches', async () => {
      entries = [
        initialRecord({
          status: 'ACTIVE',
          question: 'What are weekday visiting hours?',
          alternative_wording: ['When can I visit?'],
        }),
        initialRecord({
          id: secondEntryId,
          status: 'ACTIVE',
          question: 'What are weekend visiting hours?',
          alternative_wording: ['When can I visit?'],
          answer: 'Approved weekend information.',
        }),
      ];
      await request(app.getHttpServer())
        .post('/faq/assistant/ask')
        .send({ question: 'When can I visit?' })
        .expect(200)
        .expect((response) => {
          expect(response.body).toEqual({
            outcome: 'CLARIFICATION_NEEDED',
            answer: null,
            related: [
              {
                id: entryId,
                question: 'What are weekday visiting hours?',
                category: 'Visit',
              },
              {
                id: secondEntryId,
                question: 'What are weekend visiting hours?',
                category: 'Visit',
              },
            ],
            message:
              'More than one approved question matches. Which one did you mean?',
            redirect: null,
            notice:
              'Answers are limited to curator-approved museum information. The assistant cannot approve visits or process campus entry.',
          });
        });
      expect(faqCreate).not.toHaveBeenCalled();
      expect(faqUpdate).not.toHaveBeenCalled();
      expect(auditCreate).not.toHaveBeenCalled();
    });

    it('returns the explicitly selected active answer even when its wording overlaps another entry', async () => {
      entries = [
        initialRecord({
          status: 'ACTIVE',
          alternative_wording: ['When can I visit?'],
        }),
        initialRecord({
          id: secondEntryId,
          status: 'ACTIVE',
          question: 'What are weekend visiting hours?',
          alternative_wording: ['When can I visit?'],
          answer: 'Approved weekend information.',
        }),
      ];
      await request(app.getHttpServer())
        .post('/faq/assistant/ask')
        .send({ question: 'When can I visit?', selectedFaqId: secondEntryId })
        .expect(200)
        .expect((response) => {
          expect(response.body.outcome).toBe('ANSWERED');
          expect(response.body.answer).toEqual({
            id: secondEntryId,
            question: 'What are weekend visiting hours?',
            category: 'Visit',
            answer: 'Approved weekend information.',
          });
        });
      expect(faqCreate).not.toHaveBeenCalled();
      expect(faqUpdate).not.toHaveBeenCalled();
      expect(auditCreate).not.toHaveBeenCalled();
    });

    it('bounds equal non-exact choices to three and excludes inactive/archived matching entries', async () => {
      entries = [
        initialRecord({
          id: entryId,
          status: 'ACTIVE',
          question: 'Weekday visiting hours',
          alternative_wording: [],
          keywords: [],
        }),
        initialRecord({
          id: secondEntryId,
          status: 'ACTIVE',
          question: 'Weekend visiting hours',
          alternative_wording: [],
          keywords: [],
        }),
        initialRecord({
          id: '77777777-7777-4777-8777-777777777777',
          status: 'ACTIVE',
          question: 'Holiday visiting hours',
          alternative_wording: [],
          keywords: [],
        }),
        initialRecord({
          id: '88888888-8888-4888-8888-888888888888',
          status: 'ACTIVE',
          question: 'Evening visiting hours',
          alternative_wording: [],
          keywords: [],
        }),
        initialRecord({
          id: '99999999-9999-4999-8999-999999999999',
          status: 'INACTIVE',
          question: 'Draft visiting hours',
          answer: 'PRIVATE DRAFT ANSWER',
          alternative_wording: ['visiting hours'],
        }),
        initialRecord({
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          status: 'ARCHIVED',
          question: 'Archived visiting hours',
          answer: 'PRIVATE ARCHIVED ANSWER',
          alternative_wording: ['visiting hours'],
        }),
      ];
      for (const reverse of [false, true]) {
        if (reverse) entries.reverse();
        await request(app.getHttpServer())
          .post('/faq/assistant/ask')
          .send({ question: 'visiting hours' })
          .expect(200)
          .expect((response) => {
            expect(response.body.outcome).toBe('CLARIFICATION_NEEDED');
            expect(response.body.answer).toBeNull();
            expect(response.body.related).toEqual([
              {
                id: '88888888-8888-4888-8888-888888888888',
                question: 'Evening visiting hours',
                category: 'Visit',
              },
              {
                id: '77777777-7777-4777-8777-777777777777',
                question: 'Holiday visiting hours',
                category: 'Visit',
              },
              {
                id: entryId,
                question: 'Weekday visiting hours',
                category: 'Visit',
              },
            ]);
            expect(JSON.stringify(response.body)).not.toMatch(
              /PRIVATE|created_by|keywords|score|alternative_wording|status/,
            );
          });
      }
    });

    it('does not reveal or substitute another answer for a stale, inactive, archived or unknown choice', async () => {
      entries = [initialRecord({ status: 'ACTIVE' })];
      for (const status of ['INACTIVE', 'ARCHIVED'] as const) {
        entries.push(
          initialRecord({
            id: secondEntryId,
            status,
            answer: 'PRIVATE SELECTED ANSWER',
          }),
        );
        await request(app.getHttpServer())
          .post('/faq/assistant/ask')
          .send({
            question: 'When is the museum open?',
            selectedFaqId: secondEntryId,
          })
          .expect(200)
          .expect((response) => {
            expect(response.body.outcome).toBe('NO_MATCH');
            expect(response.body.answer).toBeNull();
            expect(response.body.related).toEqual([]);
            expect(JSON.stringify(response.body)).not.toContain(
              'PRIVATE SELECTED ANSWER',
            );
          });
        entries.pop();
      }
      await request(app.getHttpServer())
        .post('/faq/assistant/ask')
        .send({
          question: 'When is the museum open?',
          selectedFaqId: secondEntryId,
        })
        .expect(200)
        .expect((response) => expect(response.body.answer).toBeNull());
      // It was active when offered, but deactivated before the choice arrived.
      entries[0].status = 'INACTIVE';
      await request(app.getHttpServer())
        .post('/faq/assistant/ask')
        .send({ question: 'When is the museum open?', selectedFaqId: entryId })
        .expect(200)
        .expect((response) => expect(response.body.answer).toBeNull());
    });

    it('rejects malformed choice IDs and still rejects injected personal or lifecycle data', async () => {
      for (const selectedFaqId of ['not-a-uuid', '', null, 12, [entryId]]) {
        await request(app.getHttpServer())
          .post('/faq/assistant/ask')
          .send({ question: 'When can I visit?', selectedFaqId })
          .expect(400);
      }
      for (const extra of [{ status: 'ACTIVE' }, { email: 'a@b.com' }]) {
        await request(app.getHttpServer())
          .post('/faq/assistant/ask')
          .send({
            question: 'When can I visit?',
            selectedFaqId: entryId,
            ...extra,
          })
          .expect(400);
      }
      expect(faqCreate).not.toHaveBeenCalled();
      expect(faqUpdate).not.toHaveBeenCalled();
    });

    it('keeps visit-request referral when equally matching FAQs need clarification', async () => {
      entries = [
        initialRecord({
          status: 'ACTIVE',
          alternative_wording: ['Book my visit'],
        }),
        initialRecord({
          id: secondEntryId,
          status: 'ACTIVE',
          question: 'Weekend booking information',
          alternative_wording: ['Book my visit'],
        }),
      ];
      await request(app.getHttpServer())
        .post('/faq/assistant/ask')
        .send({ question: 'Book my visit' })
        .expect(200)
        .expect((response) => {
          expect(response.body.outcome).toBe('CLARIFICATION_NEEDED');
          expect(response.body.answer).toBeNull();
          expect(response.body.redirect).toBe('VISIT_REQUEST');
        });
    });

    it('lists only active suggestions without management fields and without a token', async () => {
      await request(app.getHttpServer())
        .get('/faq/assistant/suggestions')
        .expect(200)
        .expect((response) => {
          expect(response.body.items).toEqual([
            {
              id: entryId,
              question: 'When is the museum open?',
              category: 'Visit',
            },
          ]);
          expect(response.body.notice).toMatch(/curator-approved/);
        });
      await request(app.getHttpServer())
        .get('/faq/assistant/suggestions?limit=99')
        .expect(400);
    });

    it('answers from active knowledge, including alternative wording', async () => {
      for (const question of [
        'When is the museum open?',
        'what are the opening hours',
        'What are the museum opening hours today?',
      ]) {
        await request(app.getHttpServer())
          .post('/faq/assistant/ask')
          .send({ question })
          .expect(200)
          .expect((response) => {
            expect(response.body.outcome).toBe('ANSWERED');
            expect(response.body.answer).toEqual({
              id: entryId,
              question: 'When is the museum open?',
              answer: 'Please refer to the approved visiting hours.',
              category: 'Visit',
            });
            expect(response.body.redirect).toBeNull();
          });
      }
    });

    it('ignores inactive knowledge and falls back to General Inquiry', async () => {
      for (const question of [
        'Is there parking for visitors?',
        'What species of frog is this?',
        'What species are in the museum?',
        'Who founded the museum?',
        'Is the museum hiring?',
        'museum',
      ]) {
        await request(app.getHttpServer())
          .post('/faq/assistant/ask')
          .send({ question })
          .expect(200)
          .expect((response) => {
            expect(response.body.outcome).toBe('NO_MATCH');
            expect(response.body.answer).toBeNull();
            expect(response.body.redirect).toBe('GENERAL_INQUIRY');
            expect(JSON.stringify(response.body)).not.toContain(
              'Inactive draft answer.',
            );
          });
      }
    });

    it('falls back to General Inquiry for ordinary visit questions', async () => {
      for (const question of [
        'What is the visit schedule?',
        'Can I change the tour language?',
      ]) {
        await request(app.getHttpServer())
          .post('/faq/assistant/ask')
          .send({ question })
          .expect(200)
          .expect((response) => {
            expect(response.body.outcome).toBe('NO_MATCH');
            expect(response.body.redirect).toBe('GENERAL_INQUIRY');
          });
      }
    });

    it('never performs visit-request transactions', async () => {
      await request(app.getHttpServer())
        .post('/faq/assistant/ask')
        .send({ question: 'Please approve my visit request' })
        .expect(200)
        .expect((response) => {
          expect(response.body.outcome).toBe('VISIT_REQUEST_REDIRECT');
          expect(response.body.redirect).toBe('VISIT_REQUEST');
        });
      expect(faqCreate).not.toHaveBeenCalled();
      expect(faqUpdate).not.toHaveBeenCalled();
      expect(auditCreate).not.toHaveBeenCalled();
    });

    it('accepts only a bounded question and no personal information', async () => {
      await request(app.getHttpServer())
        .post('/faq/assistant/ask')
        .send({ question: '   ' })
        .expect(400);
      await request(app.getHttpServer())
        .post('/faq/assistant/ask')
        .send({ question: 'x'.repeat(501) })
        .expect(400);
      await request(app.getHttpServer())
        .post('/faq/assistant/ask')
        .send({ question: 'When is the museum open?', email: 'a@b.com' })
        .expect(400);
    });
  });
});
