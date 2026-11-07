const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const {
  createWorkspace,
  saveCheckpoint,
} = require('../scripts/recovery/supabase-checkpoint-store.cjs');

for (const [name, code] of [
  ['missing', 'CHECKPOINT_KEY_MISSING'],
  ['wrong', 'CHECKPOINT_AUTHENTICATION_FAILED'],
  ['corrupted', 'CHECKPOINT_HASH_MISMATCH'],
]) {
  test(`${name} key/checkpoint is refused by the real CLI before Docker or target creation`, () => {
    const w = createWorkspace();
    saveCheckpoint(w.checkpointDir, w.keyDir, {
      payload: { sample: 'synthetic' },
      verification: { sample: 'synthetic' },
      source: {
        owner: '00000000-0000-4000-8000-000000000001',
        ids: ['a', 'b', 'c', 'd'].map((c) => c.repeat(64)),
      },
    });
    const key = path.join(w.keyDir, 'recovery.key'),
      data = path.join(w.checkpointDir, 'checkpoint.bsp');
    if (name === 'missing') fs.unlinkSync(key);
    if (name === 'wrong') fs.writeFileSync(key, Buffer.alloc(32, 7));
    if (name === 'corrupted') {
      const bytes = fs.readFileSync(data);
      bytes[bytes.length - 1] ^= 1;
      fs.writeFileSync(data, bytes);
    }
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([key]) =>
        [
          'systemroot',
          'windir',
          'comspec',
          'pathext',
          'temp',
          'tmp',
          'userprofile',
          'appdata',
          'localappdata',
          'programfiles',
          'programdata',
        ].includes(key.toLowerCase()),
      ),
    );
    env.PATH = path.join(os.tmpdir(), 'biosphere-no-docker-tools');
    const child = spawnSync(
      process.execPath,
      [
        path.resolve(__dirname, '../scripts/recovery/supabase-lab.cjs'),
        'checkpoint-restore',
        '--checkpoints',
        w.checkpointDir,
        '--keys',
        w.keyDir,
      ],
      { env, encoding: 'utf8', windowsHide: true, timeout: 10000 },
    );
    assert.equal(child.status, 1);
    assert.equal(child.stderr, '');
    const result = JSON.parse(child.stdout);
    assert.equal(result.code, code);
    assert.equal(result.phase, 'checkpoint-files');
    assert.equal(result.resourcesCreated, 0);
    assert.equal(result.cleanup, 'COMPLETE');
  });
}
