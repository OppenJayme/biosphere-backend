const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');

test(
  'a fresh process restores BioSphere schema, linked records and five private buckets through real APIs',
  {
    skip: process.env.RUN_SUPABASE_LAB !== 'true',
    timeout: 900000,
  },
  async () => {
    const run = async (args) => {
      if (args[0].startsWith('biosphere-')) {
        const deadline = Date.now() + 60000;
        // Wait only before creating resources. Never retry a failed restore.
        while (os.freemem() < (3584 + 128) * 1024 ** 2 && Date.now() < deadline)
          await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      const result = spawnSync(
        process.execPath,
        [
          '--max-old-space-size=128',
          '--max-semi-space-size=16',
          path.resolve(__dirname, '../scripts/recovery/supabase-lab.cjs'),
          ...args,
        ],
        {
          windowsHide: true,
          encoding: 'utf8',
          timeout: 400000,
          env: {
            ...process.env,
            DATABASE_URL: 'postgresql://invalid:invalid@127.0.0.1:1/wrong',
            SUPABASE_URL: 'https://example.invalid',
            HTTP_PROXY: 'http://127.0.0.1:1',
          },
        },
      );
      assert.equal(result.error, undefined);
      assert.equal(result.status, 0, result.stdout + result.stderr);
      return { pid: result.pid, body: JSON.parse(result.stdout) };
    };
    const workspace = (await run(['checkpoint-init'])).body;
    const args = [
      '--checkpoints',
      workspace.checkpointDir,
      '--keys',
      workspace.keyDir,
    ];
    const source = await run(['biosphere-capture', ...args]);
    assert.equal(source.body.status, 'CAPTURED_DURABLE');
    assert.equal(source.body.profile, 'biosphere-full-v1');
    assert.equal(source.body.cleanup, 'COMPLETE');
    const target = await run(['biosphere-restore', ...args]);
    assert.notEqual(source.pid, target.pid);
    assert.equal(target.body.artifactId, source.body.artifactId);
    assert.equal(target.body.sha256, source.body.sha256);
    assert.equal(target.body.source, 'CAPTURE_RESOURCES_ABSENT');
    assert.equal(target.body.publicData, 'CONTENT_AND_RELATIONSHIPS_PRESERVED');
    assert.equal(target.body.migrations, 'APPLIED_AND_VERIFIED');
    assert.deepEqual(target.body.buckets, [
      'user-avatars',
      'specimen-media',
      'exhibit-media',
      'inquiry-attachments',
      'ar-assets',
    ]);
    assert.equal(target.body.application, 'PROTECTED_HTTP_VERIFIED');
    assert.equal(target.body.applicationUnauthorized, 'DENIED');
    assert.equal(target.body.applicationWrongIdentity, 'REJECTED');
    assert.equal(target.body.applicationMedia, 'SIGNED_BYTES_PRESERVED');
    assert.equal(target.body.sourceAccess, 'REJECTED');
    assert.equal(target.body.sourceRefresh, 'REJECTED');
    assert.equal(target.body.foreignKeys, 'ENFORCED');
    assert.equal(target.body.cleanup, 'COMPLETE');
  },
);
