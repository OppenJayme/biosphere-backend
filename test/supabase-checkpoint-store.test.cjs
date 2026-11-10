const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const {
  createWorkspace: createStoreWorkspace,
  saveCheckpoint,
} = require('../scripts/recovery/supabase-checkpoint-store.cjs');
const {
  loadCheckpoint,
} = require('../scripts/recovery/supabase-checkpoint-store.cjs');

function ownedWorkspace(t) {
  const workspace = createStoreWorkspace();
  const base = fs.realpathSync(os.tmpdir());
  t.after(() => {
    for (const [root, prefix, kind] of [
      [
        workspace.checkpointDir,
        'biosphere-platform-checkpoints-',
        'checkpoint',
      ],
      [workspace.keyDir, 'biosphere-platform-keys-', 'key'],
    ]) {
      const stat = fs.lstatSync(root);
      assert.ok(stat.isDirectory() && !stat.isSymbolicLink());
      const real = fs.realpathSync(root);
      assert.equal(path.dirname(real), base);
      assert.ok(path.basename(real).startsWith(prefix));
      const owner = JSON.parse(
        fs.readFileSync(path.join(real, '.owner.json'), 'utf8'),
      );
      assert.equal(owner.format, 'biosphere-private-platform-lab-v1');
      assert.equal(owner.owner, workspace.owner);
      assert.equal(owner.kind, kind);
      fs.rmSync(real, { recursive: true, force: true });
      assert.equal(fs.existsSync(real), false);
    }
  });
  return workspace;
}

test('full-profile checkpoints retain the SQL gateway as a fifth source resource', (t) => {
  const w = ownedWorkspace(t);
  const source = {
    owner: '00000000-0000-4000-8000-000000000001',
    ids: ['a', 'b', 'c', 'd', 'e'].map((c) => c.repeat(64)),
  };
  saveCheckpoint(w.checkpointDir, w.keyDir, {
    payload: {
      format: 'biosphere-platform-fixture-v3',
      application: { profile: 'biosphere-full-v1' },
    },
    verification: { synthetic: true },
    source,
  });
  assert.deepEqual(
    loadCheckpoint(w.checkpointDir, w.keyDir).source.ids,
    source.ids,
  );
});

test('full-profile checkpoints reject a source set missing its SQL gateway', (t) => {
  const w = ownedWorkspace(t);
  assert.throws(
    () =>
      saveCheckpoint(w.checkpointDir, w.keyDir, {
        payload: {
          format: 'biosphere-platform-fixture-v3',
          application: { profile: 'biosphere-full-v1' },
        },
        verification: { synthetic: true },
        source: {
          owner: '00000000-0000-4000-8000-000000000001',
          ids: ['a', 'b', 'c', 'd'].map((c) => c.repeat(64)),
        },
      }),
    { code: 'CHECKPOINT_SOURCE_INVALID' },
  );
});
function fixture(t) {
  const workspace = ownedWorkspace(t);
  const data = {
    payload: { sample: 'synthetic persistent payload' },
    verification: { sample: 'synthetic expected result' },
    source: {
      owner: '00000000-0000-4000-8000-000000000001',
      ids: ['a', 'b', 'c', 'd'].map((c) => c.repeat(64)),
    },
  };
  saveCheckpoint(workspace.checkpointDir, workspace.keyDir, data);
  return {
    ...workspace,
    data,
    key: path.join(workspace.keyDir, 'recovery.key'),
    receipt: path.join(workspace.checkpointDir, 'checkpoint.json'),
    file: path.join(workspace.checkpointDir, 'checkpoint.bsp'),
  };
}

test('source ownership must be a primitive UUID rather than a coercible array', (t) => {
  const workspace = ownedWorkspace(t);
  assert.throws(
    () =>
      saveCheckpoint(workspace.checkpointDir, workspace.keyDir, {
        payload: { sample: 'synthetic' },
        verification: { sample: 'synthetic' },
        source: {
          owner: ['00000000-0000-4000-8000-000000000001'],
          ids: ['a', 'b', 'c', 'd'].map((c) => c.repeat(64)),
        },
      }),
    { code: 'CHECKPOINT_SOURCE_INVALID' },
  );
});

test('a fresh process reads an encrypted disk checkpoint using a separately stored key', (t) => {
  const workspace = ownedWorkspace(t);
  assert.notEqual(workspace.checkpointDir, workspace.keyDir);
  const saved = saveCheckpoint(workspace.checkpointDir, workspace.keyDir, {
    payload: { sample: 'synthetic checkpoint content' },
    verification: { sample: 'synthetic verification' },
    source: {
      owner: '00000000-0000-4000-8000-000000000001',
      ids: ['a', 'b', 'c', 'd'].map((c) => c.repeat(64)),
    },
  });
  const child = spawnSync(
    process.execPath,
    [
      '-e',
      'const api=require(process.argv[1]); const x=api.loadCheckpoint(process.argv[2],process.argv[3]); console.log(JSON.stringify(x.payload));',
      path.resolve(
        __dirname,
        '../scripts/recovery/supabase-checkpoint-store.cjs',
      ),
      workspace.checkpointDir,
      workspace.keyDir,
    ],
    { encoding: 'utf8', windowsHide: true, timeout: 10000 },
  );
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout), {
    sample: 'synthetic checkpoint content',
  });
  assert.match(saved.sha256, /^[a-f0-9]{64}$/);
});

test('missing keys refuse recovery without consuming or changing the checkpoint', (t) => {
  const f = fixture(t),
    bytes = fs.readFileSync(f.file);
  fs.unlinkSync(f.key);
  assert.throws(() => loadCheckpoint(f.checkpointDir, f.keyDir), {
    code: 'CHECKPOINT_KEY_MISSING',
  });
  assert.deepEqual(fs.readFileSync(f.file), bytes);
});
test('a wrong same-length key fails authenticated decryption', (t) => {
  const f = fixture(t);
  fs.writeFileSync(f.key, Buffer.alloc(32, 7));
  assert.throws(() => loadCheckpoint(f.checkpointDir, f.keyDir), {
    code: 'CHECKPOINT_AUTHENTICATION_FAILED',
  });
});
test('ciphertext changes fail the committed checksum check', (t) => {
  const f = fixture(t),
    bytes = fs.readFileSync(f.file);
  bytes[bytes.length - 1] ^= 1;
  fs.writeFileSync(f.file, bytes);
  assert.throws(() => loadCheckpoint(f.checkpointDir, f.keyDir), {
    code: 'CHECKPOINT_HASH_MISMATCH',
  });
});
test('a rewritten checksum cannot authenticate corrupted ciphertext', (t) => {
  const f = fixture(t),
    bytes = fs.readFileSync(f.file);
  bytes[bytes.length - 1] ^= 1;
  fs.writeFileSync(f.file, bytes);
  const receipt = JSON.parse(fs.readFileSync(f.receipt, 'utf8'));
  receipt.sha256 = createHash('sha256').update(bytes).digest('hex');
  fs.writeFileSync(f.receipt, JSON.stringify(receipt));
  assert.throws(() => loadCheckpoint(f.checkpointDir, f.keyDir), {
    code: 'CHECKPOINT_AUTHENTICATION_FAILED',
  });
});
test('verification data is bound to the encrypted checkpoint', (t) => {
  const f = fixture(t);
  fs.writeFileSync(
    path.join(f.keyDir, 'recovery-verification.private.json'),
    JSON.stringify({ sample: 'different' }),
  );
  assert.throws(() => loadCheckpoint(f.checkpointDir, f.keyDir), {
    code: 'CHECKPOINT_VERIFICATION_CHANGED',
  });
});
test('a completed capture cannot overwrite its checkpoint or key', (t) => {
  const f = fixture(t),
    bytes = fs.readFileSync(f.file),
    key = fs.readFileSync(f.key);
  assert.throws(() => saveCheckpoint(f.checkpointDir, f.keyDir, f.data), {
    code: 'CHECKPOINT_ALREADY_EXISTS',
  });
  assert.deepEqual(fs.readFileSync(f.file), bytes);
  assert.deepEqual(fs.readFileSync(f.key), key);
});
test('files without final commit metadata are not a usable checkpoint', (t) => {
  const f = fixture(t);
  fs.unlinkSync(f.receipt);
  assert.throws(() => loadCheckpoint(f.checkpointDir, f.keyDir), {
    code: 'CHECKPOINT_NOT_COMMITTED',
  });
});
