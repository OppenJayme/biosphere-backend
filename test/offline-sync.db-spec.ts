/** Opt-in real SQL/HTTP verification, never a shared database or browser interruption pilot. */
import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';
import request from 'supertest';
import { performance } from 'node:perf_hooks';
import { DisposableFaqPostgres } from './support/disposable-faq-postgres';
import {
  createOfflineSyncDatabaseApp,
  seedOfflineSyncDatabase,
  OFFLINE_CURATOR,
  OTHER_OFFLINE_CURATOR,
} from './support/offline-sync-database-app';

const DRAFT_ID = '55555555-5555-4555-8555-555555555555';
const COLLECTION_ID = '44444444-4444-4444-8444-444444444444';
const payload = {
  clientDraftId: DRAFT_ID,
  draft: {
    collectionId: COLLECTION_ID,
    commonName: '  TEST offline database specimen  ',
    gender: 'UNKNOWN',
  },
};
type SyncResult = {
  clientDraftId: string;
  alreadySynchronized: boolean;
  specimen: {
    id: string;
    commonName: string;
    createdBy: string;
    status: string;
    publicDisplay: boolean;
  };
};

describe('Offline sync on owned disposable PostgreSQL', () => {
  let database: DisposableFaqPostgres;
  let app: INestApplication<App>;

  beforeAll(async () => {
    database = await DisposableFaqPostgres.start('offline-sync');
    await database.createRole('service_role');
    await seedOfflineSyncDatabase(database.admin);
    app = await createOfflineSyncDatabaseApp(database.url('service_role'));
  });
  afterAll(async () => {
    try {
      await app?.close();
    } finally {
      await database?.close();
    }
  });
  beforeEach(async () => {
    await database.admin.query(
      'TRUNCATE offline_draft_sync, specimen, collection, audit_log',
    );
    await database.admin.query(
      'INSERT INTO collection(id, collection_name) VALUES ($1, $2)',
      [COLLECTION_ID, 'Synthetic offline collection'],
    );
  });

  function sync(body = payload, token = 'curator-fixture') {
    return request(app.getHttpServer())
      .post('/offline-sync/specimen-drafts')
      .auth(token, { type: 'bearer' })
      .send(body);
  }
  async function counts() {
    const result = await database.admin.query(`SELECT
      (SELECT count(*)::int FROM specimen) AS specimens,
      (SELECT count(*)::int FROM offline_draft_sync) AS receipts,
      (SELECT count(*)::int FROM audit_log WHERE action = 'SYNC_OFFLINE_SPECIMEN_DRAFT') AS audits`);
    return result.rows[0] as {
      specimens: number;
      receipts: number;
      audits: number;
    };
  }

  it('atomically persists one attributed specimen, receipt and readable success audit', async () => {
    const response = await sync().expect(200);
    const result = response.body as SyncResult;
    expect(result).toMatchObject({
      clientDraftId: DRAFT_ID,
      alreadySynchronized: false,
      specimen: {
        commonName: 'TEST offline database specimen',
        createdBy: OFFLINE_CURATOR,
        status: 'UNCATALOGED',
        publicDisplay: false,
      },
    });
    expect(await counts()).toEqual({ specimens: 1, receipts: 1, audits: 1 });
    const receipts = await database.admin.query(
      'SELECT created_by, client_draft_id, specimen_id, payload_fingerprint FROM offline_draft_sync',
    );
    expect(receipts.rows).toEqual([
      expect.objectContaining({
        created_by: OFFLINE_CURATOR,
        client_draft_id: DRAFT_ID,
        specimen_id: result.specimen.id,
        payload_fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    ]);
    await request(app.getHttpServer())
      .get('/audit-logs')
      .auth('curator-fixture', { type: 'bearer' })
      .query({ action: 'SYNC_OFFLINE_SPECIMEN_DRAFT' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.total).toBe(1);
        expect(body.items[0]).toMatchObject({
          action: 'SYNC_OFFLINE_SPECIMEN_DRAFT',
          affectedRecordId: result.specimen.id,
          result: 'SUCCESS',
          actor: { id: OFFLINE_CURATOR },
          details: { status: 'UNCATALOGED', clientDraftId: DRAFT_ID },
        });
      });
  });

  it('returns the same specimen on a normalized retry without rewriting its receipt or audit', async () => {
    const first = (await sync().expect(200)).body as SyncResult;
    const before = await database.admin.query(
      'SELECT * FROM offline_draft_sync',
    );
    const retry = (
      await sync({
        ...payload,
        draft: {
          ...payload.draft,
          commonName: 'TEST offline database specimen',
        },
      }).expect(200)
    ).body as SyncResult;

    expect(retry).toMatchObject({
      clientDraftId: DRAFT_ID,
      alreadySynchronized: true,
    });
    expect(retry.specimen).toEqual(first.specimen);
    expect(await counts()).toEqual({ specimens: 1, receipts: 1, audits: 1 });
    expect(
      (await database.admin.query('SELECT * FROM offline_draft_sync')).rows,
    ).toEqual(before.rows);
  });

  it('rejects changed content for an accepted ID and preserves the original record and receipt', async () => {
    const first = (await sync().expect(200)).body as SyncResult;
    const before = await database.admin.query(
      'SELECT * FROM offline_draft_sync',
    );

    await sync({
      ...payload,
      draft: { ...payload.draft, commonName: 'TEST conflicting content' },
    })
      .expect(409)
      .expect(({ body }) => {
        expect(body.message).toContain('different content');
      });

    const unchanged = (await sync().expect(200)).body as SyncResult;
    expect(unchanged.alreadySynchronized).toBe(true);
    expect(unchanged.specimen).toEqual(first.specimen);
    expect(
      (await database.admin.query('SELECT * FROM offline_draft_sync')).rows,
    ).toEqual(before.rows);
    expect(await counts()).toEqual({ specimens: 1, receipts: 1, audits: 1 });
  });

  it('converges two overlapping same-ID transactions on one specimen, receipt and audit', async () => {
    // Owned SQL barrier: prove both transactions reached specimen insertion before releasing either.
    await database.admin.query(`
      CREATE FUNCTION offline_test_insert_barrier() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN PERFORM pg_advisory_xact_lock(196143::bigint); RETURN NEW; END $$;
      CREATE TRIGGER offline_test_insert_barrier BEFORE INSERT ON specimen
        FOR EACH ROW EXECUTE FUNCTION offline_test_insert_barrier();
      SELECT pg_advisory_lock(196143::bigint);
    `);
    const attempts = Promise.allSettled([
      sync().expect(200),
      sync().expect(200),
    ]);
    let barrierHeld = true;
    try {
      const deadline = performance.now() + 3000;
      let contenders = 0;
      while (performance.now() < deadline) {
        const locks = await database.admin
          .query(`SELECT count(*)::int AS contenders FROM pg_locks
          WHERE locktype = 'advisory' AND classid = 0 AND objid = 196143 AND NOT granted`);
        contenders = Number(locks.rows[0].contenders);
        if (contenders === 2) break;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      expect(contenders).toBe(2);
      await database.admin.query('SELECT pg_advisory_unlock(196143::bigint)');
      barrierHeld = false;
      const responses = await attempts;
      const results = responses.map((result) => {
        if (result.status === 'rejected') throw result.reason;
        return result.value.body as SyncResult;
      });
      expect(
        results.map((result) => result.alreadySynchronized).sort(),
      ).toEqual([false, true]);
      expect(results[0].specimen).toEqual(results[1].specimen);
      expect(await counts()).toEqual({ specimens: 1, receipts: 1, audits: 1 });
    } finally {
      if (barrierHeld)
        await database.admin.query('SELECT pg_advisory_unlock(196143::bigint)');
      await attempts;
      await database.admin
        .query(`DROP TRIGGER IF EXISTS offline_test_insert_barrier ON specimen;
        DROP FUNCTION IF EXISTS offline_test_insert_barrier()`);
    }
  });

  it('keeps identical draft IDs independent for two authenticated curators', async () => {
    const first = (await sync().expect(200)).body as SyncResult;
    const second = (await sync(payload, 'other-curator-fixture').expect(200))
      .body as SyncResult;

    expect(first.specimen.createdBy).toBe(OFFLINE_CURATOR);
    expect(second.specimen.createdBy).toBe(OTHER_OFFLINE_CURATOR);
    expect(second.specimen.id).not.toBe(first.specimen.id);
    expect(first.alreadySynchronized).toBe(false);
    expect(second.alreadySynchronized).toBe(false);
    expect(await counts()).toEqual({ specimens: 2, receipts: 2, audits: 2 });
    const receipts = await database.admin.query(
      'SELECT created_by, client_draft_id, specimen_id FROM offline_draft_sync ORDER BY created_by',
    );
    expect(receipts.rows).toEqual([
      {
        created_by: OFFLINE_CURATOR,
        client_draft_id: DRAFT_ID,
        specimen_id: first.specimen.id,
      },
      {
        created_by: OTHER_OFFLINE_CURATOR,
        client_draft_id: DRAFT_ID,
        specimen_id: second.specimen.id,
      },
    ]);
  });

  it('rolls back specimen and receipt when audit insertion is denied, then accepts a safe retry', async () => {
    await database.admin.query('REVOKE INSERT ON audit_log FROM service_role');
    try {
      // Expected 42501 fixture fault; retain the real Nest/Prisma error output.
      await sync().expect(500);
      expect(await counts()).toEqual({ specimens: 0, receipts: 0, audits: 0 });
    } finally {
      await database.admin.query('GRANT INSERT ON audit_log TO service_role');
    }
    const recovered = (await sync().expect(200)).body as SyncResult;
    expect(recovered.alreadySynchronized).toBe(false);
    expect(await counts()).toEqual({ specimens: 1, receipts: 1, audits: 1 });
  });

  it('rolls back both specimen and prior audit when receipt insertion fails, then accepts a safe retry', async () => {
    await database.admin.query(`
      CREATE FUNCTION offline_test_receipt_failure() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Synthetic receipt failure' USING ERRCODE = '23514'; END $$;
      CREATE TRIGGER offline_test_receipt_failure BEFORE INSERT ON offline_draft_sync
        FOR EACH ROW EXECUTE FUNCTION offline_test_receipt_failure();
    `);
    try {
      // Expected 23514 fixture fault after the audit insert, in the same transaction.
      await sync().expect(500);
      expect(await counts()).toEqual({ specimens: 0, receipts: 0, audits: 0 });
    } finally {
      await database.admin
        .query(`DROP TRIGGER IF EXISTS offline_test_receipt_failure ON offline_draft_sync;
        DROP FUNCTION IF EXISTS offline_test_receipt_failure()`);
    }
    const recovered = (await sync().expect(200)).body as SyncResult;
    expect(recovered.alreadySynchronized).toBe(false);
    expect(await counts()).toEqual({ specimens: 1, receipts: 1, audits: 1 });
  });

  it('enforces owner/draft receipt uniqueness in PostgreSQL even for a different specimen', async () => {
    await sync().expect(200);
    const before = await database.admin.query(
      'SELECT * FROM offline_draft_sync',
    );
    // An explicitly unreceipted SQL fixture avoids the separate unique specimen_id constraint.
    const other = await database.admin.query(
      'INSERT INTO specimen(created_by, common_name) VALUES ($1, $2) RETURNING id',
      [OFFLINE_CURATOR, 'Synthetic unreceipted constraint fixture'],
    );
    await expect(
      database.admin.query(
        `INSERT INTO offline_draft_sync
      (created_by, client_draft_id, specimen_id, payload_fingerprint) VALUES ($1, $2, $3, $4)`,
        [OFFLINE_CURATOR, DRAFT_ID, other.rows[0].id, 'a'.repeat(64)],
      ),
    ).rejects.toMatchObject({
      code: '23505',
      constraint: 'offline_draft_sync_created_by_client_draft_id_key',
    });

    expect(
      (await database.admin.query('SELECT * FROM offline_draft_sync')).rows,
    ).toEqual(before.rows);
    expect(await counts()).toEqual({ specimens: 2, receipts: 1, audits: 1 });
  });
});
