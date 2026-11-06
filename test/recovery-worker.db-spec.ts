/** Actual child-process worker, generated synthetic credentials and three owned databases. */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
  createBackupHistoryDatabaseApp,
  seedBackupHistoryDatabase,
} from './support/backup-history-database-app';
import {
  DisposableFaqPostgres,
  isolatedProcessEnvironment,
} from './support/disposable-faq-postgres';
import { RecordedRecoveryWorkspace } from './support/recorded-recovery-workspace';

describe('Owned synthetic recovery worker process', () => {
  let database: DisposableFaqPostgres;
  let workspace: RecordedRecoveryWorkspace;
  let app: INestApplication<App>;
  let manifest: string;
  beforeAll(async () => {
    database = await DisposableFaqPostgres.start('recovery-recording');
    await database.createRole('service_role');
    await seedBackupHistoryDatabase(database.admin);
    await database.admin.query(
      'GRANT INSERT, UPDATE ON backup_history TO service_role',
    );
    app = await createBackupHistoryDatabaseApp(database.url('service_role'));
    workspace = await new RecordedRecoveryWorkspace().start();
    manifest = database.writeRecoveryWorkerManifest(workspace.root);
  });
  afterAll(async () => {
    try {
      await app?.close();
    } finally {
      try {
        workspace?.close();
      } finally {
        await database?.close();
      }
    }
  });
  function run(operation: string, extra: string[] = []) {
    const result = spawnSync(
      process.execPath,
      [
        resolve(__dirname, '../scripts/recovery/worker.cjs'),
        operation,
        '--profile',
        workspace.profileFile,
        '--history',
        manifest,
        ...extra,
      ],
      {
        env: {
          ...isolatedProcessEnvironment(),
          DATABASE_URL: 'postgresql://synthetic.invalid/forbidden',
          DIRECT_URL: 'postgresql://synthetic.invalid/forbidden',
          DOCKER_HOST: 'tcp://synthetic.invalid:2375',
        },
        encoding: 'utf8',
        windowsHide: true,
        timeout: 90000,
        maxBuffer: 16384,
      },
    );
    expect(result.error).toBeUndefined();
    expect(result.stderr).toBe('');
    return {
      exit: result.status,
      pid: result.pid,
      body: JSON.parse(result.stdout) as Record<string, unknown>,
      output: result.stdout,
    };
  }
  async function history(id: unknown) {
    const response = await request(app.getHttpServer())
      .get(`/backups/history/${String(id)}`)
      .auth('curator-fixture', { type: 'bearer' })
      .expect(200);
    return response.body as Record<string, unknown>;
  }
  it('runs capture and restore in a separate command with recorded results and no inherited application destination', async () => {
    const captured = run('capture');
    expect(captured.exit).toBe(0);
    expect(captured.body).toMatchObject({
      status: 'CAPTURED',
      history: 'RECORDED',
    });
    expect(captured.body.workerPid).toBe(captured.pid);
    expect(captured.body.workerPid).not.toBe(process.pid);
    expect(await history(captured.body.attemptId)).toMatchObject({
      status: 'COMPLETED',
      backupType: 'SYNTHETIC_CAPTURE',
    });
    const restored = run('restore', [
      '--snapshot',
      String(captured.body.snapshotId),
    ]);
    expect(restored.exit).toBe(0);
    expect(restored.body).toMatchObject({
      status: 'RESTORED_VERIFIED',
      history: 'RECORDED',
    });
    expect(await history(restored.body.attemptId)).toMatchObject({
      status: 'COMPLETED',
      artifactAvailable: false,
    });
    expect(
      workspace.sql(
        workspace.target,
        'SELECT quantity FROM synthetic_inventory WHERE id=1',
      ),
    ).toBe('7');
    expect(restored.output).not.toMatch(
      /password|postgresql:|synthetic\.invalid|DATABASE_URL/,
    );
  });
  it.each(['owner', 'port', 'containerId', 'databaseUrl'])(
    'rejects a mismatched history manifest %s without recording an attempt',
    async (field) => {
      const original = readFileSync(manifest);
      const value = JSON.parse(original.toString('utf8')) as Record<
        string,
        unknown
      >;
      value[field] =
        field === 'owner'
          ? randomUUID()
          : field === 'port'
            ? Number(value.port) + 1
            : field === 'containerId'
              ? workspace.source
              : 'postgresql://synthetic.invalid/forbidden';
      const before = await request(app.getHttpServer())
        .get('/audit-logs')
        .query({ action: 'recovery_started' })
        .auth('curator-fixture', { type: 'bearer' })
        .expect(200);
      try {
        writeFileSync(manifest, JSON.stringify(value));
        const result = run('capture');
        expect(result.exit).toBe(1);
        expect(result.body).toMatchObject({
          status: 'FAILED',
          code: 'WORKER_HISTORY_REJECTED',
        });
        expect(result.output).not.toMatch(
          /password|postgresql:|synthetic\.invalid/,
        );
      } finally {
        writeFileSync(manifest, original);
      }
      const after = await request(app.getHttpServer())
        .get('/audit-logs')
        .query({ action: 'recovery_started' })
        .auth('curator-fixture', { type: 'bearer' })
        .expect(200);
      expect(after.body.total).toBe(before.body.total);
    },
  );
  it('rejects connection flags before using a profile or history destination', () => {
    const result = run('capture', [
      '--database-url',
      'postgresql://synthetic.invalid/forbidden',
    ]);
    expect(result.exit).toBe(1);
    expect(result.body).toMatchObject({
      status: 'FAILED',
      code: 'WORKER_INVALID_ARGUMENTS',
    });
  });
  it('uses a nonzero exit for an engine failure and preserves its recorded result on reconciliation', async () => {
    const captured = run('capture');
    const failed = run('restore', [
      '--snapshot',
      String(captured.body.snapshotId),
    ]);
    expect(failed.exit).toBe(1);
    expect(failed.body).toMatchObject({
      status: 'FAILED',
      history: 'RECORDED',
      code: 'TARGET_NOT_EMPTY',
    });
    const original = await history(failed.body.attemptId);
    const replay = run('reconcile', [
      '--attempt',
      String(failed.body.attemptId),
    ]);
    expect(replay.exit).toBe(1);
    expect(replay.body).toMatchObject({
      status: 'FAILED',
      code: 'TARGET_NOT_EMPTY',
      history: 'RECORDED',
    });
    expect(await history(failed.body.attemptId)).toEqual(original);
  });
  it('returns nonzero for pending recording, then reconciles in a fresh process without a second capture', async () => {
    await database.admin
      .query(`CREATE FUNCTION reject_worker_finish() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.action='recovery_finished' THEN RAISE EXCEPTION 'Synthetic worker audit failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER reject_worker_finish BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION reject_worker_finish();`);
    let pending: ReturnType<typeof run>;
    try {
      pending = run('capture');
      expect(pending.exit).toBe(1);
      expect(pending.body).toMatchObject({
        status: 'RECORDING_PENDING',
        history: 'PENDING',
      });
      expect(await history(pending.body.attemptId)).toMatchObject({
        status: 'IN_PROGRESS',
      });
    } finally {
      await database.admin.query(
        'DROP TRIGGER reject_worker_finish ON audit_log; DROP FUNCTION reject_worker_finish()',
      );
    }
    const directory = resolve(workspace.root, 'checkpoints');
    const files = readdirSync(directory).sort();
    const checkpoint = readFileSync(
      resolve(directory, String(pending!.body.snapshotId) + '.bsp'),
    );
    const replay = run('reconcile', [
      '--attempt',
      String(pending!.body.attemptId),
    ]);
    expect(replay.exit).toBe(0);
    expect(replay.body).toMatchObject({
      status: 'CAPTURED',
      history: 'RECORDED',
      attemptId: pending!.body.attemptId,
    });
    expect(replay.pid).not.toBe(pending!.pid);
    expect(readdirSync(directory).sort()).toEqual(files);
    expect(
      readFileSync(
        resolve(directory, String(pending!.body.snapshotId) + '.bsp'),
      ),
    ).toEqual(checkpoint);
    const audit = await request(app.getHttpServer())
      .get('/audit-logs')
      .query({ affectedRecordId: pending!.body.attemptId })
      .auth('curator-fixture', { type: 'bearer' })
      .expect(200);
    expect(audit.body.total).toBe(2);
  });
  it('rejects non-string source identities before recording a worker attempt', async () => {
    const before = await request(app.getHttpServer())
      .get('/audit-logs')
      .query({ action: 'recovery_started' })
      .auth('curator-fixture', { type: 'bearer' })
      .expect(200);
    const original = readFileSync(workspace.profileFile);
    const profile = JSON.parse(original.toString('utf8')) as Record<
      string,
      unknown
    >;
    profile.sourceContainer = [profile.sourceContainer];
    try {
      writeFileSync(workspace.profileFile, JSON.stringify(profile));
      const result = run('capture');
      expect(result.exit).toBe(1);
      expect(result.body).toMatchObject({
        status: 'FAILED',
        code: 'WORKER_PROFILE_REJECTED',
        history: 'NOT_RECORDED',
      });
    } finally {
      writeFileSync(workspace.profileFile, original);
    }
    const after = await request(app.getHttpServer())
      .get('/audit-logs')
      .query({ action: 'recovery_started' })
      .auth('curator-fixture', { type: 'bearer' })
      .expect(200);
    expect(after.body.total).toBe(before.body.total);
  });
});
