/** Accepted-write/lost-response recovery only on an owned, disposable target. */
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import {
  DisposableFaqPostgres,
  isolatedProcessEnvironment,
} from './support/disposable-faq-postgres';
import {
  createOfflineSyncDatabaseApp,
  seedOfflineSyncDatabase,
  OFFLINE_CURATOR,
} from './support/offline-sync-database-app';
import { startOfflineRecoveryAdapter } from './support/offline-recovery-adapter';

it('recovers a committed draft after its tab closes and retries the same ID without duplicate writes', async () => {
  const database = await DisposableFaqPostgres.start('offline-sync');
  let app: Awaited<ReturnType<typeof createOfflineSyncDatabaseApp>> | undefined;
  let adapter:
    Awaited<ReturnType<typeof startOfflineRecoveryAdapter>> | undefined;
  try {
    await database.createRole('service_role');
    await seedOfflineSyncDatabase(database.admin);
    app = await createOfflineSyncDatabaseApp(database.url('service_role'));
    adapter = await startOfflineRecoveryAdapter(await app.getUrl());
    // Independent denial control: not a browser intercept and not a valid fixture draft.
    const denied = await fetch(
      `${adapter.origin}/api/offline/specimen-drafts`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      },
    );
    expect(denied.status).toBe(400);
    expect(adapter.snapshot().forwarded).toBe(0);
    const report = await new Promise<string>((done, reject) => {
      const child = spawn(
        process.execPath,
        [
          resolve(
            __dirname,
            '../../biosphere-frontend/tools/browser/offline-recovery.mjs',
          ),
        ],
        {
          env: {
            ...isolatedProcessEnvironment(),
            RUN_OFFLINE_RECOVERY: 'true',
          },
          shell: false,
          windowsHide: true,
          timeout: 120000,
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      );
      let output = '';
      child.stdout.on('data', (chunk: Buffer) => {
        output = (output + chunk.toString()).slice(-8000);
      });
      child.stderr.on('data', (chunk: Buffer) => {
        output = (output + chunk.toString()).slice(-8000);
      });
      child.once('error', reject);
      child.once('close', (code) =>
        code === 0
          ? done(output)
          : reject(
              new Error(`Owned recovery browser failed (${code}): ${output}`),
            ),
      );
      child.stdin.end(JSON.stringify({ origin: adapter!.origin }));
    });
    expect(report).toContain('OFFLINE_RECOVERY_OK');
    const observed = adapter.snapshot();
    expect(observed).toMatchObject({
      forwarded: 2,
      denied: 1,
      committed: true,
      firstClosed: true,
      holdExpired: false,
      retryAlreadySynchronized: true,
    });
    expect(observed.clientDraftId).toMatch(/^[a-f0-9-]{36}$/);
    const rows = await database.admin
      .query(`SELECT s.id, s.common_name, s.scientific_name,
      s.remarks, s.status, s.public_display_allowed AS public_display, s.created_by, r.client_draft_id,
      (SELECT count(*)::int FROM specimen) AS specimens,
      (SELECT count(*)::int FROM offline_draft_sync) AS receipts,
      (SELECT count(*)::int FROM audit_log) AS total_audits,
      (SELECT count(*)::int FROM audit_log WHERE action = 'SYNC_OFFLINE_SPECIMEN_DRAFT' AND status = 'SUCCESS') AS audits
      FROM specimen s JOIN offline_draft_sync r ON r.specimen_id = s.id`);
    expect(rows.rows).toEqual([
      {
        id: observed.specimenId,
        common_name: 'TEST Owned Lost Response',
        scientific_name: 'Testus recoverus',
        remarks: 'Synthetic recovery fixture only',
        status: 'UNCATALOGED',
        public_display: false,
        created_by: OFFLINE_CURATOR,
        client_draft_id: observed.clientDraftId,
        specimens: 1,
        receipts: 1,
        total_audits: 1,
        audits: 1,
      },
    ]);
  } finally {
    try {
      await adapter?.close();
    } finally {
      try {
        await app?.close();
      } finally {
        await database.close();
      }
    }
  }
});
