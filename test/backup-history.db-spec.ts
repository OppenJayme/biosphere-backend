/** Opt-in synthetic history, real PostgreSQL/HTTP; no backup operation or AppModule. */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DisposableFaqPostgres } from './support/disposable-faq-postgres';
import {
  createBackupHistoryDatabaseApp,
  seedBackupHistoryDatabase,
} from './support/backup-history-database-app';

const OLDEST = '44444444-4444-4444-8444-444444444441';
const FAILED = '44444444-4444-4444-8444-444444444442';
const AUTOMATED = '44444444-4444-4444-8444-444444444443';
const LATEST = '44444444-4444-4444-8444-444444444444';
type HistoryPage = {
  items: Array<{ id: string }>;
  total: number;
  page: number;
  limit: number;
};

describe('Backup history on owned disposable PostgreSQL (BAK-001)', () => {
  let database: DisposableFaqPostgres;
  let app: INestApplication<App>;
  beforeAll(async () => {
    database = await DisposableFaqPostgres.start('backup-history');
    await database.createRole('service_role');
    await seedBackupHistoryDatabase(database.admin);
    app = await createBackupHistoryDatabaseApp(database.url('service_role'));
  });
  afterAll(async () => {
    try {
      await app?.close();
    } finally {
      await database?.close();
    }
  });

  async function list(
    query: Record<string, string | number> = {},
  ): Promise<HistoryPage> {
    const result = await request(app.getHttpServer())
      .get('/backups/history')
      .query(query)
      .auth('curator-fixture', { type: 'bearer' })
      .expect(200);
    return result.body as HistoryPage;
  }

  it('retrieves stored history in stable newest-first order without exposing private paths', async () => {
    const page = await list();
    expect(page.total).toBe(4);
    expect(page.items.map((entry) => entry.id)).toEqual([
      LATEST,
      AUTOMATED,
      FAILED,
      OLDEST,
    ]);
    expect(JSON.stringify(page)).not.toMatch(
      /storage_path|storagePath|private\/synthetic/,
    );
    for (const entry of page.items)
      expect(Object.keys(entry).sort()).toEqual([
        'artifactAvailable',
        'backupType',
        'completedAt',
        'creator',
        'id',
        'startedAt',
        'status',
      ]);
  });

  it.each<{ label: string; query: Record<string, string>; expected: string[] }>(
    [
      {
        label: 'status',
        query: { status: 'COMPLETED' },
        expected: [AUTOMATED, OLDEST],
      },
      {
        label: 'case-insensitive type',
        query: { backupType: 'scheduled_full' },
        expected: [FAILED, OLDEST],
      },
      {
        label: 'creator',
        query: { creatorId: '11111111-1111-4111-8111-111111111111' },
        expected: [FAILED, OLDEST],
      },
      {
        label: 'creator-name search',
        query: { search: 'operator' },
        expected: [LATEST],
      },
      {
        label: 'exact UUID search',
        query: { search: AUTOMATED },
        expected: [AUTOMATED],
      },
    ],
  )('filters stored rows by $label', async ({ query, expected }) => {
    const page = await list(query);
    expect(page.items.map((entry) => entry.id)).toEqual(expected);
    expect(page.total).toBe(expected.length);
  });

  it('combines filters instead of returning records that satisfy only one', async () => {
    const page = await list({
      status: 'COMPLETED',
      backupType: 'scheduled_full',
      creatorId: '11111111-1111-4111-8111-111111111111',
      search: 'scheduled',
      from: '2026-01-02T00:00:00Z',
      to: '2026-01-02T00:00:00Z',
    });
    expect(page.total).toBe(1);
    expect(page.items.map((entry) => entry.id)).toEqual([OLDEST]);
  });

  it('uses inclusive started-at bounds and equivalent timezone offsets', async () => {
    for (const bound of ['2026-01-03T00:00:00Z', '2026-01-03T08:00:00+08:00']) {
      const page = await list({ from: bound, to: bound });
      expect(page.total).toBe(2);
      expect(page.items.map((entry) => entry.id)).toEqual([AUTOMATED, FAILED]);
    }
    expect(
      (
        await list({
          from: '2026-01-03T00:00:00.001Z',
          to: '2026-01-03T23:59:59Z',
        })
      ).total,
    ).toBe(0);
  });

  it('paginates tied timestamps without overlaps and retains the filtered total', async () => {
    const first = await list({ page: 1, limit: 2 });
    const second = await list({ page: 2, limit: 2 });
    const beyond = await list({ page: 3, limit: 2 });
    expect(first).toMatchObject({ total: 4, page: 1, limit: 2 });
    expect(second).toMatchObject({ total: 4, page: 2, limit: 2 });
    expect(first.items.map((entry) => entry.id)).toEqual([LATEST, AUTOMATED]);
    expect(second.items.map((entry) => entry.id)).toEqual([FAILED, OLDEST]);
    expect(beyond).toEqual({ total: 4, page: 3, limit: 2, items: [] });
  });

  it('reads nullable creators, statuses and recorded-artifact flags without private paths in details', async () => {
    const cases = [
      {
        id: OLDEST,
        creator: {
          id: '11111111-1111-4111-8111-111111111111',
          fullName: 'Synthetic curator',
          role: 'CURATOR',
        },
        artifactAvailable: true,
        status: 'COMPLETED',
        completedAt: '2026-01-02T00:01:00.000Z',
      },
      { id: FAILED, artifactAvailable: false, status: 'FAILED' },
      {
        id: AUTOMATED,
        creator: null,
        artifactAvailable: true,
        status: 'COMPLETED',
      },
      {
        id: LATEST,
        artifactAvailable: false,
        status: 'IN_PROGRESS',
        completedAt: null,
      },
    ];
    for (const expected of cases) {
      await request(app.getHttpServer())
        .get(`/backups/history/${expected.id}`)
        .auth('curator-fixture', { type: 'bearer' })
        .expect(200)
        .expect(({ body }) => {
          const detail = body as Record<string, unknown>;
          expect(detail).toMatchObject(expected);
          expect(Object.keys(detail).sort()).toEqual([
            'artifactAvailable',
            'backupType',
            'completedAt',
            'creator',
            'id',
            'startedAt',
            'status',
          ]);
          expect(JSON.stringify(detail)).not.toContain('private/synthetic');
        });
    }
  });

  it.each([
    { token: null, status: 401 },
    { token: 'developer-fixture', status: 403 },
  ])(
    'denies list/detail access for $token with $status',
    async ({ token, status }) => {
      for (const path of ['/backups/history', `/backups/history/${OLDEST}`]) {
        const pending = request(app.getHttpServer()).get(path);
        if (token) pending.auth(token, { type: 'bearer' });
        await pending.expect(status).expect(({ body }) => {
          expect(body).not.toHaveProperty('items');
          expect(body).not.toHaveProperty('artifactAvailable');
          expect(JSON.stringify(body)).not.toMatch(
            /private\/synthetic|SCHEDULED_FULL/,
          );
        });
      }
      if (token)
        await request(app.getHttpServer())
          .get('/audit-logs')
          .query({ action: 'ACCESS_DENIED', result: 'DENIED' })
          .auth('curator-fixture', { type: 'bearer' })
          .expect(200)
          .expect(({ body }) => {
            expect(body).toMatchObject({
              total: 2,
              items: expect.arrayContaining([
                expect.objectContaining({
                  result: 'DENIED',
                  actor: expect.objectContaining({
                    id: '22222222-2222-4222-8222-222222222222',
                  }),
                  details: expect.objectContaining({
                    path: '/backups/history',
                  }),
                }),
                expect.objectContaining({
                  result: 'DENIED',
                  details: expect.objectContaining({
                    path: `/backups/history/${OLDEST}`,
                  }),
                }),
              ]),
            });
          });
    },
  );

  it('returns 404 for an unknown history ID without substituting another entry', async () => {
    await request(app.getHttpServer())
      .get('/backups/history/99999999-9999-4999-8999-999999999999')
      .auth('curator-fixture', { type: 'bearer' })
      .expect(404);
  });

  it('exposes no ordinary history mutation routes and leaves stored metadata unchanged', async () => {
    const baseline = await list();
    await request(app.getHttpServer())
      .post('/backups/history')
      .auth('curator-fixture', { type: 'bearer' })
      .send({ backupType: 'TEST - Forbidden' })
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/backups/history/${OLDEST}`)
      .auth('curator-fixture', { type: 'bearer' })
      .send({ status: 'FAILED' })
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/backups/history/${OLDEST}`)
      .auth('curator-fixture', { type: 'bearer' })
      .expect(404);
    expect(await list()).toEqual(baseline);
  });
});
