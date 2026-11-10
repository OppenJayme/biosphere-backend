'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  runConfiguredInventory,
} = require('../scripts/recovery/source-inventory-connection.cjs');
const project = 'abcdefghijklmnopqrst';
const args = [
  'inspect',
  '--project-ref',
  project,
  '--authorization-ref',
  'synthetic-read-only-approval',
];
const environment = () => ({
  BIOSPHERE_INVENTORY_DATABASE_URL: `postgresql://inventory:synthetic-password@db.${project}.supabase.co:5432/postgres`,
  BIOSPHERE_INVENTORY_STORAGE_API_KEY: 'synthetic-api-key-value',
  BIOSPHERE_INVENTORY_STORAGE_BEARER: 'synthetic.synthetic.synthetic',
});

test('default plan does not read credentials or construct transports', async () => {
  const unexpected = () => {
    throw new Error('transport-must-not-run');
  };
  const result = await runConfiguredInventory([], {
    environment: new Proxy({}, { get: unexpected }),
    createClient: unexpected,
    request: unexpected,
  });
  assert.deepEqual(result, {
    code: 'SOURCE_CONNECTION_PLAN',
    connectionEnabled: false,
    exportsEnabled: false,
    deploymentAuthorized: false,
  });
});

test('rejects a different project host before database or Storage access', async () => {
  const input = environment();
  input.BIOSPHERE_INVENTORY_DATABASE_URL =
    'postgresql://inventory:private-canary@db.zyxwvutsrqponmlkjihg.supabase.co:5432/postgres';
  const result = await runConfiguredInventory(args, {
    environment: input,
    createClient: () => {
      throw new Error('database-must-not-run');
    },
    request: () => {
      throw new Error('http-must-not-run');
    },
  });
  assert.equal(result.code, 'SOURCE_CONNECTION_CONFIGURATION_INVALID');
  assert.doesNotMatch(JSON.stringify(result), /canary|supabase\.co|password/);
});

test('rejects unsafe connection options, mismatched pooler identity and missing authorization before I/O', async () => {
  const invalidUrls = [
    `postgresql://inventory:private-canary@db.${project}.supabase.co:5432/postgres?sslmode=disable`,
    `postgresql://inventory:private-canary@db.${project}.supabase.co:6543/postgres`,
    'postgresql://inventory.wrong-project:private-canary@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres',
    'postgresql://inventory:private-canary@127.0.0.1:5432/postgres',
    `postgresql://inventory:private-canary@db.${project}.supabase.co:5432/other_database`,
  ];
  for (const value of invalidUrls) {
    const result = await runConfiguredInventory(args, {
      environment: {
        ...environment(),
        BIOSPHERE_INVENTORY_DATABASE_URL: value,
      },
      createClient: () => {
        throw new Error('must-not-open');
      },
    });
    assert.equal(result.code, 'SOURCE_CONNECTION_CONFIGURATION_INVALID');
    assert.doesNotMatch(JSON.stringify(result), /canary/);
  }
  assert.equal(
    (
      await runConfiguredInventory(args.slice(0, 3), {
        get environment() {
          throw new Error('must-not-read');
        },
      })
    ).code,
    'SOURCE_CONNECTION_ARGUMENTS_INVALID',
  );
});

test('refuses injected TLS/debug runtime settings and invalid secret header values without printing them', async () => {
  for (const change of [
    { NODE_TLS_REJECT_UNAUTHORIZED: '0' },
    { NODE_OPTIONS: '--require private-canary' },
    {
      BIOSPHERE_INVENTORY_STORAGE_API_KEY: 'private-canary\r\nInjected: value',
    },
    { BIOSPHERE_INVENTORY_STORAGE_BEARER: 'not-a-token-private-canary' },
    {
      BIOSPHERE_INVENTORY_DATABASE_CA_PEM:
        '-----BEGIN PRIVATE KEY-----private-canary',
    },
  ]) {
    const result = await runConfiguredInventory(args, {
      environment: { ...environment(), ...change },
      createClient: () => {
        throw new Error('must-not-open');
      },
    });
    assert.notEqual(result.code, 'SOURCE_INVENTORY_RECORDED');
    assert.doesNotMatch(JSON.stringify(result), /canary|Injected|PRIVATE KEY/);
  }
});
