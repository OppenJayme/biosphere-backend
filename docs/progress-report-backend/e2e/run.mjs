// Usage: node docs/progress-report-backend/e2e/run.mjs [suite-prefix ...]
// Requires harness/up.sh and harness/server.sh. Writes e2e/results.json.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertSafeTarget, db, here, results, save } from './lib.mjs';
import { resetDatabase, seedAccounts } from './seed.mjs';

const filter = process.argv.slice(2);
await assertSafeTarget();
await resetDatabase();
await seedAccounts();

const suites = readdirSync(join(here, 'suites'))
  .filter((name) => name.endsWith('.mjs'))
  .filter((name) => !filter.length || filter.some((prefix) => name.startsWith(prefix)))
  .sort();

for (const name of suites) {
  const started = Date.now();
  const before = results.length;
  try {
    const suite = await import(pathToFileURL(join(here, 'suites', name)).href);
    await suite.default();
  } catch (error) {
    results.push({
      id: `CRASH-${name}`,
      module: name,
      srs: [],
      op: name,
      kind: 'suite-crash',
      name: 'suite stopped early',
      expected: 'complete',
      actual: String(error?.stack ?? error).slice(0, 600),
      pass: false,
      note: null,
    });
    console.log(`CRASH ${name}: ${error?.stack ?? error}`);
  }
  const rows = results.slice(before);
  console.log(`${name}: ${rows.filter((r) => r.pass === true).length}/${rows.filter((r) => r.pass !== null).length} passed in ${Math.round((Date.now() - started) / 1000)}s`);
}

save(join(here, filter.length ? 'results.partial.json' : 'results.json'));
const failed = results.filter((r) => r.pass === false).length;
const passed = results.filter((r) => r.pass === true).length;
console.log(`TOTAL ${passed}/${passed + failed} passed, ${failed} failed, ${results.length - passed - failed} inconclusive`);
await db.end();
