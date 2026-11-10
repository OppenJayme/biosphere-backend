const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

test(
  'a disk checkpoint restores real Auth and Storage after the capture process exits',
  {
    skip: process.env.RUN_SUPABASE_LAB !== 'true',
    timeout: 540000,
  },
  () => {
    function run(args) {
      const child = spawnSync(
        process.execPath,
        [
          path.resolve(__dirname, '../scripts/recovery/supabase-lab.cjs'),
          ...args,
        ],
        {
          encoding: 'utf8',
          windowsHide: true,
          timeout: 240000,
          env: {
            ...process.env,
            DATABASE_URL: 'postgresql://synthetic:synthetic@127.0.0.1:1/wrong',
            SUPABASE_URL: 'https://example.invalid',
            SUPABASE_SERVICE_ROLE_KEY: 'synthetic-invalid',
            DOCKER_HOST: 'tcp://127.0.0.1:1',
            HTTP_PROXY: 'http://127.0.0.1:1',
          },
        },
      );
      assert.equal(child.error, undefined);
      assert.equal(child.status, 0, child.stdout + child.stderr);
      return { pid: child.pid, body: JSON.parse(child.stdout) };
    }
    const initialized = run(['checkpoint-init']).body;
    const flags = [
      '--checkpoints',
      initialized.checkpointDir,
      '--keys',
      initialized.keyDir,
    ];
    const captured = run(['checkpoint-capture', ...flags]);
    assert.equal(captured.body.status, 'CAPTURED_DURABLE');
    assert.equal(captured.body.cleanup, 'COMPLETE');
    const restored = run(['checkpoint-restore', ...flags]);
    assert.equal(restored.body.recovery, 'RESTORED_API_VERIFIED');
    assert.equal(restored.body.integrity, 'AUTHENTICATED_BEFORE_TARGET');
    assert.equal(restored.body.source, 'CAPTURE_RESOURCES_ABSENT');
    assert.equal(restored.body.sourceAccess, 'REJECTED');
    assert.equal(restored.body.sourceRefresh, 'REJECTED');
    assert.equal(restored.body.identity, 'PRESERVED');
    assert.equal(restored.body.foreignKeys, 'ENFORCED');
    assert.equal(restored.body.privateBytes, 'PRESERVED');
    assert.equal(restored.body.anonymous, 'DENIED');
    assert.deepEqual(restored.body.anonymousDenial, {
      status: 400,
      statusCode: '404',
      error: 'not_found',
      message: 'Object not found',
    });
    assert.equal(restored.body.cleanup, 'COMPLETE');
    assert.equal(restored.body.artifactId, captured.body.artifactId);
    assert.equal(restored.body.sha256, captured.body.sha256);
    assert.notEqual(restored.pid, captured.pid);
  },
);
