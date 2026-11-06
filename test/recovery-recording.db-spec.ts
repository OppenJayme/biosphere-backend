/** Real CLI engine + real recorder; three owned databases and synthetic data only. */
import type { INestApplication } from '@nestjs/common';
import {
  readFileSync,
  readdirSync,
  writeFileSync,
  unlinkSync,
  existsSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import request from 'supertest';
import type { App } from 'supertest/types';
import { RecoveryHistoryService } from '../src/backup/recovery-history.service';
import {
  createBackupHistoryDatabaseApp,
  seedBackupHistoryDatabase,
} from './support/backup-history-database-app';
import { DisposableFaqPostgres } from './support/disposable-faq-postgres';
import { RecordedRecoveryWorkspace } from './support/recorded-recovery-workspace';

interface RunResult {
  status: string;
  attemptId: string;
  snapshotId: string;
  history: string;
  code?: string;
  lock?: string;
}
// The production CLI remains dependency-free; only this owned fixture supplies a recorder.
const { runRecorded, reconcileRecorded } = createRequire(__filename)(
  '../scripts/recovery/cli.cjs',
) as {
  runRecorded(
    this: void,
    input: { operation: string; profileFile: string; snapshotId?: string },
    recorder: RecoveryHistoryService,
  ): Promise<RunResult>;
  reconcileRecorded(
    this: void,
    input: { profileFile: string; attemptId: string },
    recorder: RecoveryHistoryService,
  ): Promise<RunResult>;
};

describe('Synthetic CLI and separate recovery recording database', () => {
  let workspace: RecordedRecoveryWorkspace;
  let database: DisposableFaqPostgres;
  let app: INestApplication<App>;
  let recorder: RecoveryHistoryService;
  let capturedRun: RunResult;
  beforeAll(async () => {
    database = await DisposableFaqPostgres.start('recovery-recording');
    await database.createRole('service_role');
    await seedBackupHistoryDatabase(database.admin);
    await database.admin.query(
      'GRANT INSERT, UPDATE ON backup_history TO service_role',
    );
    app = await createBackupHistoryDatabaseApp(database.url('service_role'), {
      RECOVERY_HISTORY_RECORDING_ENABLED: 'true',
      RECOVERY_HISTORY_OPERATOR_ID: 'synthetic-rehearsal',
    });
    recorder = app.get(RecoveryHistoryService);
    workspace = await new RecordedRecoveryWorkspace().start();
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
  async function history(id: string) {
    const response = await request(app.getHttpServer())
      .get(`/backups/history/${id}`)
      .auth('curator-fixture', { type: 'bearer' })
      .expect(200);
    return response.body as Record<string, unknown>;
  }
  it('records a real synthetic capture and verified restore outside the restored database', async () => {
    const captured = await runRecorded(
      { operation: 'capture', profileFile: workspace.profileFile },
      recorder,
    );
    capturedRun = captured;
    expect(captured).toMatchObject({ status: 'CAPTURED', history: 'RECORDED' });
    expect(await history(captured.attemptId)).toMatchObject({
      status: 'COMPLETED',
      backupType: 'SYNTHETIC_CAPTURE',
      artifactAvailable: false,
    });
    const restored = await runRecorded(
      {
        operation: 'restore',
        profileFile: workspace.profileFile,
        snapshotId: captured.snapshotId,
      },
      recorder,
    );
    expect(restored).toMatchObject({
      status: 'RESTORED_VERIFIED',
      history: 'RECORDED',
    });
    expect(await history(restored.attemptId)).toMatchObject({
      status: 'COMPLETED',
      backupType: 'SYNTHETIC_RESTORE',
    });
    expect(
      workspace.sql(
        workspace.target,
        'SELECT quantity FROM synthetic_inventory WHERE id=1',
      ),
    ).toBe('7');
    expect(
      workspace.sql(
        workspace.target,
        "SELECT count(*) FROM information_schema.tables WHERE table_name='backup_history'",
      ),
    ).toBe('0');
    expect(
      workspace.sql(workspace.target, 'SELECT count(*) FROM audit_log'),
    ).toBe('0');
  });
  it('reconciles a failed terminal audit write with the same IDs and no second capture', async () => {
    await database.admin
      .query(`CREATE FUNCTION reject_finished_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.action='recovery_finished' THEN RAISE EXCEPTION 'Synthetic finish audit failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER reject_finished_audit BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION reject_finished_audit();`);
    let pending: RunResult;
    try {
      pending = await runRecorded(
        { operation: 'capture', profileFile: workspace.profileFile },
        recorder,
      );
      expect(pending).toMatchObject({
        status: 'RECORDING_PENDING',
        history: 'PENDING',
        code: 'HISTORY_FINISH_FAILED',
      });
      expect(await history(pending.attemptId)).toMatchObject({
        status: 'IN_PROGRESS',
      });
    } finally {
      await database.admin.query(
        'DROP TRIGGER reject_finished_audit ON audit_log; DROP FUNCTION reject_finished_audit()',
      );
    }
    const before = readdirSync(join(workspace.root, 'checkpoints')).sort();
    const checkpoint = readFileSync(
      join(workspace.root, 'checkpoints', pending!.snapshotId + '.bsp'),
    );
    for (let retry = 0; retry < 2; retry++) {
      expect(
        await reconcileRecorded(
          { profileFile: workspace.profileFile, attemptId: pending!.attemptId },
          recorder,
        ),
      ).toMatchObject({
        status: 'CAPTURED',
        history: 'RECORDED',
        attemptId: pending!.attemptId,
        snapshotId: pending!.snapshotId,
      });
    }
    expect(readdirSync(join(workspace.root, 'checkpoints')).sort()).toEqual(
      before,
    );
    expect(
      readFileSync(
        join(workspace.root, 'checkpoints', pending!.snapshotId + '.bsp'),
      ),
    ).toEqual(checkpoint);
    expect(await history(pending!.attemptId)).toMatchObject({
      status: 'COMPLETED',
    });
    const response = await request(app.getHttpServer())
      .get('/audit-logs')
      .query({ affectedRecordId: pending!.attemptId })
      .auth('curator-fixture', { type: 'bearer' })
      .expect(200);
    expect(response.body.total).toBe(2);
  });
  it('does not execute when start recording fails, and reconciles that failure without a capture', async () => {
    const checkpointNames = () =>
      existsSync(join(workspace.root, 'checkpoints'))
        ? readdirSync(join(workspace.root, 'checkpoints')).sort()
        : [];
    const before = checkpointNames();
    await database.admin
      .query(`CREATE FUNCTION reject_started_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.action='recovery_started' THEN RAISE EXCEPTION 'Synthetic start audit failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER reject_started_audit BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION reject_started_audit();`);
    let failed: RunResult;
    try {
      failed = await runRecorded(
        { operation: 'capture', profileFile: workspace.profileFile },
        recorder,
      );
      expect(failed).toMatchObject({
        status: 'FAILED',
        history: 'PENDING',
        code: 'HISTORY_START_FAILED',
      });
      await request(app.getHttpServer())
        .get(`/backups/history/${failed.attemptId}`)
        .auth('curator-fixture', { type: 'bearer' })
        .expect(404);
    } finally {
      await database.admin.query(
        'DROP TRIGGER reject_started_audit ON audit_log; DROP FUNCTION reject_started_audit()',
      );
    }
    expect(
      await reconcileRecorded(
        { profileFile: workspace.profileFile, attemptId: failed!.attemptId },
        recorder,
      ),
    ).toMatchObject({
      status: 'FAILED',
      history: 'RECORDED',
      code: 'EXECUTION_WITHHELD',
      execution: 'WITHHELD',
    });
    expect(await history(failed!.attemptId)).toMatchObject({
      status: 'FAILED',
    });
    const evidence = await request(app.getHttpServer())
      .get('/audit-logs')
      .query({ affectedRecordId: failed!.attemptId })
      .auth('curator-fixture', { type: 'bearer' })
      .expect(200);
    expect(evidence.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'recovery_finished',
          details: expect.objectContaining({ code: 'EXECUTION_WITHHELD' }),
        }),
      ]),
    );
    expect(checkpointNames()).toEqual(before);
  });
  it('records a real engine failure without changing the populated restore target', async () => {
    const result = await runRecorded(
      {
        operation: 'restore',
        profileFile: workspace.profileFile,
        snapshotId: capturedRun.snapshotId,
      },
      recorder,
    );
    expect(result).toMatchObject({
      status: 'FAILED',
      history: 'RECORDED',
      code: 'TARGET_NOT_EMPTY',
    });
    expect(await history(result.attemptId)).toMatchObject({ status: 'FAILED' });
    expect(
      workspace.sql(
        workspace.target,
        'SELECT quantity FROM synthetic_inventory WHERE id=1',
      ),
    ).toBe('7');
  });
  it('refuses stale configuration during reconciliation', async () => {
    const file = join(workspace.root, 'configuration.json');
    const original = readFileSync(file);
    try {
      writeFileSync(file, JSON.stringify({ mode: 'synthetic', changed: true }));
      expect(
        await reconcileRecorded(
          {
            profileFile: workspace.profileFile,
            attemptId: capturedRun.attemptId,
          },
          recorder,
        ),
      ).toMatchObject({ status: 'FAILED', code: 'RECEIPT_CONTEXT_MISMATCH' });
    } finally {
      writeFileSync(file, original);
    }
    expect(await history(capturedRun.attemptId)).toMatchObject({
      status: 'COMPLETED',
    });
  });
  it('leaves an incomplete receipt unknown and creates no success or failure evidence', async () => {
    const event = JSON.parse(
      readFileSync(
        join(workspace.root, 'recording', capturedRun.attemptId + '.jsonl'),
        'utf8',
      ).split('\n')[0],
    ) as { command: Record<string, string> };
    const attemptId = randomUUID();
    event.command.attemptId = attemptId;
    writeFileSync(
      join(workspace.root, 'recording', attemptId + '.jsonl'),
      JSON.stringify(event) + '\n',
      { mode: 0o600 },
    );
    expect(
      await reconcileRecorded(
        { profileFile: workspace.profileFile, attemptId },
        recorder,
      ),
    ).toMatchObject({ status: 'RECORDING_PENDING', code: 'OUTCOME_UNKNOWN' });
    await request(app.getHttpServer())
      .get(`/backups/history/${attemptId}`)
      .auth('curator-fixture', { type: 'bearer' })
      .expect(404);
  });
  it('serializes the workspace while asynchronous history recording is pending', async () => {
    const input = {
      operation: 'verify',
      profileFile: workspace.profileFile,
      snapshotId: capturedRun.snapshotId,
    };
    const [first, second] = await Promise.all([
      runRecorded(input, recorder),
      runRecorded(input, recorder),
    ]);
    expect(first).toMatchObject({ status: 'VERIFIED', history: 'RECORDED' });
    expect(second).toMatchObject({ status: 'FAILED', code: 'RUN_LOCKED' });
  });
  it('rejects hosted-connection options rather than silently ignoring them', async () => {
    const before = readdirSync(join(workspace.root, 'checkpoints')).sort();
    const input = {
      operation: 'capture',
      profileFile: workspace.profileFile,
      databaseUrl: 'postgresql://synthetic.invalid/db',
    };
    expect(await runRecorded(input, recorder)).toMatchObject({
      status: 'FAILED',
      code: 'INVALID_ARGUMENTS',
    });
    expect(readdirSync(join(workspace.root, 'checkpoints')).sort()).toEqual(
      before,
    );
  });
  it('refuses configuration changes made while the start write is pending', async () => {
    const before = readdirSync(join(workspace.root, 'checkpoints')).sort();
    const file = join(workspace.root, 'configuration.json');
    const original = readFileSync(file);
    const pending = runRecorded(
      { operation: 'capture', profileFile: workspace.profileFile },
      recorder,
    );
    try {
      writeFileSync(file, JSON.stringify({ mode: 'synthetic', changed: true }));
      expect(await pending).toMatchObject({
        status: 'FAILED',
        history: 'RECORDED',
        code: 'CONFIGURATION_CHANGED',
      });
    } finally {
      writeFileSync(file, original);
    }
    expect(readdirSync(join(workspace.root, 'checkpoints')).sort()).toEqual(
      before,
    );
  });
  it.each([
    { operation: 'verify', status: 'VERIFIED', code: undefined },
    { operation: 'restore', status: 'FAILED', code: 'TARGET_NOT_EMPTY' },
  ])(
    'preserves the $status outcome when lock ownership changes before cleanup',
    async ({ operation, status, code }) => {
      const lock = join(workspace.root, '.recovery-lock');
      const foreignAttempt = randomUUID();
      const pending = runRecorded(
        {
          operation,
          profileFile: workspace.profileFile,
          snapshotId: capturedRun.snapshotId,
        },
        recorder,
      );
      // The real recorder is awaiting SQL; replace only this test-owned marker.
      writeFileSync(lock, foreignAttempt);
      let result: RunResult;
      try {
        result = await pending;
        expect(result).toMatchObject({
          status,
          history: 'RECORDED',
          lock: 'RELEASE_FAILED',
        });
        expect(result.code).toBe(code);
        expect(readFileSync(lock, 'utf8')).toBe(foreignAttempt);
        expect(
          await reconcileRecorded(
            { profileFile: workspace.profileFile, attemptId: result.attemptId },
            recorder,
          ),
        ).toMatchObject({ status: 'FAILED', code: 'RUN_LOCKED' });
      } finally {
        // Model explicit operator clearance after quiescence; never delete another marker.
        if (readFileSync(lock, 'utf8') === foreignAttempt) unlinkSync(lock);
      }
      const recovered = await reconcileRecorded(
        { profileFile: workspace.profileFile, attemptId: result!.attemptId },
        recorder,
      );
      expect(recovered).toMatchObject({
        status,
        history: 'RECORDED',
        attemptId: result!.attemptId,
      });
      expect(recovered.code).toBe(code);
    },
  );
});
