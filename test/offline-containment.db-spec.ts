/** Preflight only: no draft creation, interrupted requests or accepted specimen writes. */
import { startOfflineContainmentAdapter } from './support/offline-containment-adapter';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { createServer } from 'node:http';
import {
  DisposableFaqPostgres,
  isolatedProcessEnvironment,
} from './support/disposable-faq-postgres';
import {
  createOfflineSyncDatabaseApp,
  seedOfflineSyncDatabase,
} from './support/offline-sync-database-app';

async function startBackendCounter() {
  let arrivals = 0;
  const server = createServer((request, response) => {
    arrivals++;
    request.resume();
    response.writeHead(204).end();
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing counter binding');
  return {
    origin: `http://127.0.0.1:${address.port}`,
    arrivals: () => arrivals,
    close: () =>
      new Promise<void>((done, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : done()));
      }),
  };
}

describe('Offline containment adapter', () => {
  it('rejects writes without relying on browser interception or contacting its backend', async () => {
    const counter = await startBackendCounter();
    const adapter = await startOfflineContainmentAdapter(counter.origin);
    try {
      const response = await fetch(
        `${adapter.origin}/api/offline/specimen-drafts`,
        {
          method: 'POST',
          body: '{}',
        },
      );
      expect(response.status).toBe(403);
      expect(adapter.snapshot()).toEqual({ denied: 1, backendReads: 0 });
      expect(counter.arrivals()).toBe(0);
    } finally {
      try {
        await adapter.close();
      } finally {
        await counter.close();
      }
    }
  });

  it('denies credentials, foreign origins and target overrides before backend reads', async () => {
    const counter = await startBackendCounter();
    const adapter = await startOfflineContainmentAdapter(counter.origin);
    try {
      const rejectedHeaders: Record<string, string>[] = [
        { Authorization: '' },
        { Cookie: '' },
        { Origin: 'https://synthetic.invalid' },
      ];
      for (const headers of rejectedHeaders) {
        expect(
          (await fetch(`${adapter.origin}/fixture/backend-check`, { headers }))
            .status,
        ).toBe(403);
      }
      expect(
        (
          await fetch(
            `${adapter.origin}/fixture/backend-check?target=http://127.0.0.1:3001`,
          )
        ).status,
      ).toBe(404);
      expect(adapter.snapshot()).toEqual({ denied: 4, backendReads: 0 });
      expect(counter.arrivals()).toBe(0);
    } finally {
      try {
        await adapter.close();
      } finally {
        await counter.close();
      }
    }
  });

  it('mounts the real offline panel with owned SQL/Nest reads and independently counted blocked traffic', async () => {
    const database = await DisposableFaqPostgres.start('offline-sync');
    let app:
      Awaited<ReturnType<typeof createOfflineSyncDatabaseApp>> | undefined;
    let adapter:
      Awaited<ReturnType<typeof startOfflineContainmentAdapter>> | undefined;
    try {
      await database.createRole('service_role');
      await seedOfflineSyncDatabase(database.admin);
      app = await createOfflineSyncDatabaseApp(database.url('service_role'));
      adapter = await startOfflineContainmentAdapter(await app.getUrl());
      // Bypass all browser interception: the independent adapter must still refuse a write.
      expect(
        (
          await fetch(`${adapter.origin}/api/offline/specimen-drafts`, {
            method: 'POST',
            body: '{}',
          })
        ).status,
      ).toBe(403);
      const runner = resolve(
        __dirname,
        '../../biosphere-frontend/tools/browser/offline-containment.mjs',
      );
      const report = await new Promise<string>((resolveRun, reject) => {
        const child = spawn(process.execPath, [runner], {
          env: {
            ...isolatedProcessEnvironment(),
            RUN_OFFLINE_CONTAINMENT: 'true',
          },
          windowsHide: true,
          shell: false,
          timeout: 90000,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
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
            ? resolveRun(output)
            : reject(
                new Error(`Containment browser failed (${code}): ${output}`),
              ),
        );
        child.stdin.end(JSON.stringify({ origin: adapter!.origin }));
      });
      expect(report).toContain('OFFLINE_CONTAINMENT_OK');
      expect(adapter.snapshot()).toEqual({ denied: 1, backendReads: 1 });
      // Safety postcondition on this owned DB, not a general application acceptance assertion.
      const rows = await database.admin.query(`SELECT
        (SELECT count(*)::int FROM specimen) AS specimens,
        (SELECT count(*)::int FROM offline_draft_sync) AS receipts,
        (SELECT count(*)::int FROM audit_log) AS audits`);
      expect(rows.rows).toEqual([{ specimens: 0, receipts: 0, audits: 0 }]);
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
});
