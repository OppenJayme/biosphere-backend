/** Explicitly invoked disposable PostgreSQL suite. Never loads AppModule or .env. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DisposableFaqPostgres } from './support/disposable-faq-postgres';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
  createFaqReviewDatabaseApp,
  seedFaqReviewAuthTables,
} from './support/faq-review-database-app';
import { randomUUID } from 'node:crypto';
import { runFaqCleanup } from './support/run-faq-cleanup';

describe('FAQ review migration on owned disposable PostgreSQL', () => {
  let database: DisposableFaqPostgres;
  beforeAll(async () => {
    database = await DisposableFaqPostgres.start();
    await database.createRole('service_role');
    await database.createRole('faq_cleanup');
    await database.admin.query(
      'CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;',
    );
    await seedFaqReviewAuthTables(database.admin);
    await database.admin.query(
      readFileSync(
        resolve(
          __dirname,
          '../prisma/migrations/20261025000000_add_opt_in_faq_review/migration.sql',
        ),
        'utf8',
      ),
    );
    await database.admin.query(`
      GRANT USAGE ON SCHEMA public TO faq_cleanup;
      GRANT SELECT (expires_at) ON faq_review_item TO faq_cleanup;
      GRANT DELETE ON faq_review_item TO faq_cleanup;
      CREATE POLICY faq_cleanup_read_expired ON faq_review_item FOR SELECT TO faq_cleanup USING (expires_at <= CURRENT_TIMESTAMP);
      CREATE POLICY faq_cleanup_delete_expired ON faq_review_item FOR DELETE TO faq_cleanup USING (expires_at <= CURRENT_TIMESTAMP);
    `);
  });
  afterAll(async () => {
    await database?.close();
  });

  it('creates private review tables and rejects invalid rows at the SQL boundary', async () => {
    const result = await database.admin.query<{
      relname: string;
      relrowsecurity: boolean;
    }>(
      "SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('faq_review_item', 'faq_review_receipt') ORDER BY relname",
    );
    expect(result.rows).toEqual([
      { relname: 'faq_review_item', relrowsecurity: true },
      { relname: 'faq_review_receipt', relrowsecurity: true },
    ]);
    await expect(
      database.admin.query(
        "INSERT INTO faq_review_item(question_hash, question, expires_at, repeat_count) VALUES ($1, 'TEST SQL invalid count', now() + interval '1 day', 0)",
        ['a'.repeat(64)],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      database.admin.query(
        "INSERT INTO faq_review_item(question_hash, question, expires_at) VALUES ($1, '   ', now() + interval '1 day')",
        ['a'.repeat(64)],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('denies browser-role reads/writes and RLS still hides rows if SELECT is accidentally granted', async () => {
    await database.admin.query(
      "INSERT INTO faq_review_item(question_hash, question, expires_at) VALUES ($1, 'TEST private RLS text', now() + interval '1 day')",
      ['b'.repeat(64)],
    );
    await database.admin.query(
      'INSERT INTO faq_review_receipt(id, queue_id, question_hash) SELECT $1, id, question_hash FROM faq_review_item WHERE question_hash = $2',
      [randomUUID(), 'b'.repeat(64)],
    );
    for (const role of ['anon', 'authenticated']) {
      await database.admin.query(`SET ROLE ${role}`);
      try {
        for (const table of ['faq_review_item', 'faq_review_receipt']) {
          await expect(
            database.admin.query(`SELECT * FROM ${table}`),
          ).rejects.toMatchObject({ code: '42501' });
          await expect(
            database.admin.query(`DELETE FROM ${table}`),
          ).rejects.toMatchObject({ code: '42501' });
        }
        await expect(
          database.admin.query(
            "UPDATE faq_review_item SET status = 'REVIEWED'",
          ),
        ).rejects.toMatchObject({ code: '42501' });
        await expect(
          database.admin.query(
            "INSERT INTO faq_review_item(question_hash, question, expires_at) VALUES ($1, 'TEST forbidden', now() + interval '1 day')",
            ['c'.repeat(64)],
          ),
        ).rejects.toMatchObject({ code: '42501' });
      } finally {
        await database.admin.query('RESET ROLE');
      }
      await database.admin.query('BEGIN');
      try {
        await database.admin.query(
          `GRANT SELECT ON faq_review_item, faq_review_receipt TO ${role}`,
        );
        await database.admin.query(`SET LOCAL ROLE ${role}`);
        expect(
          (
            await database.admin.query<{ count: string }>(
              'SELECT count(*) FROM faq_review_item',
            )
          ).rows,
        ).toEqual([{ count: '0' }]);
        expect(
          (
            await database.admin.query<{ count: string }>(
              'SELECT count(*) FROM faq_review_receipt',
            )
          ).rows,
        ).toEqual([{ count: '0' }]);
      } finally {
        await database.admin.query('ROLLBACK');
      }
    }
  });

  it('enforces uniqueness, statuses, expiry ordering, length, foreign keys and receipt cascade', async () => {
    const inserted = await database.admin.query<{ id: string }>(
      "INSERT INTO faq_review_item(question_hash, question, expires_at) VALUES ($1, 'TEST SQL constraint source', now() + interval '1 day') RETURNING id",
      ['d'.repeat(64)],
    );
    const id = inserted.rows[0].id;
    await expect(
      database.admin.query(
        "INSERT INTO faq_review_item(question_hash, question, expires_at) VALUES ($1, 'TEST duplicate', now() + interval '1 day')",
        ['d'.repeat(64)],
      ),
    ).rejects.toMatchObject({ code: '23505' });
    await expect(
      database.admin.query(
        "UPDATE faq_review_item SET status = 'ACTIVE' WHERE id = $1",
        [id],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      database.admin.query(
        'UPDATE faq_review_item SET expires_at = first_submitted_at WHERE id = $1',
        [id],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      database.admin.query(
        'UPDATE faq_review_item SET question = $1 WHERE id = $2',
        ['x'.repeat(501), id],
      ),
    ).rejects.toMatchObject({ code: '22001' });
    await expect(
      database.admin.query(
        'INSERT INTO faq_review_receipt(id, queue_id, question_hash) VALUES ($1, $2, $3)',
        [randomUUID(), randomUUID(), 'd'.repeat(64)],
      ),
    ).rejects.toMatchObject({ code: '23503' });
    const receipt = randomUUID();
    await database.admin.query(
      'INSERT INTO faq_review_receipt(id, queue_id, question_hash) VALUES ($1, $2, $3)',
      [receipt, id, 'd'.repeat(64)],
    );
    await database.admin.query('DELETE FROM faq_review_item WHERE id = $1', [
      id,
    ]);
    expect(
      (
        await database.admin.query(
          'SELECT id FROM faq_review_receipt WHERE id = $1',
          [receipt],
        )
      ).rows,
    ).toEqual([]);
  });

  describe('real HTTP with real PostgreSQL and synthetic provider identity', () => {
    let app: INestApplication<App>;
    beforeEach(async () => {
      await database.admin.query('TRUNCATE faq_review_item, audit_log CASCADE');
      app = await createFaqReviewDatabaseApp(database.url('service_role'));
    });
    afterEach(async () => {
      await app?.close();
    });

    it('submits and reads back a question through real guards and persistence', async () => {
      await request(app.getHttpServer())
        .post('/faq/assistant/review-submissions')
        .send({
          question: 'TEST PostgreSQL visitor question',
          consent: true,
          submissionId: randomUUID(),
        })
        .expect(201)
        .expect({ accepted: true });
      await request(app.getHttpServer()).get('/faq/review-queue').expect(401);
      await request(app.getHttpServer())
        .get('/faq/review-queue')
        .auth('developer-fixture', { type: 'bearer' })
        .expect(403);
      await request(app.getHttpServer())
        .get('/faq/review-queue')
        .auth('curator-fixture', { type: 'bearer' })
        .expect(200)
        .expect((response) =>
          expect((response.body as { items: unknown[] }).items).toMatchObject([
            {
              question: 'TEST PostgreSQL visitor question',
              repeatCount: 1,
              status: 'PENDING',
            },
          ]),
        );
    });

    it('counts simultaneous same-token submissions once, with explicit safe retry if contention exhausts the budget', async () => {
      const submissionId = randomUUID();
      const body = {
        question: 'TEST concurrent same receipt',
        consent: true,
        submissionId,
      };
      const responses = await Promise.all(
        Array.from({ length: 4 }, () =>
          request(app.getHttpServer())
            .post('/faq/assistant/review-submissions')
            .send(body),
        ),
      );
      for (const response of responses) {
        expect([201, 503]).toContain(response.status);
        if (response.status === 503)
          await request(app.getHttpServer())
            .post('/faq/assistant/review-submissions')
            .send(body)
            .expect(201);
      }
      await request(app.getHttpServer())
        .get('/faq/review-queue')
        .auth('curator-fixture', { type: 'bearer' })
        .expect(200)
        .expect((response) =>
          expect((response.body as { items: unknown[] }).items).toMatchObject([
            { repeatCount: 1, status: 'PENDING' },
          ]),
        );
    });

    it('groups simultaneous distinct opt-ins without lost counts or renewed expiry', async () => {
      await request(app.getHttpServer())
        .post('/faq/assistant/review-submissions')
        .send({
          question: 'TEST grouped topic',
          consent: true,
          submissionId: randomUUID(),
        })
        .expect(201);
      const first = await request(app.getHttpServer())
        .get('/faq/review-queue')
        .auth('curator-fixture', { type: 'bearer' })
        .expect(200);
      const firstItem = (
        first.body as { items: Array<{ id: string; expiresAt: string }> }
      ).items[0];
      await request(app.getHttpServer())
        .patch('/faq/review-queue/' + firstItem.id)
        .auth('curator-fixture', { type: 'bearer' })
        .send({ status: 'REVIEWED' })
        .expect(200);
      const bodies = [
        'TEST grouped topic',
        ' test grouped topic ',
        'Test  grouped topic',
        'ＴＥＳＴ grouped topic',
      ].map((question) => ({
        question,
        consent: true,
        submissionId: randomUUID(),
      }));
      const responses = await Promise.all(
        bodies.map((body) =>
          request(app.getHttpServer())
            .post('/faq/assistant/review-submissions')
            .send(body),
        ),
      );
      for (const [index, response] of responses.entries()) {
        expect([201, 503]).toContain(response.status);
        if (response.status === 503)
          await request(app.getHttpServer())
            .post('/faq/assistant/review-submissions')
            .send(bodies[index])
            .expect(201);
      }
      await request(app.getHttpServer())
        .get('/faq/review-queue')
        .auth('curator-fixture', { type: 'bearer' })
        .expect(200)
        .expect((response) =>
          expect((response.body as { items: unknown[] }).items).toMatchObject([
            {
              id: firstItem.id,
              repeatCount: 5,
              status: 'PENDING',
              expiresAt: firstItem.expiresAt,
            },
          ]),
        );
    });

    it('rolls back a disposition when audit insertion fails, rather than changing state without history', async () => {
      await request(app.getHttpServer())
        .post('/faq/assistant/review-submissions')
        .send({
          question: 'TEST rollback disposition',
          consent: true,
          submissionId: randomUUID(),
        })
        .expect(201);
      const first = await request(app.getHttpServer())
        .get('/faq/review-queue')
        .auth('curator-fixture', { type: 'bearer' })
        .expect(200);
      const id = (first.body as { items: Array<{ id: string }> }).items[0].id;
      await database.admin.query(
        'REVOKE INSERT ON audit_log FROM service_role',
      );
      try {
        await request(app.getHttpServer())
          .patch('/faq/review-queue/' + id)
          .auth('curator-fixture', { type: 'bearer' })
          .send({ status: 'REVIEWED' })
          .expect(503);
        await request(app.getHttpServer())
          .get('/faq/review-queue')
          .auth('curator-fixture', { type: 'bearer' })
          .expect(503)
          .expect((response) =>
            expect(JSON.stringify(response.body)).not.toContain(
              'TEST rollback disposition',
            ),
          );
      } finally {
        await database.admin.query('GRANT INSERT ON audit_log TO service_role');
      }
      await request(app.getHttpServer())
        .get('/faq/review-queue')
        .auth('curator-fixture', { type: 'bearer' })
        .expect(200)
        .expect((response) =>
          expect((response.body as { items: unknown[] }).items).toMatchObject([
            { id, status: 'PENDING' },
          ]),
        );
    });

    it('rolls back deletion and receipt cascade when audit fails, then removes both on explicit successful retry', async () => {
      const body = {
        question: 'TEST rollback removal private text',
        consent: true,
        submissionId: randomUUID(),
      };
      await request(app.getHttpServer())
        .post('/faq/assistant/review-submissions')
        .send(body)
        .expect(201);
      const first = await request(app.getHttpServer())
        .get('/faq/review-queue')
        .auth('curator-fixture', { type: 'bearer' })
        .expect(200);
      const id = (first.body as { items: Array<{ id: string }> }).items[0].id;
      await database.admin.query(
        'REVOKE INSERT ON audit_log FROM service_role',
      );
      try {
        await request(app.getHttpServer())
          .delete('/faq/review-queue/' + id)
          .auth('curator-fixture', { type: 'bearer' })
          .expect(503);
      } finally {
        await database.admin.query('GRANT INSERT ON audit_log TO service_role');
      }
      await request(app.getHttpServer())
        .post('/faq/assistant/review-submissions')
        .send(body)
        .expect(201);
      await request(app.getHttpServer())
        .get('/faq/review-queue')
        .auth('curator-fixture', { type: 'bearer' })
        .expect(200)
        .expect((response) =>
          expect((response.body as { items: unknown[] }).items).toMatchObject([
            { id, repeatCount: 1 },
          ]),
        );
      await request(app.getHttpServer())
        .delete('/faq/review-queue/' + id)
        .auth('curator-fixture', { type: 'bearer' })
        .expect(200);
      await request(app.getHttpServer())
        .get('/faq/review-queue')
        .auth('curator-fixture', { type: 'bearer' })
        .expect(200)
        .expect((response) =>
          expect((response.body as { items: unknown[] }).items).toEqual([]),
        );
      expect(
        (
          await database.admin.query(
            'SELECT id FROM faq_review_receipt WHERE id = $1',
            [body.submissionId],
          )
        ).rows,
      ).toEqual([]);
      const audit = await database.admin.query(
        'SELECT action, details FROM audit_log',
      );
      expect(JSON.stringify(audit.rows)).not.toMatch(
        /TEST rollback removal private text|question_hash/,
      );
      expect(audit.rows).toContainEqual({
        action: 'REMOVE_FAQ_REVIEW_ITEM',
        details: { removed: true },
      });
    });

    it('hides expired rows, rejects late review, and makes a same-token resubmission a new group after expiry', async () => {
      const body = {
        question: 'TEST expired renewed feedback',
        consent: true,
        submissionId: randomUUID(),
      };
      await request(app.getHttpServer())
        .post('/faq/assistant/review-submissions')
        .send(body)
        .expect(201);
      const first = await request(app.getHttpServer())
        .get('/faq/review-queue')
        .auth('curator-fixture', { type: 'bearer' })
        .expect(200);
      const id = (first.body as { items: Array<{ id: string }> }).items[0].id;
      await database.admin.query(
        "UPDATE faq_review_item SET first_submitted_at = now() - interval '31 days', expires_at = now() - interval '1 hour' WHERE id = $1",
        [id],
      );
      await request(app.getHttpServer())
        .get('/faq/review-queue')
        .auth('curator-fixture', { type: 'bearer' })
        .expect(200)
        .expect((response) =>
          expect((response.body as { items: unknown[] }).items).toEqual([]),
        );
      await request(app.getHttpServer())
        .patch('/faq/review-queue/' + id)
        .auth('curator-fixture', { type: 'bearer' })
        .send({ status: 'REVIEWED' })
        .expect(404);
      await request(app.getHttpServer())
        .post('/faq/assistant/review-submissions')
        .send(body)
        .expect(201);
      await request(app.getHttpServer())
        .get('/faq/review-queue')
        .auth('curator-fixture', { type: 'bearer' })
        .expect(200)
        .expect((response) => {
          const items = (
            response.body as {
              items: Array<{ id: string; repeatCount: number }>;
            }
          ).items;
          expect(items).toHaveLength(1);
          expect(items[0].id).not.toBe(id);
          expect(items[0].repeatCount).toBe(1);
        });
    });
  });

  describe('real cleanup command with restricted disposable role', () => {
    const active = '33333333-3333-4333-8333-333333333333';
    const expired = '44444444-4444-4444-8444-444444444444';
    beforeEach(async () => {
      await database.admin.query('TRUNCATE faq_review_item CASCADE');
      await database.admin.query(
        `INSERT INTO faq_review_item(id, question_hash, question, first_submitted_at, expires_at) VALUES
        ($1, $3, 'TEST still active', now(), now() + interval '1 day'),
        ($2, $4, 'TEST expired private text', now() - interval '31 days', now() - interval '1 hour')`,
        [active, expired, 'e'.repeat(64), 'f'.repeat(64)],
      );
      await database.admin.query(
        'INSERT INTO faq_review_receipt(id, queue_id, question_hash) VALUES ($1, $2, $3)',
        [randomUUID(), expired, 'f'.repeat(64)],
      );
    });
    it('defaults to count-only dry run, with no deletion or question output', async () => {
      const result = runFaqCleanup(database.url('faq_cleanup'));
      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({
        mode: 'dry-run',
        expired: '1',
      });
      expect(
        (
          await database.admin.query<{ count: string }>(
            'SELECT count(*) FROM faq_review_item',
          )
        ).rows,
      ).toEqual([{ count: '2' }]);
      expect(result.stdout + result.stderr).not.toMatch(/TEST|eeee|ffff/);
    });

    it('physically deletes only expired groups and cascades their receipts when --apply is explicit', async () => {
      const result = runFaqCleanup(database.url('faq_cleanup'), ['--apply']);
      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({ mode: 'apply', deleted: 1 });
      expect(
        (await database.admin.query('SELECT id FROM faq_review_item')).rows,
      ).toEqual([{ id: active }]);
      expect(
        (await database.admin.query('SELECT id FROM faq_review_receipt')).rows,
      ).toEqual([]);
      expect(
        JSON.parse(
          runFaqCleanup(database.url('faq_cleanup'), ['--apply']).stdout,
        ),
      ).toEqual({ mode: 'apply', deleted: 0 });
      expect(result.stdout + result.stderr).not.toMatch(/TEST|eeee|ffff/);
    });

    it('does not let the cleanup role read question text or delete unexpired rows', async () => {
      const client = await database.connect('faq_cleanup');
      await expect(
        client.query('SELECT question FROM faq_review_item'),
      ).rejects.toMatchObject({ code: '42501' });
      const deleted = await client.query(
        'DELETE FROM faq_review_item WHERE expires_at > CURRENT_TIMESTAMP',
      );
      expect(deleted.rowCount).toBe(0);
      expect(
        (
          await database.admin.query<{ count: string }>(
            'SELECT count(*) FROM faq_review_item',
          )
        ).rows,
      ).toEqual([{ count: '2' }]);
    });

    it('fails safely without a dedicated connection and on permission failure, never falling back to app settings', async () => {
      const missing = runFaqCleanup();
      expect(missing.status).toBe(1);
      expect(missing.stdout).toBe('');
      expect(missing.stderr).toBe(
        'FAQ review cleanup failed. Check deployment configuration; no question data is printed.',
      );
      await database.admin.query(
        'REVOKE DELETE ON faq_review_item FROM faq_cleanup',
      );
      try {
        const denied = runFaqCleanup(database.url('faq_cleanup'), ['--apply']);
        expect(denied.status).toBe(1);
        expect(denied.stderr).toBe(missing.stderr);
        expect(
          (
            await database.admin.query<{ count: string }>(
              'SELECT count(*) FROM faq_review_item',
            )
          ).rows,
        ).toEqual([{ count: '2' }]);
      } finally {
        await database.admin.query(
          'GRANT DELETE ON faq_review_item TO faq_cleanup',
        );
      }
    });
  });
});
