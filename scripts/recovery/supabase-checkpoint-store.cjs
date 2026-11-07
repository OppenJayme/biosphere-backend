'use strict';
// Owned synthetic process-recovery files only. No hosted destination or key custody.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {
  randomUUID,
  randomBytes,
  createHash,
  createCipheriv,
  createDecipheriv,
} = require('node:crypto');
const MAGIC = Buffer.from('BSPDUR01');
const MAX = 64 * 1024 ** 2;
const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const canonical = (p) => (process.platform === 'win32' ? p.toLowerCase() : p);
function fail(code) {
  throw Object.assign(new Error(code), { code, safeCode: code });
}
function check(ok, code) {
  if (!ok) fail(code);
}
function readFile(root, name, max, missing) {
  const file = path.join(root, name);
  let fd;
  try {
    const before = fs.lstatSync(file);
    check(
      before.isFile() &&
        !before.isSymbolicLink() &&
        before.nlink === 1 &&
        before.size <= max,
      'CHECKPOINT_UNSAFE_FILE',
    );
    if (process.platform !== 'win32')
      check((before.mode & 0o077) === 0, 'CHECKPOINT_UNSAFE_PERMISSIONS');
    fd = fs.openSync(
      file,
      fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0),
    );
    const stat = fs.fstatSync(fd);
    check(
      stat.isFile() &&
        stat.dev === before.dev &&
        stat.ino === before.ino &&
        stat.size === before.size,
      'CHECKPOINT_FILE_CHANGED',
    );
    const bytes = Buffer.alloc(stat.size + 1);
    let used = 0,
      count;
    while (
      used < bytes.length &&
      (count = fs.readSync(fd, bytes, used, bytes.length - used, null)) > 0
    )
      used += count;
    check(
      used === stat.size && fs.fstatSync(fd).size === stat.size,
      'CHECKPOINT_FILE_CHANGED',
    );
    return bytes.subarray(0, used);
  } catch (error) {
    if (error.safeCode) throw error;
    if (error.code === 'ENOENT') fail(missing);
    fail('CHECKPOINT_FILE_UNAVAILABLE');
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}
function writeFile(root, name, bytes) {
  let fd;
  try {
    check(
      canonical(fs.realpathSync(root)) === canonical(path.resolve(root)),
      'CHECKPOINT_UNSAFE_ROOT',
    );
    fd = fs.openSync(path.join(root, name), 'wx', 0o600);
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
  } catch (error) {
    if (error.safeCode) throw error;
    fail(
      error.code === 'EEXIST'
        ? 'CHECKPOINT_ALREADY_EXISTS'
        : 'CHECKPOINT_WRITE_FAILED',
    );
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}
function json(bytes, code) {
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch {
    fail(code);
  }
}
function rootMarker(root, kind) {
  let marker;
  try {
    const stat = fs.lstatSync(root);
    check(
      stat.isDirectory() &&
        !stat.isSymbolicLink() &&
        canonical(fs.realpathSync(root)) === canonical(path.resolve(root)),
      'CHECKPOINT_UNSAFE_ROOT',
    );
    if (process.platform !== 'win32')
      check((stat.mode & 0o077) === 0, 'CHECKPOINT_UNSAFE_PERMISSIONS');
    marker = json(
      readFile(root, '.owner.json', 1024, 'CHECKPOINT_OWNER_MISSING'),
      'CHECKPOINT_OWNER_INVALID',
    );
  } catch (error) {
    if (error.safeCode) throw error;
    fail('CHECKPOINT_UNSAFE_ROOT');
  }
  check(
    marker?.format === 'biosphere-private-platform-lab-v1' &&
      marker.kind === kind &&
      typeof marker.owner === 'string' &&
      UUID.test(marker.owner),
    'CHECKPOINT_OWNER_INVALID',
  );
  return marker;
}
function pair(checkpointDir, keyDir) {
  checkpointDir = path.resolve(checkpointDir);
  keyDir = path.resolve(keyDir);
  const a = rootMarker(checkpointDir, 'checkpoint'),
    b = rootMarker(keyDir, 'key');
  const nested = (a, b) =>
    canonical(a) === canonical(b) ||
    canonical(a).startsWith(canonical(b) + path.sep);
  check(
    !nested(checkpointDir, keyDir) && !nested(keyDir, checkpointDir),
    'CHECKPOINT_KEY_NOT_SEPARATE',
  );
  check(a.owner === b.owner, 'CHECKPOINT_OWNER_MISMATCH');
  return { checkpointDir, keyDir, owner: a.owner };
}
function createWorkspace() {
  const owner = randomUUID();
  const checkpointDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'biosphere-platform-checkpoints-'),
  );
  const keyDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'biosphere-platform-keys-'),
  );
  for (const [root, kind] of [
    [checkpointDir, 'checkpoint'],
    [keyDir, 'key'],
  ]) {
    if (process.platform !== 'win32') fs.chmodSync(root, 0o700);
    writeFile(
      root,
      '.owner.json',
      Buffer.from(
        JSON.stringify({
          format: 'biosphere-private-platform-lab-v1',
          owner,
          kind,
        }),
      ),
    );
  }
  return { checkpointDir, keyDir, owner };
}
function assertCaptureAvailable(checkpointDir, keyDir) {
  const p = pair(checkpointDir, keyDir);
  check(
    [p.checkpointDir, p.keyDir].every((root) =>
      fs.readdirSync(root).every((name) => name === '.owner.json'),
    ),
    'CHECKPOINT_ALREADY_EXISTS',
  );
  return p;
}
const sourceCount = (payload) =>
  payload?.format === 'biosphere-platform-fixture-v3' &&
  payload.application?.profile === 'biosphere-full-v1'
    ? 5
    : 4;
function saveCheckpoint(
  checkpointDir,
  keyDir,
  { payload, verification, source },
) {
  const p = assertCaptureAvailable(checkpointDir, keyDir);
  const lock = randomUUID(),
    artifactId = randomUUID();
  writeFile(p.checkpointDir, '.capture.lock', Buffer.from(lock));
  const key = randomBytes(32);
  let result, primary;
  try {
    check(
      source &&
        typeof source.owner === 'string' &&
        UUID.test(source.owner) &&
        Array.isArray(source.ids) &&
        source.ids.length === sourceCount(payload) &&
        new Set(source.ids).size === sourceCount(payload) &&
        source.ids.every(
          (id) => typeof id === 'string' && /^[a-f0-9]{64}$/.test(id),
        ),
      'CHECKPOINT_SOURCE_INVALID',
    );
    const proof = Buffer.from(JSON.stringify(verification));
    check(proof.length <= 16384, 'CHECKPOINT_VERIFICATION_TOO_LARGE');
    const body = Buffer.from(
      JSON.stringify({
        format: 'biosphere-durable-platform-v1',
        owner: p.owner,
        artifactId,
        source,
        verificationHash: sha(proof),
        payload,
      }),
    );
    check(body.length <= MAX - 36, 'CHECKPOINT_TOO_LARGE');
    const iv = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(MAGIC);
    const encrypted = Buffer.concat([
      MAGIC,
      iv,
      Buffer.alloc(16),
      cipher.update(body),
      cipher.final(),
    ]);
    cipher.getAuthTag().copy(encrypted, 20);
    writeFile(p.keyDir, 'recovery.key', key);
    writeFile(p.keyDir, 'recovery-verification.private.json', proof);
    writeFile(p.checkpointDir, 'checkpoint.bsp', encrypted);
    const receipt = {
      format: 'biosphere-durable-receipt-v1',
      owner: p.owner,
      artifactId,
      sha256: sha(encrypted),
      bytes: encrypted.length,
    };
    // Commit metadata is written last, after fsync of each complete data/key file.
    writeFile(
      p.checkpointDir,
      'checkpoint.json',
      Buffer.from(JSON.stringify(receipt)),
    );
    result = receipt;
  } catch (error) {
    primary = error;
  } finally {
    key.fill(0);
    try {
      const actual = readFile(
        p.checkpointDir,
        '.capture.lock',
        128,
        'CHECKPOINT_LOCK_MISSING',
      ).toString();
      check(actual === lock, 'CHECKPOINT_LOCK_CHANGED');
      fs.unlinkSync(path.join(p.checkpointDir, '.capture.lock'));
    } catch {
      // Preserve a known commit or primary failure; never delete a changed lock.
      if (primary) primary.cleanup = 'CHECKPOINT_LOCK_RELEASE_FAILED';
      else if (result) result = { ...result, lock: 'RELEASE_FAILED' };
      else
        primary = Object.assign(new Error('CHECKPOINT_LOCK_RELEASE_FAILED'), {
          code: 'CHECKPOINT_LOCK_RELEASE_FAILED',
          safeCode: 'CHECKPOINT_LOCK_RELEASE_FAILED',
        });
    }
  }
  if (primary) throw primary;
  return result;
}
function loadCheckpoint(checkpointDir, keyDir) {
  const p = pair(checkpointDir, keyDir);
  check(
    !fs.existsSync(path.join(p.checkpointDir, '.capture.lock')),
    'CHECKPOINT_CAPTURE_BUSY',
  );
  const receipt = json(
    readFile(
      p.checkpointDir,
      'checkpoint.json',
      2048,
      'CHECKPOINT_NOT_COMMITTED',
    ),
    'CHECKPOINT_RECEIPT_INVALID',
  );
  check(
    receipt?.format === 'biosphere-durable-receipt-v1' &&
      receipt.owner === p.owner &&
      typeof receipt.artifactId === 'string' &&
      UUID.test(receipt.artifactId) &&
      typeof receipt.sha256 === 'string' &&
      /^[a-f0-9]{64}$/.test(receipt.sha256) &&
      Number.isInteger(receipt.bytes) &&
      receipt.bytes >= 36 &&
      receipt.bytes <= MAX,
    'CHECKPOINT_RECEIPT_INVALID',
  );
  const bytes = readFile(
    p.checkpointDir,
    'checkpoint.bsp',
    MAX,
    'CHECKPOINT_DATA_MISSING',
  );
  check(
    bytes.length === receipt.bytes && sha(bytes) === receipt.sha256,
    'CHECKPOINT_HASH_MISMATCH',
  );
  const key = readFile(p.keyDir, 'recovery.key', 32, 'CHECKPOINT_KEY_MISSING');
  try {
    check(key.length === 32, 'CHECKPOINT_KEY_INVALID');
    check(bytes.subarray(0, 8).equals(MAGIC), 'CHECKPOINT_FORMAT_INVALID');
    let packet;
    try {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        key,
        bytes.subarray(8, 20),
      );
      decipher.setAAD(MAGIC);
      decipher.setAuthTag(bytes.subarray(20, 36));
      packet = JSON.parse(
        Buffer.concat([
          decipher.update(bytes.subarray(36)),
          decipher.final(),
        ]).toString('utf8'),
      );
    } catch {
      fail('CHECKPOINT_AUTHENTICATION_FAILED');
    }
    check(
      packet?.format === 'biosphere-durable-platform-v1' &&
        packet.owner === p.owner &&
        packet.artifactId === receipt.artifactId &&
        packet.source &&
        typeof packet.source.owner === 'string' &&
        UUID.test(packet.source.owner) &&
        Array.isArray(packet.source.ids) &&
        packet.source.ids.length === sourceCount(packet.payload) &&
        new Set(packet.source.ids).size === sourceCount(packet.payload) &&
        packet.source.ids.every(
          (id) => typeof id === 'string' && /^[a-f0-9]{64}$/.test(id),
        ),
      'CHECKPOINT_PACKET_INVALID',
    );
    const proof = readFile(
      p.keyDir,
      'recovery-verification.private.json',
      16384,
      'CHECKPOINT_VERIFICATION_MISSING',
    );
    check(
      sha(proof) === packet.verificationHash,
      'CHECKPOINT_VERIFICATION_CHANGED',
    );
    return {
      payload: packet.payload,
      verification: json(proof, 'CHECKPOINT_VERIFICATION_INVALID'),
      source: packet.source,
      artifactId: receipt.artifactId,
      sha256: receipt.sha256,
      bytes: receipt.bytes,
    };
  } finally {
    key.fill(0);
  }
}
module.exports = {
  createWorkspace,
  assertCaptureAvailable,
  saveCheckpoint,
  loadCheckpoint,
};
