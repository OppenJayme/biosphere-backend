/** Internal recorder and protected reads on owned PostgreSQL; no recovery execution. */
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
  RecoveryHistoryService,
  type RecoveryAttempt,
  type RecoveryOutcome,
} from '../src/backup/recovery-history.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { CuratorNotificationType } from '../src/notifications/entities/curator-notification.entity';
import { DisposableFaqPostgres } from './support/disposable-faq-postgres';
import {
  createBackupHistoryDatabaseApp,
  seedBackupHistoryDatabase,
} from './support/backup-history-database-app';

describe('Internal synthetic recovery recording on owned PostgreSQL', () => {
  let database: DisposableFaqPostgres;
  let app: INestApplication<App>;
  let recorder: RecoveryHistoryService;
  const command = () => ({
    attemptId: randomUUID(),
    snapshotId: randomUUID(),
    operation: 'capture' as const,
    configurationFingerprint: 'a'.repeat(64),
    workspaceFingerprint: 'b'.repeat(64),
  });
  beforeAll(async () => {
    database = await DisposableFaqPostgres.start('recovery-history');
    await database.createRole('service_role');
    await seedBackupHistoryDatabase(database.admin);
    for (const file of ['016_inquiry.sql', '017_visit_request.sql']) {
      await database.admin.query(
        readFileSync(resolve(__dirname, '../database/sql', file), 'utf8'),
      );
    }
    await database.admin.query(
      'GRANT SELECT ON inquiry, visit_request TO service_role',
    );
    // The current real feed also queries incomplete records (#243). Keep this
    // owned scope empty, but present, rather than mocking that collaborator.
    await database.admin.query(`
      CREATE TYPE specimen_status AS ENUM ('UNCATALOGED', 'CATALOGED', 'ARCHIVED');
      CREATE TABLE specimen (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        status specimen_status NOT NULL DEFAULT 'UNCATALOGED',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(), archived_at TIMESTAMPTZ
      );
      GRANT SELECT ON specimen TO service_role;
    `);
    await database.admin.query(
      'GRANT INSERT, UPDATE ON backup_history TO service_role',
    );
    app = await createBackupHistoryDatabaseApp(database.url('service_role'), {
      RECOVERY_HISTORY_RECORDING_ENABLED: 'true',
      RECOVERY_HISTORY_OPERATOR_ID: 'synthetic-rehearsal',
    });
    recorder = app.get(RecoveryHistoryService);
  });
  afterAll(async () => {
    try {
      await app?.close();
    } finally {
      await database?.close();
    }
  });
  async function history(id: string) {
    const response = await request(app.getHttpServer())
      .get(`/backups/history/${id}`)
      .auth('curator-fixture', { type: 'bearer' })
      .expect(200);
    return response.body as Record<string, unknown>;
  }
  async function audits(id: string) {
    const response = await request(app.getHttpServer())
      .get('/audit-logs')
      .query({ affectedRecordId: id })
      .auth('curator-fixture', { type: 'bearer' })
      .expect(200);
    return response.body as {
      total: number;
      items: Array<{
        id: string;
        action: string;
        actor: unknown;
        details: unknown;
      }>;
    };
  }
  it('records a synthetic start and makes its service attribution readable without an artifact claim', async () => {
    const input = command();
    await recorder.start(input);
    expect(await history(input.attemptId)).toMatchObject({
      id: input.attemptId,
      creator: null,
      backupType: 'SYNTHETIC_CAPTURE',
      status: 'IN_PROGRESS',
      artifactAvailable: false,
      completedAt: null,
    });
    expect(await audits(input.attemptId)).toMatchObject({
      total: 1,
      items: [
        {
          action: 'recovery_started',
          actor: null,
          details: {
            scope: 'synthetic',
            operator: { kind: 'service', id: 'synthetic-rehearsal' },
            snapshotId: input.snapshotId,
          },
        },
      ],
    });
  });
  it('replays simultaneous starts once and rejects a changed command without rewriting history', async () => {
    const input = command();
    const results = await Promise.all([
      recorder.start(input),
      recorder.start(input),
    ]);
    expect(results[0]).toEqual(results[1]);
    await expect(
      recorder.start({ ...input, snapshotId: randomUUID() }),
    ).rejects.toMatchObject({ status: 409 });
    expect((await audits(input.attemptId)).total).toBe(1);
    expect(await history(input.attemptId)).toMatchObject({
      status: 'IN_PROGRESS',
    });
  });
  it('records a capture outcome atomically, replays it once and rejects a conflicting terminal result', async () => {
    const input = command();
    await recorder.start(input);
    const result = { outcome: 'CAPTURED' as const };
    const finished = await Promise.all([
      recorder.finish(input, result),
      recorder.finish(input, result),
    ]);
    expect(finished[0]).toEqual(finished[1]);
    await expect(
      recorder.finish(input, { outcome: 'FAILED', code: 'CAPTURE_FAILED' }),
    ).rejects.toMatchObject({ status: 409 });
    expect(await history(input.attemptId)).toMatchObject({
      status: 'COMPLETED',
      artifactAvailable: false,
      completedAt: expect.any(String),
    });
    expect(await audits(input.attemptId)).toMatchObject({
      total: 2,
      items: expect.arrayContaining([
        expect.objectContaining({
          action: 'recovery_finished',
          details: expect.objectContaining({ outcome: 'CAPTURED' }),
        }),
      ]),
    });
  });
  it('is disabled by default for both start and finish, including when an attempt already exists', async () => {
    const input = command();
    const disabled = new RecoveryHistoryService(
      app.get(PrismaService),
      new ConfigService({
        RECOVERY_HISTORY_OPERATOR_ID: 'synthetic-rehearsal',
      }),
    );
    await expect(disabled.start(input)).rejects.toMatchObject({ status: 503 });
    expect((await audits(input.attemptId)).total).toBe(0);
    await recorder.start(input);
    await expect(
      disabled.finish(input, { outcome: 'CAPTURED' }),
    ).rejects.toMatchObject({ status: 503 });
    expect(await history(input.attemptId)).toMatchObject({
      status: 'IN_PROGRESS',
    });
  });
  it.each([
    { operation: 'production' },
    { attemptId: 'not-a-uuid' },
    { configurationFingerprint: 'not-a-hash' },
    { storagePath: 'private/synthetic.dump' },
    { workspaceFingerprint: '' },
  ])(
    'rejects malformed or additional command fields before recording: %j',
    async (change) => {
      const input = { ...command(), ...change } as unknown as RecoveryAttempt;
      await expect(recorder.start(input)).rejects.toMatchObject({
        status: 400,
      });
    },
  );
  it.each([
    { outcome: 'RESTORED_VERIFIED' },
    { outcome: 'COMPLETED' },
    { outcome: 'FAILED', code: 'free form private error' },
    { outcome: 'CAPTURED', storagePath: 'private/synthetic.dump' },
  ])(
    'rejects incompatible or unsafe outcomes without completing the attempt: %j',
    async (result) => {
      const input = command();
      await recorder.start(input);
      await expect(
        recorder.finish(input, result as RecoveryOutcome),
      ).rejects.toMatchObject({ status: 400 });
      expect(await history(input.attemptId)).toMatchObject({
        status: 'IN_PROGRESS',
      });
      expect((await audits(input.attemptId)).total).toBe(1);
    },
  );
  it.each([
    {
      operation: 'restore' as const,
      result: { outcome: 'RESTORED_VERIFIED' as const },
      status: 'COMPLETED',
    },
    {
      operation: 'verify' as const,
      result: { outcome: 'VERIFIED' as const },
      status: 'COMPLETED',
    },
    {
      operation: 'capture' as const,
      result: { outcome: 'FAILED' as const, code: 'AUTHENTICATION_FAILED' },
      status: 'FAILED',
    },
  ])(
    'preserves the distinct $operation outcome and its repeat result',
    async ({ operation, result, status }) => {
      const input = { ...command(), operation };
      await recorder.start(input);
      const first = await recorder.finish(input, result);
      expect(await recorder.finish(input, result)).toEqual(first);
      expect(await recorder.start(input)).toEqual(first);
      expect(await history(input.attemptId)).toMatchObject({
        status,
        backupType: `SYNTHETIC_${operation.toUpperCase()}`,
        artifactAvailable: false,
      });
      expect((await audits(input.attemptId)).total).toBe(2);
    },
  );
  it('rejects finish-before-start and prevents reuse of unrelated existing history', async () => {
    const missing = command();
    await expect(
      recorder.finish(missing, { outcome: 'CAPTURED' }),
    ).rejects.toMatchObject({ status: 404 });
    expect((await audits(missing.attemptId)).total).toBe(0);
    const unrelated = {
      ...command(),
      attemptId: '44444444-4444-4444-8444-444444444444',
    };
    await expect(recorder.start(unrelated)).rejects.toMatchObject({
      status: 409,
    });
    await expect(
      recorder.finish(unrelated, { outcome: 'CAPTURED' }),
    ).rejects.toMatchObject({ status: 409 });
    expect(await history(unrelated.attemptId)).toMatchObject({
      backupType: 'INCREMENTAL',
      status: 'IN_PROGRESS',
    });
  });
  it('rolls back start and finish when their audit insertion fails, then permits an explicit retry', async () => {
    const start = command();
    const finish = command();
    await recorder.start(finish);
    await database.admin.query(`
      CREATE FUNCTION reject_recovery_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Synthetic audit-write failure'; END $$;
      CREATE TRIGGER reject_recovery_audit BEFORE INSERT ON audit_log
        FOR EACH ROW EXECUTE FUNCTION reject_recovery_audit();
    `);
    try {
      await expect(recorder.start(start)).rejects.toThrow();
      await expect(
        recorder.finish(finish, { outcome: 'CAPTURED' }),
      ).rejects.toThrow();
      await request(app.getHttpServer())
        .get(`/backups/history/${start.attemptId}`)
        .auth('curator-fixture', { type: 'bearer' })
        .expect(404);
      expect((await audits(start.attemptId)).total).toBe(0);
      expect(await history(finish.attemptId)).toMatchObject({
        status: 'IN_PROGRESS',
        completedAt: null,
      });
      expect((await audits(finish.attemptId)).total).toBe(1);
    } finally {
      await database.admin.query(
        'DROP TRIGGER reject_recovery_audit ON audit_log; DROP FUNCTION reject_recovery_audit()',
      );
    }
    await recorder.start(start);
    await recorder.finish(finish, { outcome: 'CAPTURED' });
    expect((await audits(start.attemptId)).total).toBe(1);
    expect((await audits(finish.attemptId)).total).toBe(2);
  });
  it('allows only one of two conflicting simultaneous outcomes', async () => {
    const input = command();
    await recorder.start(input);
    const results = await Promise.allSettled([
      recorder.finish(input, { outcome: 'CAPTURED' }),
      recorder.finish(input, { outcome: 'FAILED', code: 'CAPTURE_FAILED' }),
    ]);
    expect(
      results.filter((entry) => entry.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(results.filter((entry) => entry.status === 'rejected')).toEqual([
      expect.objectContaining({
        reason: expect.objectContaining({ status: 409 }),
      }),
    ]);
    expect((await audits(input.attemptId)).total).toBe(2);
  });
  it('keeps generated evidence Curator-only and exposes no history mutation route', async () => {
    const input = command();
    await recorder.start(input);
    const auditId = (await audits(input.attemptId)).items[0].id;
    for (const path of [
      '/backups/history',
      `/backups/history/${input.attemptId}`,
      '/audit-logs',
      `/audit-logs/${auditId}`,
    ]) {
      await request(app.getHttpServer()).get(path).expect(401);
      await request(app.getHttpServer())
        .get(path)
        .auth('developer-fixture', { type: 'bearer' })
        .expect(403);
    }
    await request(app.getHttpServer())
      .post('/backups/history')
      .auth('curator-fixture', { type: 'bearer' })
      .send(input)
      .expect(404);
  });
  it('binds asynchronous writes to the validated command and outcome even if the caller edits its objects', async () => {
    const input: RecoveryAttempt = command();
    const saved = { ...input };
    const starting = recorder.start(input);
    input.operation = 'verify';
    await starting;
    expect(await history(saved.attemptId)).toMatchObject({
      backupType: 'SYNTHETIC_CAPTURE',
    });
    const result: RecoveryOutcome = { outcome: 'CAPTURED' };
    const finishing = recorder.finish(saved, result);
    result.outcome = 'VERIFIED';
    await finishing;
    expect(await audits(saved.attemptId)).toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({
          action: 'recovery_finished',
          details: expect.objectContaining({
            outcome: 'CAPTURED',
            operation: 'capture',
          }),
        }),
      ]),
    });
  });
  it('separates completed rehearsals from default backup lists while retaining explicit diagnostic access', async () => {
    const input = { ...command(), operation: 'restore' as const };
    await recorder.start(input);
    await recorder.finish(input, { outcome: 'RESTORED_VERIFIED' });
    const defaults = await request(app.getHttpServer())
      .get('/backups/history')
      .query({ status: 'COMPLETED' })
      .auth('curator-fixture', { type: 'bearer' })
      .expect(200);
    const items = defaults.body.items as Array<{
      id: string;
      backupType: string;
    }>;
    expect(items.some((item) => item.backupType.startsWith('SYNTHETIC_'))).toBe(
      false,
    );
    expect(defaults.body.total).toBe(2);
    const diagnostics = await request(app.getHttpServer())
      .get('/backups/history')
      .query({ status: 'COMPLETED', backupType: 'synthetic_restore' })
      .auth('curator-fixture', { type: 'bearer' })
      .expect(200);
    expect(diagnostics.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: input.attemptId,
          backupType: 'SYNTHETIC_RESTORE',
        }),
      ]),
    );
    expect(await history(input.attemptId)).toMatchObject({
      backupType: 'SYNTHETIC_RESTORE',
    });
  });
  it('keeps rehearsals out of real backup notifications without hiding or resolving operational failures', async () => {
    const notifications = new NotificationsService(app.get(PrismaService));
    const ids = async () =>
      (await notifications.getFeed()).items
        .filter((item) => item.type === CuratorNotificationType.BACKUP_FAILED)
        .map((item) => item.recordId)
        .sort();
    const realFailure = '44444444-4444-4444-8444-444444444442';
    expect(await ids()).toEqual([realFailure]);
    const operations = ['capture', 'restore', 'verify'] as const;
    const outcomes = ['CAPTURED', 'RESTORED_VERIFIED', 'VERIFIED'] as const;
    for (let index = 0; index < operations.length; index++) {
      const failed = { ...command(), operation: operations[index] };
      await recorder.start(failed);
      await recorder.finish(failed, {
        outcome: 'FAILED',
        code: 'SYNTHETIC_FAILURE',
      });
      expect(await ids()).toEqual([realFailure]);
      const completed = { ...command(), operation: operations[index] };
      await recorder.start(completed);
      await recorder.finish(completed, { outcome: outcomes[index] });
      expect(await ids()).toEqual([realFailure]);
    }
    const literalPrefixControl = randomUUID();
    await database.admin.query(
      `INSERT INTO backup_history(id,backup_type,status,completed_at) VALUES
      ($1,'SYNTHETICX_FULL','FAILED',NOW()), (gen_random_uuid(),'synthetic_verify','FAILED',NOW())`,
      [literalPrefixControl],
    );
    expect(await ids()).toEqual([realFailure, literalPrefixControl].sort());
    await database.admin.query(
      "INSERT INTO backup_history(backup_type,status,completed_at) VALUES ('SYNTHETICX_FULL','COMPLETED',NOW())",
    );
    expect(await ids()).toEqual([realFailure]);
  });
  it.each(['start', 'finish'] as const)(
    'waits beyond the old five-second transaction limit for a same-ID %s retry',
    async (phase) => {
      const input = command();
      if (phase === 'finish') await recorder.start(input);
      await database.admin
        .query(`CREATE FUNCTION delay_recovery_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.action='recovery_${phase === 'start' ? 'started' : 'finished'}' THEN PERFORM pg_sleep(6); END IF; RETURN NEW; END $$;
      CREATE TRIGGER delay_recovery_audit BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION delay_recovery_audit();`);
      try {
        const results =
          phase === 'start'
            ? await Promise.allSettled([
                recorder.start(input),
                recorder.start(input),
              ])
            : await Promise.allSettled([
                recorder.finish(input, { outcome: 'CAPTURED' }),
                recorder.finish(input, { outcome: 'CAPTURED' }),
              ]);
        expect(results).toEqual([
          expect.objectContaining({ status: 'fulfilled' }),
          expect.objectContaining({ status: 'fulfilled' }),
        ]);
        expect(results[0]).toEqual(results[1]);
        expect((await audits(input.attemptId)).total).toBe(
          phase === 'start' ? 1 : 2,
        );
        expect(await history(input.attemptId)).toMatchObject({
          status: phase === 'start' ? 'IN_PROGRESS' : 'COMPLETED',
        });
      } finally {
        await database.admin.query(
          'DROP TRIGGER delay_recovery_audit ON audit_log; DROP FUNCTION delay_recovery_audit()',
        );
      }
    },
  );
});
