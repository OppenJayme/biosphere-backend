/** Worker guard helpers without Docker or a database: build stamp, missing-container code, server identity. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  writeStamp,
  stampStatus,
} = require('../scripts/recovery/build-stamp.cjs');
const {
  dockerFailureCode,
  serverMatches,
} = require('../scripts/recovery/worker.cjs');

function checkout() {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'biosphere-worker-stamp-'),
  );
  fs.mkdirSync(path.join(root, 'src', 'backup'), { recursive: true });
  fs.mkdirSync(path.join(root, 'dist'));
  fs.writeFileSync(
    path.join(root, 'src', 'backup', 'service.ts'),
    'export const a = 1;\n',
  );
  fs.writeFileSync(
    path.join(root, 'src', 'backup', 'service.spec.ts'),
    'it();\n',
  );
  return root;
}

test('a build is current until compiled source changes', (t) => {
  const root = checkout();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.equal(stampStatus(root), 'MISSING');
  writeStamp(root);
  assert.equal(stampStatus(root), 'CURRENT');
  fs.writeFileSync(
    path.join(root, 'src', 'backup', 'service.spec.ts'),
    'it(2);\n',
  );
  assert.equal(stampStatus(root), 'CURRENT');
  fs.writeFileSync(
    path.join(root, 'src', 'backup', 'service.ts'),
    'export const a = 2;\n',
  );
  assert.equal(stampStatus(root), 'STALE');
  writeStamp(root);
  fs.writeFileSync(path.join(root, 'src', 'backup', 'new.ts'), '');
  assert.equal(stampStatus(root), 'STALE');
});

test('a malformed stamp is treated as missing, not current', (t) => {
  const root = checkout();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(
    path.join(root, 'dist', '.recovery-worker-build.json'),
    '{"source":1}',
  );
  assert.equal(stampStatus(root), 'MISSING');
});

test('a removed container gets its own code; other Docker failures stay generic', () => {
  const missing = 'WORKER_HISTORY_CONTAINER_MISSING';
  assert.equal(
    dockerFailureCode('Error: No such object: 0123abcd', missing),
    missing,
  );
  assert.equal(
    dockerFailureCode(
      'Error response from daemon: No such container: x',
      missing,
    ),
    missing,
  );
  assert.equal(
    dockerFailureCode('Cannot connect to the Docker daemon', missing),
    'WORKER_DOCKER_UNAVAILABLE',
  );
  assert.equal(
    dockerFailureCode('Error: No such object: x', undefined),
    'WORKER_DOCKER_UNAVAILABLE',
  );
});

test('only the inspected container address on 5432 counts as the history server', () => {
  const expected = { addresses: ['172.17.0.3'] };
  assert.equal(
    serverMatches({ address: '172.17.0.3', port: 5432 }, expected),
    true,
  );
  assert.equal(
    serverMatches({ address: '127.0.0.1', port: 5432 }, expected),
    false,
  );
  assert.equal(
    serverMatches({ address: '172.17.0.4', port: 5432 }, expected),
    false,
  );
  assert.equal(
    serverMatches({ address: '172.17.0.3', port: 5433 }, expected),
    false,
  );
  assert.equal(serverMatches({ address: null, port: 5432 }, expected), false);
  assert.equal(serverMatches(undefined, expected), false);
});
