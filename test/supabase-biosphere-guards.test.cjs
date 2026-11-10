const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  createWorkspace,
  saveCheckpoint,
} = require('../scripts/recovery/supabase-checkpoint-store.cjs');
const { images } = require('../scripts/recovery/supabase-lab-images.json');
const { guardCheckout } = require('./support/supabase-guard-checkout.cjs');

test('a real capture still refuses a checkout .env after the service-free checks', () => {
  const w = createWorkspace();
  const child = spawnSync(
    process.execPath,
    [
      '--max-old-space-size=128',
      '--max-semi-space-size=16',
      path.join(guardCheckout(), 'scripts/recovery/supabase-lab.cjs'),
      'biosphere-capture',
      '--checkpoints',
      w.checkpointDir,
      '--keys',
      w.keyDir,
    ],
    { encoding: 'utf8', windowsHide: true, timeout: 30000 },
  );
  assert.equal(child.status, 1);
  const report = JSON.parse(child.stdout);
  assert.equal(report.code, 'LAB_CHECKOUT_MUST_NOT_HAVE_ENV');
  assert.equal(report.resourcesCreated, 0);
  assert.equal(report.cleanup, 'COMPLETE');
});

test('full recovery requires the bounded parent runtime before creating services', () => {
  require('../scripts/recovery/worker-build.cjs').verifyBuild();
  const w = createWorkspace();
  const result = spawnSync(
    process.execPath,
    [
      path.join(guardCheckout(), 'scripts/recovery/supabase-lab.cjs'),
      'biosphere-capture',
      '--checkpoints',
      w.checkpointDir,
      '--keys',
      w.keyDir,
    ],
    {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 10000,
      env: {
        ...process.env,
        PATH: path.join(
          require('node:os').tmpdir(),
          'biosphere-no-docker-tools',
        ),
      },
    },
  );
  assert.equal(result.status, 1);
  const body = JSON.parse(result.stdout);
  assert.equal(body.code, 'LAB_NODE_BUDGET_REQUIRED');
  assert.equal(body.resourcesCreated, 0);
  assert.equal(body.cleanup, 'COMPLETE');
});

test('full recovery refuses incompatible release metadata before Docker or target creation', () => {
  require('../scripts/recovery/worker-build.cjs').verifyBuild();
  const w = createWorkspace();
  const payload = {
    format: 'biosphere-platform-fixture-v3',
    images,
    schema: 'a'.repeat(64),
    baseline: '{}',
    rows: '{}',
    dump: Buffer.from('PGDMPsynthetic').toString('base64'),
    objects: Buffer.from('synthetic').toString('base64'),
    application: {
      profile: 'biosphere-full-v1',
      migrationsHash: '0'.repeat(64),
      bucketRulesHash: '0'.repeat(64),
      publicDataHash: '0'.repeat(64),
      applicationBuildHash: '0'.repeat(64),
      settingsHash: '0'.repeat(64),
    },
  };
  saveCheckpoint(w.checkpointDir, w.keyDir, {
    payload,
    verification: {
      email: 'lab-00000000-0000-4000-8000-000000000001@example.invalid',
      userPassword: 'a'.repeat(32),
      userId: '00000000-0000-4000-8000-000000000001',
      bucket: 'specimen-media',
      bytes:
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=',
      sourceAccessToken: 'aaa.bbb.ccc',
      sourceRefreshToken: 'synthetic',
      sourceSigningKeyHash: 'e'.repeat(64),
    },
    source: {
      owner: '00000000-0000-4000-8000-000000000001',
      ids: (payload.format === 'biosphere-platform-fixture-v3'
        ? ['a', 'b', 'c', 'd', 'e']
        : ['a', 'b', 'c', 'd']
      ).map((c) => c.repeat(64)),
    },
  });
  const child = spawnSync(
    process.execPath,
    [
      path.join(guardCheckout(), 'scripts/recovery/supabase-lab.cjs'),
      'biosphere-restore',
      '--checkpoints',
      w.checkpointDir,
      '--keys',
      w.keyDir,
    ],
    { encoding: 'utf8', windowsHide: true, timeout: 10000 },
  );
  assert.equal(child.status, 1);
  assert.equal(child.stderr, '');
  const result = JSON.parse(child.stdout);
  assert.equal(result.code, 'APPLICATION_RELEASE_MISMATCH');
  assert.equal(result.resourcesCreated, 0);
  assert.equal(result.cleanup, 'COMPLETE');
});

for (const mode of ['checkpoint-restore', 'biosphere-restore']) {
  test(`${mode} refuses a checkpoint from the other profile before creating resources`, () => {
    const workspace = createWorkspace();
    const fullPacket = mode === 'checkpoint-restore';
    const payload = {
      format: fullPacket
        ? 'biosphere-platform-fixture-v3'
        : 'biosphere-platform-fixture-v2',
      images,
      schema: 'a'.repeat(64),
      baseline: '{}',
      rows: '{}',
      dump: Buffer.from('PGDMPsynthetic').toString('base64'),
      objects: Buffer.from('synthetic').toString('base64'),
      ...(fullPacket
        ? {
            application: {
              profile: 'biosphere-full-v1',
              migrationsHash: 'b'.repeat(64),
              bucketRulesHash: 'c'.repeat(64),
              publicDataHash: 'd'.repeat(64),
              applicationBuildHash: 'e'.repeat(64),
              settingsHash: 'f'.repeat(64),
            },
          }
        : {}),
    };
    saveCheckpoint(workspace.checkpointDir, workspace.keyDir, {
      payload,
      verification: { synthetic: true },
      source: {
        owner: '00000000-0000-4000-8000-000000000001',
        ids: (payload.format === 'biosphere-platform-fixture-v3'
          ? ['a', 'b', 'c', 'd', 'e']
          : ['a', 'b', 'c', 'd']
        ).map((c) => c.repeat(64)),
      },
    });
    const result = spawnSync(
      process.execPath,
      [
        path.join(guardCheckout(), 'scripts/recovery/supabase-lab.cjs'),
        mode,
        '--checkpoints',
        workspace.checkpointDir,
        '--keys',
        workspace.keyDir,
      ],
      { encoding: 'utf8', windowsHide: true, timeout: 10000 },
    );
    assert.equal(result.status, 1);
    assert.equal(result.stderr, '');
    const body = JSON.parse(result.stdout);
    assert.equal(body.code, 'PLATFORM_PACKET_INVALID');
    assert.equal(body.resourcesCreated, 0);
    assert.equal(body.cleanup, 'COMPLETE');
  });
}
