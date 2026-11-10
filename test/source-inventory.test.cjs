'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { runInventory } = require('../scripts/recovery/source-inventory.cjs');
const command = path.resolve(
  __dirname,
  '../scripts/recovery/source-inventory.cjs',
);

test('default executable only prints a plan even when unrelated credential variables are set', () => {
  const result = spawnSync(process.execPath, [command], {
    env: {
      ...process.env,
      DATABASE_URL: 'postgresql://private-canary.invalid/unused',
      DIRECT_URL: 'postgresql://private-canary.invalid/unused',
      B2_APPLICATION_KEY: 'private-canary',
    },
    windowsHide: true,
    encoding: 'utf8',
    timeout: 10000,
  });
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.deepEqual(JSON.parse(result.stdout), {
    code: 'SOURCE_INVENTORY_PLAN',
    adapterRequired: true,
    defaultNetworkAccess: false,
    deploymentAuthorized: false,
  });
  assert.doesNotMatch(result.stdout, /canary/);
});

test('executable inspection has no built-in connection or credential fallback', () => {
  const result = spawnSync(process.execPath, [command, 'inspect'], {
    windowsHide: true,
    encoding: 'utf8',
    timeout: 10000,
  });
  assert.equal(result.status, 1);
  assert.equal(result.stderr, '');
  assert.equal(
    JSON.parse(result.stdout).code,
    'SOURCE_INVENTORY_ADAPTER_REQUIRED',
  );
});

test('unsupported argument fails before touching supplied adapters', async () => {
  const result = await runInventory(['inspect', '--url', 'private-canary'], {
    get database() {
      throw new Error('must not inspect adapter');
    },
  });
  assert.equal(result.code, 'SOURCE_INVENTORY_ARGUMENTS_INVALID');
  assert.doesNotMatch(JSON.stringify(result), /canary/);
});
