import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { isolatedProcessEnvironment } from './disposable-faq-postgres';

/** Run the unchanged operational entry point from an empty cwd: dotenv cannot load workspace .env. */
export function runFaqCleanup(connectionString?: string, args: string[] = []) {
  const root = resolve(__dirname, '../..');
  const cwd = mkdtempSync(join(tmpdir(), 'biosphere-faq-cleanup-'));
  try {
    const result = spawnSync(
      process.execPath,
      [
        '-r',
        resolve(root, 'node_modules/ts-node/register/transpile-only'),
        resolve(root, 'scripts/purge-expired-faq-review.ts'),
        ...args,
      ],
      {
        cwd,
        encoding: 'utf8',
        timeout: 30000,
        env: {
          ...isolatedProcessEnvironment(),
          TS_NODE_PROJECT: resolve(root, 'tsconfig.json'),
          ...(connectionString
            ? { FAQ_REVIEW_CLEANUP_DATABASE_URL: connectionString }
            : {}),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    if (result.error)
      throw new Error(
        'Disposable FAQ cleanup subprocess failed; command details suppressed.',
      );
    return {
      status: result.status,
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim(),
    };
  } finally {
    rmdirSync(cwd);
  }
}
