/** Opt-in real PostgreSQL/HTTP checks; never imports AppModule or application .env. */
import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';
import request from 'supertest';
import { DisposableFaqPostgres } from './support/disposable-faq-postgres';
import {
  createCollectionsDatabaseApp,
  seedCollectionsDatabase,
  COLLECTION_UNIQUENESS_SQL,
} from './support/collections-database-app';

type CollectionRecord = { id: string; collectionName: string };
type CollectionPage = { items: CollectionRecord[]; total: number };
type AuditPage = {
  items: Array<{ action: string; affectedRecordId: string; details: unknown }>;
  total: number;
};

describe('Collections on owned disposable PostgreSQL (DEF-001)', () => {
  let database: DisposableFaqPostgres;
  let app: INestApplication<App>;

  beforeAll(async () => {
    database = await DisposableFaqPostgres.start('collections');
    await database.createRole('service_role');
    await seedCollectionsDatabase(database.admin);
    app = await createCollectionsDatabaseApp(database.url('service_role'));
  });
  afterAll(async () => {
    try {
      await app?.close();
    } finally {
      await database?.close();
    }
  });
  beforeEach(async () => {
    // Only the fresh, owned fixture database; users/roles remain synthetic.
    await database.admin.query('TRUNCATE collection, audit_log');
  });

  async function create(collectionName: string): Promise<CollectionRecord> {
    const response = await request(app.getHttpServer())
      .post('/collections')
      .auth('curator-fixture', { type: 'bearer' })
      .send({ collectionName })
      .expect(201);
    return response.body as CollectionRecord;
  }

  async function collections(): Promise<CollectionPage> {
    const response = await request(app.getHttpServer())
      .get('/collections')
      .auth('curator-fixture', { type: 'bearer' })
      .expect(200);
    return response.body as CollectionPage;
  }

  async function audits(action?: string): Promise<AuditPage> {
    const response = await request(app.getHttpServer())
      .get('/audit-logs')
      .query({
        affectedRecordType: 'collection',
        ...(action ? { action } : {}),
      })
      .auth('curator-fixture', { type: 'bearer' })
      .expect(200);
    return response.body as AuditPage;
  }

  it('creates a trimmed collection that is retrievable through the real API', async () => {
    const created = await request(app.getHttpServer())
      .post('/collections')
      .auth('curator-fixture', { type: 'bearer' })
      .send({ collectionName: '  TEST - Collection database  ' })
      .expect(201);
    const body = created.body as { id: string; collectionName: string };
    expect(body.collectionName).toBe('TEST - Collection database');
    await request(app.getHttpServer())
      .get(`/collections/${body.id}`)
      .auth('curator-fixture', { type: 'bearer' })
      .expect(200)
      .expect(({ body: saved }) => {
        expect(saved).toMatchObject(body);
      });
    expect(await audits()).toMatchObject({
      total: 1,
      items: [
        {
          action: 'CREATE_COLLECTION',
          affectedRecordId: body.id,
          actor: {
            id: '11111111-1111-4111-8111-111111111111',
            role: 'CURATOR',
          },
          result: 'SUCCESS',
          details: { collectionName: 'TEST - Collection database' },
        },
      ],
    });
  });

  it.each(['TEST - Collision', 'test - collision', '  TEST - COLLISION  '])(
    'rejects a normalized create collision without another row or success audit: %s',
    async (name) => {
      const first = await create('TEST - Collision');
      await request(app.getHttpServer())
        .post('/collections')
        .auth('curator-fixture', { type: 'bearer' })
        .send({ collectionName: name })
        .expect(409)
        .expect(({ body }) => {
          expect(body).toMatchObject({ code: 'COLLECTION_NAME_TAKEN' });
        });
      expect(await collections()).toMatchObject({ total: 1, items: [first] });
      expect((await audits()).total).toBe(1);
    },
  );

  it('renames a collection, retaining identity and recording only the accepted change', async () => {
    const original = await create('TEST - Before rename');
    await request(app.getHttpServer())
      .patch(`/collections/${original.id}`)
      .auth('curator-fixture', { type: 'bearer' })
      .send({ collectionName: '  TEST - After rename  ' })
      .expect(200);
    expect(await collections()).toMatchObject({
      total: 1,
      items: [{ id: original.id, collectionName: 'TEST - After rename' }],
    });
    expect(await audits('UPDATE_COLLECTION')).toMatchObject({
      total: 1,
      items: [
        {
          affectedRecordId: original.id,
          details: {
            previousName: 'TEST - Before rename',
            newName: 'TEST - After rename',
          },
        },
      ],
    });
  });

  it('rejects a colliding rename without changing either record or adding an audit', async () => {
    const first = await create('TEST - First');
    const second = await create('TEST - Second');
    await request(app.getHttpServer())
      .patch(`/collections/${second.id}`)
      .auth('curator-fixture', { type: 'bearer' })
      .send({ collectionName: '  test - first  ' })
      .expect(409);
    expect(await collections()).toMatchObject({
      total: 2,
      items: [first, second],
    });
    expect((await audits()).total).toBe(2);
    expect((await audits('UPDATE_COLLECTION')).total).toBe(0);
  });

  it('rejects an unchanged trimmed rename without another audit', async () => {
    const first = await create('TEST - Unchanged');
    await request(app.getHttpServer())
      .patch(`/collections/${first.id}`)
      .auth('curator-fixture', { type: 'bearer' })
      .send({ collectionName: ' TEST - Unchanged ' })
      .expect(400);
    expect(await collections()).toMatchObject({ total: 1, items: [first] });
    expect((await audits()).total).toBe(1);
  });

  it('accepts exactly one of simultaneous normalized create requests', async () => {
    const results = await Promise.all(
      ['TEST - Race', 'test - race', ' TEST - RACE '].map((name) =>
        request(app.getHttpServer())
          .post('/collections')
          .auth('curator-fixture', { type: 'bearer' })
          .send({ collectionName: name }),
      ),
    );
    expect(results.map((result) => result.status).sort()).toEqual([
      201, 409, 409,
    ]);
    const winner = results.find((result) => result.status === 201)!
      .body as CollectionRecord;
    expect(await collections()).toMatchObject({ total: 1, items: [winner] });
    expect(await audits()).toMatchObject({
      total: 1,
      items: [{ action: 'CREATE_COLLECTION', affectedRecordId: winner.id }],
    });
  });

  it('accepts exactly one rename when two records contend for the same normalized name', async () => {
    const first = await create('TEST - Race source A');
    const second = await create('TEST - Race source B');
    const results = await Promise.all(
      [first, second].map((entry) =>
        request(app.getHttpServer())
          .patch(`/collections/${entry.id}`)
          .auth('curator-fixture', { type: 'bearer' })
          .send({ collectionName: 'TEST - Rename winner' }),
      ),
    );
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    const loser = results[0].status === 409 ? first : second;
    const page = await collections();
    expect(page.total).toBe(2);
    expect(page.items).toContainEqual(expect.objectContaining(loser));
    expect(
      page.items.filter(
        (entry) => entry.collectionName === 'TEST - Rename winner',
      ),
    ).toHaveLength(1);
    expect((await audits()).total).toBe(3);
    expect((await audits('UPDATE_COLLECTION')).total).toBe(1);
  });

  it.each([
    { token: null, status: 401 },
    { token: 'developer-fixture', status: 403 },
  ])(
    'blocks collection writes with caller $token ($status)',
    async ({ token, status }) => {
      const pending = request(app.getHttpServer())
        .post('/collections')
        .send({ collectionName: 'TEST - Unauthorized' });
      if (token) pending.auth(token, { type: 'bearer' });
      await pending.expect(status);
      expect(await collections()).toMatchObject({ total: 0, items: [] });
      expect((await audits()).total).toBe(0);
      if (token) {
        await request(app.getHttpServer())
          .get('/audit-logs')
          .query({ action: 'ACCESS_DENIED', result: 'DENIED' })
          .auth('curator-fixture', { type: 'bearer' })
          .expect(200)
          .expect(({ body }) => {
            expect(body).toMatchObject({
              total: 1,
              items: [
                {
                  action: 'ACCESS_DENIED',
                  result: 'DENIED',
                  actor: { id: '22222222-2222-4222-8222-222222222222' },
                },
              ],
            });
          });
      }
    },
  );

  it('rolls back the collection when its transactional success audit cannot be written', async () => {
    await database.admin.query('REVOKE INSERT ON audit_log FROM service_role');
    try {
      await request(app.getHttpServer())
        .post('/collections')
        .auth('curator-fixture', { type: 'bearer' })
        .send({ collectionName: 'TEST - Audit rollback' })
        .expect(500)
        .expect(({ body }) => {
          expect(body).toEqual({
            statusCode: 500,
            message: 'Internal server error',
          });
        });
      expect(await collections()).toMatchObject({ total: 0, items: [] });
      expect(await audits()).toMatchObject({ total: 0, items: [] });
    } finally {
      await database.admin.query('GRANT INSERT ON audit_log TO service_role');
    }
  });

  it('enforces normalized uniqueness on direct SQL inserts, independently of the HTTP precheck', async () => {
    await database.admin.query(
      "INSERT INTO collection(collection_name) VALUES ('  TEST - SQL Collision  ')",
    );
    await expect(
      database.admin.query(
        "INSERT INTO collection(collection_name) VALUES ('test - sql collision')",
      ),
    ).rejects.toMatchObject({
      code: '23505',
      constraint: 'uq_collection_name',
    });
    expect(
      (await database.admin.query('SELECT collection_name FROM collection'))
        .rows,
    ).toEqual([{ collection_name: '  TEST - SQL Collision  ' }]);
  });

  it('enforces uniqueness on direct SQL updates without changing the losing record', async () => {
    await database.admin.query(
      "INSERT INTO collection(collection_name) VALUES ('TEST - SQL A'), ('TEST - SQL B')",
    );
    await expect(
      database.admin.query(
        "UPDATE collection SET collection_name = ' test - sql a ' WHERE collection_name = 'TEST - SQL B'",
      ),
    ).rejects.toMatchObject({
      code: '23505',
      constraint: 'uq_collection_name',
    });
    expect(
      (
        await database.admin.query(
          'SELECT collection_name FROM collection ORDER BY collection_name',
        )
      ).rows,
    ).toEqual([
      { collection_name: 'TEST - SQL A' },
      { collection_name: 'TEST - SQL B' },
    ]);
  });

  it('refuses legacy duplicates during migration without deleting either existing row', async () => {
    await database.admin.query('BEGIN');
    try {
      await database.admin.query('DROP INDEX uq_collection_name');
      await database.admin.query(
        "INSERT INTO collection(id, collection_name) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'TEST - Legacy'), ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', ' test - legacy ')",
      );
      await database.admin.query('SAVEPOINT before_migration');
      await expect(
        database.admin.query(COLLECTION_UNIQUENESS_SQL),
      ).rejects.toMatchObject({
        code: 'P0001',
        message:
          'Cannot enforce collection-name uniqueness: duplicate names exist.',
      });
      await database.admin.query('ROLLBACK TO SAVEPOINT before_migration');
      expect(
        (
          await database.admin.query(
            'SELECT id, collection_name FROM collection ORDER BY id',
          )
        ).rows,
      ).toEqual([
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          collection_name: 'TEST - Legacy',
        },
        {
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          collection_name: ' test - legacy ',
        },
      ]);
    } finally {
      // Restores the original index and removes only this transaction's fixtures.
      await database.admin.query('ROLLBACK');
    }
  });

  it('allows one of two simultaneous direct SQL inserts using separate connections', async () => {
    const left = await database.connect();
    const right = await database.connect();
    const results = await Promise.allSettled([
      left.query(
        "INSERT INTO collection(collection_name) VALUES ('TEST - SQL Race')",
      ),
      right.query(
        "INSERT INTO collection(collection_name) VALUES (' test - sql race ')",
      ),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const rejected = results.find(
      (result) => result.status === 'rejected',
    ) as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({
      code: '23505',
      constraint: 'uq_collection_name',
    });
    expect(
      (
        await database.admin.query(
          'SELECT count(*)::int AS count FROM collection',
        )
      ).rows,
    ).toEqual([{ count: 1 }]);
  });
});
