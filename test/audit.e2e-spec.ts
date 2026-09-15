/* eslint-disable @typescript-eslint/no-unsafe-member-access -- Supertest response bodies are typed as any. */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SUPABASE_CLIENT } from '../src/supabase/supabase.constants';

describe('Audit logs (e2e)', () => {
  const curatorToken = 'curator-audit-token';
  const developerToken = 'developer-audit-token';
  const curatorAuthId = '11111111-1111-4111-8111-111111111111';
  const curatorAccountId = '22222222-2222-4222-8222-222222222222';
  const developerAuthId = '33333333-3333-4333-8333-333333333333';
  const logId = '44444444-4444-4444-8444-444444444444';
  const affectedRecordId = '55555555-5555-4555-8555-555555555555';
  const testDate = new Date('2026-01-02T03:04:05.000Z');

  let app: INestApplication<App>;
  let auditFindMany: jest.Mock;
  let auditFindUnique: jest.Mock;

  const auditRecord = (overrides: Record<string, unknown> = {}) => ({
    id: logId,
    user_id: curatorAccountId,
    affected_record_id: affectedRecordId,
    affected_record_type: 'specimen',
    action: 'UPDATE_SPECIMEN',
    module: 'specimens',
    details: { fields: ['scientific_name'] },
    status: 'SUCCESS',
    created_at: testDate,
    user_account: {
      id: curatorAccountId,
      full_name: 'Audit Curator',
      role: 'CURATOR',
    },
    ...overrides,
  });

  beforeEach(async () => {
    auditFindMany = jest.fn(() => [auditRecord()]);
    auditFindUnique = jest.fn(({ where }: { where: { id: string } }) =>
      where.id === logId ? auditRecord() : null,
    );

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
      audit_log: {
        findMany: auditFindMany,
        findUnique: auditFindUnique,
        count: jest.fn(() => 1),
      },
      $transaction: jest.fn((operations: Promise<unknown>[]) =>
        Promise.all(operations),
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
            data: {
              user: { id, email: 'audit@example.com', app_metadata: {} },
            },
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
    await request(app.getHttpServer()).get('/audit-logs').expect(401);
    await request(app.getHttpServer())
      .get('/audit-logs')
      .set('Authorization', `Bearer ${developerToken}`)
      .expect(403);
  });

  it('strictly validates filters, timestamps, pagination, and identifiers', async () => {
    const invalidQueries = [
      'result=UNKNOWN',
      'actorId=not-a-uuid',
      'from=not-a-date',
      'from=2026-01-01T00%3A00%3A00',
      'page=0',
      'limit=101',
      'unknown=true',
      'from=2026-02-01T00%3A00%3A00.000Z&to=2026-01-01T00%3A00%3A00.000Z',
    ];
    for (const query of invalidQueries) {
      await request(app.getHttpServer())
        .get(`/audit-logs?${query}`)
        .set('Authorization', `Bearer ${curatorToken}`)
        .expect(400);
    }

    await request(app.getHttpServer())
      .get('/audit-logs/not-a-uuid')
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(400);
  });

  it('returns protected paginated history using only schema-backed fields', async () => {
    await request(app.getHttpServer())
      .get('/audit-logs')
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.page).toBe(1);
        expect(response.body.limit).toBe(50);
      });

    const response = await request(app.getHttpServer())
      .get(
        '/audit-logs?search=specimen&result=SUCCESS&module=SPECIMENS&page=1&limit=25',
      )
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(200);

    expect(response.body).toEqual({
      items: [
        {
          id: logId,
          actor: {
            id: curatorAccountId,
            fullName: 'Audit Curator',
            role: 'CURATOR',
          },
          affectedRecordId,
          affectedRecordType: 'specimen',
          action: 'UPDATE_SPECIMEN',
          module: 'specimens',
          details: { fields: ['scientific_name'] },
          result: 'SUCCESS',
          createdAt: testDate.toISOString(),
        },
      ],
      total: 1,
      page: 1,
      limit: 25,
    });
    expect(response.body.items[0]).not.toHaveProperty('ipAddress');
    expect(response.body.items[0]).not.toHaveProperty('device');
    expect(response.body.items[0]).not.toHaveProperty('timeline');
    expect(auditFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 25 }),
    );
  });

  it('retrieves detailed entries and preserves nullable system actors', async () => {
    await request(app.getHttpServer())
      .get(`/audit-logs/${logId}`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.id).toBe(logId);
      });

    auditFindUnique.mockReturnValueOnce(
      auditRecord({ user_id: null, user_account: null }),
    );
    await request(app.getHttpServer())
      .get(`/audit-logs/${logId}`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.actor).toBeNull();
      });

    await request(app.getHttpServer())
      .get('/audit-logs/77777777-7777-4777-8777-777777777777')
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(404);
  });

  it('exposes no routine mutation endpoints for protected audit records', async () => {
    await request(app.getHttpServer())
      .post('/audit-logs')
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({ action: 'FORGED_EVENT' })
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/audit-logs/${logId}`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({ result: 'SUCCESS' })
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/audit-logs/${logId}`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(404);
  });
});
