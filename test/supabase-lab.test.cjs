const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const enabled = process.env.RUN_SUPABASE_LAB === 'true';
const env = {
  ...process.env,
  DATABASE_URL: 'postgresql://synthetic:synthetic@127.0.0.1:1/wrong',
  SUPABASE_URL: 'https://example.invalid',
  SUPABASE_SERVICE_ROLE_KEY: 'synthetic-invalid',
  DOCKER_HOST: 'tcp://127.0.0.1:1',
  HTTP_PROXY: 'http://127.0.0.1:1',
};
test(
  'restored Auth and private Storage remain usable with every source service stopped',
  { skip: !enabled, timeout: 540000 },
  () => {
    const result = spawnSync(
      process.execPath,
      [path.join(__dirname, '../scripts/recovery/supabase-lab.cjs'), 'recover'],
      {
        encoding: 'utf8',
        timeout: 520000,
        windowsHide: true,
        env,
      },
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const evidence = JSON.parse(result.stdout);
    assert.equal(evidence.recovery, 'RESTORED_API_VERIFIED');
    assert.equal(evidence.source, 'STOPPED_AND_DISCONNECTED');
    assert.equal(evidence.identity, 'PRESERVED');
    assert.equal(evidence.sourceAccess, 'REJECTED');
    assert.equal(evidence.sourceRefresh, 'REJECTED');
    assert.equal(evidence.foreignKeys, 'ENFORCED');
    assert.equal(evidence.privateBytes, 'PRESERVED');
    assert.equal(evidence.anonymous, 'DENIED');
    assert.deepEqual(evidence.anonymousDenial, {
      status: 400,
      statusCode: '404',
      error: 'not_found',
      message: 'Object not found',
    });
    assert.equal(evidence.integrity, 'TAMPER_REJECTED_BEFORE_RESTORE');
    assert.equal(evidence.cleanup, 'COMPLETE');
  },
);

test(
  'synthetic user signs in and reads private uploaded bytes while anonymous access is denied',
  { skip: !enabled, timeout: 480000 },
  () => {
    const result = spawnSync(
      process.execPath,
      [path.join(__dirname, '../scripts/recovery/supabase-lab.cjs'), 'smoke'],
      {
        encoding: 'utf8',
        timeout: 460000,
        windowsHide: true,
        env,
      },
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const evidence = JSON.parse(result.stdout);
    assert.equal(evidence.containment, 'PASS');
    assert.equal(evidence.auth, 'PASSWORD_AND_IDENTITY_VERIFIED');
    assert.equal(evidence.storage, 'PRIVATE_BYTES_VERIFIED');
    assert.equal(evidence.anonymous, 'DENIED');
    assert.deepEqual(evidence.anonymousDenial, {
      status: 400,
      statusCode: '404',
      error: 'not_found',
      message: 'Object not found',
    });
    assert.equal(evidence.cleanup, 'COMPLETE');
  },
);
test(
  'owned lab blocks outbound HTTP while the outside counter remains reachable',
  { skip: !enabled, timeout: 180000 },
  () => {
    const result = spawnSync(
      process.execPath,
      [
        path.join(__dirname, '../scripts/recovery/supabase-lab.cjs'),
        'containment',
      ],
      {
        encoding: 'utf8',
        timeout: 170000,
        windowsHide: true,
        env,
      },
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const evidence = JSON.parse(result.stdout);
    assert.equal(evidence.containment, 'PASS');
    assert.equal(evidence.outsideControlHits, 1);
    assert.equal(evidence.blockedAttemptHits, 0);
    assert.equal(evidence.cleanup, 'COMPLETE');
  },
);
