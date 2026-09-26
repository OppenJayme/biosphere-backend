/** End-to-end coverage for authorization, validation, and the backup metadata boundary. */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SUPABASE_CLIENT } from '../src/supabase/supabase.constants';

describe('Backup history (e2e)', () => {
  const curatorToken = 'curator-backup-token';
  const developerToken = 'developer-backup-token';
  const curatorAuthId = '11111111-1111-4111-8111-111111111111';
  const curatorAccountId = '22222222-2222-4222-8222-222222222222';
  const developerAuthId = '33333333-3333-4333-8333-333333333333';
  const historyId = '44444444-4444-4444-8444-444444444444';
  const testDate = new Date('2026-01-02T03:04:05.000Z');

  let app: INestApplication<App>;
  let historyFindMany: jest.Mock;
  let historyFindUnique: jest.Mock;

  const historyRecord = (overrides: Record<string, unknown> = {}) => ({
    id: historyId,
    created_by: curatorAccountId,
    backup_type: 'SCHEDULED_FULL',
    storage_path: 'private/backups/example.dump',
    status: 'COMPLETED',
    started_at: testDate,
    completed_at: new Date('2026-01-02T03:05:05.000Z'),
    user_account: {
      id: curatorAccountId,
      full_name: 'Backup Curator',
      role: 'CURATOR',
    },
    ...overrides,
  });

  beforeEach(async () => {
    historyFindMany = jest.fn(() => [historyRecord()]);
    historyFindUnique = jest.fn(({ where }: { where: { id: string } }) =>
      where.id === historyId ? historyRecord() : null,
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
      backup_history: {
        findMany: historyFindMany,
        findUnique: historyFindUnique,
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
              user: { id, email: 'backup@example.com', app_metadata: {} },
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
    await request(app.getHttpServer()).get('/backups/history').expect(401);
    await request(app.getHttpServer())
      .get('/backups/history')
      .set('Authorization', `Bearer ${developerToken}`)
      .expect(403);
  });

  it('strictly validates filters, timestamps, pages, and identifiers', async () => {
    const invalidQueries = [
      'status=UNKNOWN',
      'creatorId=not-a-uuid',
      'from=not-a-date',
      'from=2026-01-01T00%3A00%3A00',
      'page=0',
      'limit=101',
      'unknown=true',
      'from=2026-02-01T00%3A00%3A00.000Z&to=2026-01-01T00%3A00%3A00.000Z',
    ];
    for (const query of invalidQueries) {
      await request(app.getHttpServer())
        .get(`/backups/history?${query}`)
        .set('Authorization', `Bearer ${curatorToken}`)
        .expect(400);
    }

    await request(app.getHttpServer())
      .get('/backups/history/not-a-uuid')
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(400);
  });

  it('returns bounded metadata without revealing internal storage paths', async () => {
    const response = await request(app.getHttpServer())
      .get('/backups/history?search=scheduled&status=COMPLETED&page=1&limit=25')
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(200);

    expect(response.body).toEqual({
      items: [
        {
          id: historyId,
          creator: {
            id: curatorAccountId,
            fullName: 'Backup Curator',
            role: 'CURATOR',
          },
          backupType: 'SCHEDULED_FULL',
          status: 'COMPLETED',
          artifactAvailable: true,
          startedAt: testDate.toISOString(),
          completedAt: '2026-01-02T03:05:05.000Z',
        },
      ],
      total: 1,
      page: 1,
      limit: 25,
    });
    expect(response.body.items[0]).not.toHaveProperty('storagePath');
    expect(historyFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 25 }),
    );
  });

  it('retrieves details, preserves system creators, and exposes no mutations', async () => {
    await request(app.getHttpServer())
      .get(`/backups/history/${historyId}`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(200);

    historyFindUnique.mockReturnValueOnce(
      historyRecord({ created_by: null, user_account: null }),
    );
    await request(app.getHttpServer())
      .get(`/backups/history/${historyId}`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.creator).toBeNull();
      });

    await request(app.getHttpServer())
      .get('/backups/history/77777777-7777-4777-8777-777777777777')
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .post('/backups/history')
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({ status: 'COMPLETED' })
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/backups/history/${historyId}`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({ status: 'COMPLETED' })
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/backups/history/${historyId}`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(404);
  });
});
