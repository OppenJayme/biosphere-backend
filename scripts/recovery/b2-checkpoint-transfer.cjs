'use strict';
// Synthetic checkpoint transfer engine. An explicit trusted HTTP adapter is
// required. No CLI, environment credentials, default network adapter or schedule.
const fs = require('node:fs');
const path = require('node:path');
const {
  randomUUID,
  createHash,
  createHmac,
  hkdfSync,
  timingSafeEqual,
} = require('node:crypto');
const { loadCheckpoint } = require('./supabase-checkpoint-store.cjs');
const MAX = 64 * 1024 ** 2;
const RECEIPT = 'b2-transfer.private.json';
const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const BASE = [
  'listBuckets',
  'readBucketRetentions',
  'readFileRetentions',
  'readFiles',
];
const WRITER = [...BASE, 'writeFiles', 'writeFileRetentions'];
const TARGET_FIELDS = [
  'accountId',
  'bucketId',
  'bucketName',
  'runId',
  'namePrefix',
];
const digest = (bytes, algorithm = 'sha256') =>
  createHash(algorithm).update(bytes).digest('hex');
function fail(code) {
  throw Object.assign(new Error(code), { code, safeCode: code });
}
function check(ok, code = 'B2_TRANSFER_INVALID') {
  if (!ok) fail(code);
}
function root(dir) {
  check(typeof dir === 'string' && path.isAbsolute(dir));
  const stat = fs.lstatSync(dir);
  check(
    stat.isDirectory() &&
      !stat.isSymbolicLink() &&
      fs.realpathSync(dir) === path.resolve(dir),
    'B2_TRANSFER_UNSAFE_PATH',
  );
  if (process.platform !== 'win32')
    check((stat.mode & 0o077) === 0, 'B2_TRANSFER_UNSAFE_PATH');
  return dir;
}
function read(dir, name, max) {
  root(dir);
  const file = path.join(dir, name),
    before = fs.lstatSync(file, { bigint: true });
  let fd;
  check(
    before.isFile() &&
      !before.isSymbolicLink() &&
      before.nlink === 1n &&
      before.size > 0n &&
      before.size <= BigInt(max),
    'B2_TRANSFER_UNSAFE_FILE',
  );
  if (process.platform !== 'win32')
    check((before.mode & 0o077n) === 0n, 'B2_TRANSFER_UNSAFE_FILE');
  try {
    fd = fs.openSync(
      file,
      fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0),
    );
    const stat = fs.fstatSync(fd, { bigint: true });
    const differentDevice =
      stat.dev !== before.dev &&
      (process.platform !== 'win32' || (stat.dev !== 0n && before.dev !== 0n));
    check(
      stat.isFile() &&
        !differentDevice &&
        stat.nlink === 1n &&
        stat.ino === before.ino &&
        stat.size === before.size,
      'B2_TRANSFER_FILE_CHANGED',
    );
    const bytes = Buffer.alloc(Number(stat.size) + 1);
    let used = 0,
      count;
    while (
      used < bytes.length &&
      (count = fs.readSync(fd, bytes, used, bytes.length - used, null)) > 0
    )
      used += count;
    check(
      BigInt(used) === stat.size &&
        fs.fstatSync(fd, { bigint: true }).size === stat.size,
      'B2_TRANSFER_FILE_CHANGED',
    );
    return bytes.subarray(0, used);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}
function writeNew(dir, name, bytes) {
  root(dir);
  const fd = fs.openSync(path.join(dir, name), 'wx', 0o600);
  try {
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}
function json(bytes) {
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch {
    fail('B2_TRANSFER_INVALID_JSON');
  }
}
function keyOwner(keyDir) {
  const marker = json(read(keyDir, '.owner.json', 1024));
  check(
    marker.format === 'biosphere-private-platform-lab-v1' &&
      marker.kind === 'key' &&
      typeof marker.owner === 'string' &&
      UUID.test(marker.owner),
  );
  return marker.owner;
}
function mac(keyDir, record) {
  const key = read(keyDir, 'recovery.key', 32);
  let derived;
  try {
    check(key.length === 32, 'B2_TRANSFER_KEY_INVALID');
    derived = Buffer.from(
      hkdfSync(
        'sha256',
        key,
        Buffer.from(record.owner),
        'biosphere-b2-transfer-receipt-v1',
        32,
      ),
    );
    return createHmac('sha256', derived)
      .update(JSON.stringify({ ...record, mac: undefined }))
      .digest('hex');
  } finally {
    key.fill(0);
    if (derived) derived.fill(0);
  }
}
function saveReceipt(keyDir, record, create = false) {
  const bytes = Buffer.from(
    JSON.stringify({ ...record, mac: mac(keyDir, record) }),
  );
  if (create) {
    try {
      writeNew(keyDir, RECEIPT, bytes);
    } catch (error) {
      if (error.code === 'EEXIST') fail('B2_TRANSFER_ALREADY_ATTEMPTED');
      throw error;
    }
  } else {
    read(keyDir, RECEIPT, 16384);
    const temp = RECEIPT + '.' + randomUUID() + '.tmp';
    writeNew(keyDir, temp, bytes);
    fs.renameSync(path.join(keyDir, temp), path.join(keyDir, RECEIPT));
  }
}
function getReceipt(keyDir) {
  const record = json(read(keyDir, RECEIPT, 16384));
  check(
    record.format === 'biosphere-b2-checkpoint-transfer-v1' &&
      record.owner === keyOwner(keyDir) &&
      typeof record.mac === 'string' &&
      /^[a-f0-9]{64}$/.test(record.mac),
    'B2_TRANSFER_RECEIPT_INVALID',
  );
  check(
    timingSafeEqual(
      Buffer.from(record.mac, 'hex'),
      Buffer.from(mac(keyDir, record), 'hex'),
    ),
    'B2_TRANSFER_RECEIPT_AUTHENTICATION_FAILED',
  );
  return record;
}
function sessionFor(options, writing) {
  const { target, session, request } = options;
  check(typeof request === 'function', 'B2_TRANSFER_ADAPTER_REQUIRED');
  check(
    target &&
      typeof target === 'object' &&
      !Array.isArray(target) &&
      Object.keys(target).length === TARGET_FIELDS.length &&
      Object.keys(target).every((name) => TARGET_FIELDS.includes(name)),
  );
  check(
    target &&
      typeof target.runId === 'string' &&
      UUID.test(target.runId) &&
      target.namePrefix === 'synthetic/retention-' + target.runId + '/',
  );
  for (const name of ['accountId', 'bucketId', 'bucketName'])
    check(
      typeof target[name] === 'string' &&
        /^[A-Za-z0-9_-]{1,128}$/.test(target[name]),
    );
  const api = session?.apiInfo?.storageApi,
    allowed = api?.allowed,
    caps = allowed?.capabilities;
  check(
    session?.accountId === target.accountId &&
      typeof session.authorizationToken === 'string' &&
      session.authorizationToken.length > 0 &&
      session.authorizationToken.length <= 8192 &&
      !/[\r\n]/.test(session.authorizationToken),
    'B2_TRANSFER_AUTHORIZATION_INVALID',
  );
  const left = session.applicationKeyExpirationTimestamp - Date.now();
  check(
    Number.isSafeInteger(session.applicationKeyExpirationTimestamp) &&
      left > 600000 &&
      left <= 21630000,
    'B2_TRANSFER_AUTHORIZATION_EXPIRED',
  );
  check(
    typeof api.apiUrl === 'string' &&
      /^https:\/\/api[0-9]+\.backblazeb2\.com\/?$/.test(api.apiUrl) &&
      typeof api.downloadUrl === 'string' &&
      /^https:\/\/f[0-9]+\.backblazeb2\.com\/?$/.test(api.downloadUrl),
    'B2_TRANSFER_ENDPOINT_INVALID',
  );
  check(
    Array.isArray(allowed.buckets) &&
      allowed.buckets.length === 1 &&
      allowed.buckets[0].id === target.bucketId &&
      allowed.buckets[0].name === target.bucketName &&
      allowed.namePrefix === target.namePrefix,
    'B2_TRANSFER_SCOPE_INVALID',
  );
  const profiles = writing ? [WRITER] : [BASE, WRITER];
  check(
    Array.isArray(caps) &&
      profiles.some(
        (profile) =>
          caps.length === profile.length &&
          new Set(caps).size === caps.length &&
          profile.every((c) => caps.includes(c)),
      ),
    'B2_TRANSFER_CAPABILITIES_INVALID',
  );
  return {
    api: api.apiUrl.replace(/\/$/, ''),
    download: api.downloadUrl.replace(/\/$/, ''),
    token: session.authorizationToken,
    target: Object.fromEntries(
      TARGET_FIELDS.map((name) => [name, target[name]]),
    ),
    request,
  };
}
async function http(
  context,
  url,
  method = 'POST',
  body,
  token = context.token,
  max = 65536,
  extraHeaders = {},
) {
  let response;
  const headers = { Authorization: token, ...extraHeaders };
  if (body !== undefined && !Buffer.isBuffer(body)) {
    body = JSON.stringify(body);
    headers['Content-Type'] = 'application/json';
  }
  try {
    response = await context.request({
      url,
      method,
      headers,
      body,
      timeoutMs: 20000,
      maxResponseBytes: max,
      followRedirects: false,
    });
  } catch {
    fail('B2_TRANSFER_HTTP_FAILED');
  }
  check(
    response?.status === 200 &&
      Buffer.isBuffer(response.body) &&
      response.body.length <= max,
    'B2_TRANSFER_HTTP_INVALID',
  );
  return response;
}
async function api(context, method, body) {
  return json(
    (await http(context, context.api + '/b2api/v4/' + method, 'POST', body))
      .body,
  );
}
async function bucketCheck(context) {
  const b = await api(context, 'b2_list_buckets', {
    accountId: context.target.accountId,
    bucketId: context.target.bucketId,
  });
  check(
    Array.isArray(b.buckets) && b.buckets.length === 1,
    'B2_TRANSFER_BUCKET_INVALID',
  );
  const entry = b.buckets[0],
    lock = entry.fileLockConfiguration;
  check(
    entry.accountId === context.target.accountId &&
      entry.bucketId === context.target.bucketId &&
      entry.bucketName === context.target.bucketName &&
      entry.bucketType === 'allPrivate' &&
      Array.isArray(entry.lifecycleRules) &&
      entry.lifecycleRules.length === 0,
    'B2_TRANSFER_BUCKET_INVALID',
  );
  check(
    lock?.isClientAuthorizedToRead === true &&
      lock.value?.isFileLockEnabled === true &&
      lock.value.defaultRetention?.mode === null &&
      lock.value.defaultRetention?.period === null,
    'B2_TRANSFER_RETENTION_INVALID',
  );
}
function uploadDestination(value, bucketId) {
  check(
    typeof value === 'string' && value.length <= 2048 && !/[\s\\]/.test(value),
    'B2_TRANSFER_ENDPOINT_INVALID',
  );
  let u;
  try {
    u = new URL(value);
  } catch {
    fail('B2_TRANSFER_ENDPOINT_INVALID');
  }
  check(
    u.protocol === 'https:' &&
      u.port === '' &&
      !u.username &&
      !u.password &&
      !u.hash &&
      /^pod-[0-9]+(?:-[0-9]+)*\.(?:backblaze|backblazeb2)\.com$/.test(
        u.hostname,
      ),
    'B2_TRANSFER_ENDPOINT_INVALID',
  );
  const base = '/b2api/v4/b2_upload_file';
  if (u.pathname === base) {
    const parts = u.search.slice(1).split('&');
    check(
      parts.length === 2 &&
        parts.every((p) => /^(cvt|bucket)=[A-Za-z0-9_-]{1,256}$/.test(p)) &&
        u.searchParams.getAll('bucket').length === 1 &&
        u.searchParams.getAll('cvt').length === 1 &&
        u.searchParams.get('bucket') === bucketId,
      'B2_TRANSFER_ENDPOINT_INVALID',
    );
  } else {
    const match = u.pathname.match(
      /^\/b2api\/v4\/b2_upload_file\/([A-Za-z0-9_-]{1,128})\/([A-Za-z0-9_-]{1,256})$/,
    );
    check(
      !u.search && match && match[1] === bucketId,
      'B2_TRANSFER_ENDPOINT_INVALID',
    );
  }
  return value;
}
function fileInfo(info, record) {
  check(
    info?.accountId === record.target.accountId &&
      info.bucketId === record.target.bucketId &&
      info.fileName === record.fileName &&
      info.action === 'upload' &&
      Number(info.contentLength) === record.checkpoint.bytes &&
      info.contentSha1 === record.sha1,
    'B2_TRANSFER_FILE_INVALID',
  );
  check(
    typeof info.fileId === 'string' &&
      /^[A-Za-z0-9_-]{1,256}$/.test(info.fileId) &&
      (!record.fileId || info.fileId === record.fileId),
    'B2_TRANSFER_VERSION_INVALID',
  );
  check(
    info.fileRetention?.isClientAuthorizedToRead === true &&
      info.fileRetention.value?.mode === 'governance' &&
      info.fileRetention.value.retainUntilTimestamp === record.retainUntil,
    'B2_TRANSFER_RETENTION_INVALID',
  );
}
async function download(context, record) {
  const info = await api(context, 'b2_get_file_info', {
    fileId: record.fileId,
  });
  fileInfo(info, record);
  const response = await http(
    context,
    context.download +
      '/b2api/v4/b2_download_file_by_id?fileId=' +
      encodeURIComponent(record.fileId),
    'GET',
    undefined,
    context.token,
    record.checkpoint.bytes,
  );
  const entries = Object.entries(response.headers ?? {}).filter(
    ([key]) => key.toLowerCase() === 'x-bz-file-id',
  );
  const ids =
    entries.length === 1
      ? Array.isArray(entries[0][1])
        ? entries[0][1]
        : [entries[0][1]]
      : [];
  check(
    ids.length === 1 && ids[0] === record.fileId,
    'B2_TRANSFER_VERSION_INVALID',
  );
  check(
    response.body.length === record.checkpoint.bytes &&
      digest(response.body) === record.checkpoint.sha256,
    'B2_TRANSFER_HASH_MISMATCH',
  );
  return response.body;
}
function safeError(error, uploadMayExist = false) {
  const code =
    typeof error?.safeCode === 'string' ? error.safeCode : 'B2_TRANSFER_FAILED';
  return Object.assign(new Error(code), {
    code,
    safeCode: code,
    uploadMayExist,
  });
}
async function publishCheckpoint(options) {
  let attempted = false,
    receiptFile;
  try {
    const { checkpointDir, keyDir } = options,
      owner = keyOwner(keyDir);
    receiptFile = path.join(keyDir, RECEIPT);
    if (fs.existsSync(receiptFile)) {
      attempted = true;
      fail('B2_TRANSFER_ALREADY_ATTEMPTED');
    }
    const loaded = loadCheckpoint(checkpointDir, keyDir);
    check(
      loaded.payload?.format === 'biosphere-platform-fixture-v3' &&
        loaded.payload.application?.profile === 'biosphere-full-v1',
      'B2_TRANSFER_SYNTHETIC_PROFILE_REQUIRED',
    );
    const bytes = read(checkpointDir, 'checkpoint.bsp', MAX);
    check(
      bytes.length === loaded.bytes && digest(bytes) === loaded.sha256,
      'B2_TRANSFER_HASH_MISMATCH',
    );
    const context = sessionFor(options, true);
    await bucketCheck(context);
    const url = await api(context, 'b2_get_upload_url', {
      bucketId: context.target.bucketId,
    });
    check(
      url.bucketId === context.target.bucketId,
      'B2_TRANSFER_SCOPE_INVALID',
    );
    uploadDestination(url.uploadUrl, context.target.bucketId);
    check(
      typeof url.authorizationToken === 'string' &&
        url.authorizationToken.length > 0 &&
        url.authorizationToken.length <= 8192 &&
        !/[\r\n]/.test(url.authorizationToken),
      'B2_TRANSFER_AUTHORIZATION_INVALID',
    );
    const record = {
      format: 'biosphere-b2-checkpoint-transfer-v1',
      owner,
      target: Object.fromEntries(
        TARGET_FIELDS.map((name) => [name, context.target[name]]),
      ),
      checkpoint: {
        format: 'biosphere-durable-receipt-v1',
        owner,
        artifactId: loaded.artifactId,
        sha256: loaded.sha256,
        bytes: loaded.bytes,
      },
      sha1: digest(bytes, 'sha1'),
      fileName:
        context.target.namePrefix + 'checkpoint-' + loaded.artifactId + '.bsp',
      retainUntil: Date.now() + 86400000,
      state: 'intent',
      fileId: null,
    };
    saveReceipt(keyDir, record, true);
    attempted = true;
    const response = await http(
      context,
      url.uploadUrl,
      'POST',
      bytes,
      url.authorizationToken,
      65536,
      {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(bytes.length),
        'X-Bz-File-Name': record.fileName
          .split('/')
          .map(encodeURIComponent)
          .join('/'),
        'X-Bz-Content-Sha1': record.sha1,
        'X-Bz-File-Retention-Mode': 'governance',
        'X-Bz-File-Retention-Retain-Until-Timestamp': String(
          record.retainUntil,
        ),
      },
    );
    const info = json(response.body);
    fileInfo(info, record);
    record.fileId = info.fileId;
    record.state = 'uploaded';
    saveReceipt(keyDir, record);
    await download(context, record);
    record.state = 'verified';
    saveReceipt(keyDir, record);
    return {
      code: 'B2_CHECKPOINT_PUBLISHED',
      encryptedBytes: bytes.length,
      uploadVerified: true,
      deploymentAuthorized: false,
    };
  } catch (error) {
    throw safeError(
      error,
      attempted || Boolean(receiptFile && fs.existsSync(receiptFile)),
    );
  }
}
async function recoverCheckpoint(options) {
  try {
    const { keyDir, destination } = options,
      record = getReceipt(keyDir);
    check(
      ['uploaded', 'verified'].includes(record.state) &&
        typeof record.fileId === 'string',
      'B2_TRANSFER_UPLOAD_UNRESOLVED',
    );
    check(
      typeof destination === 'string' && path.isAbsolute(destination),
      'B2_TRANSFER_UNSAFE_PATH',
    );
    root(path.dirname(destination));
    const relation = (a, b) => {
      const r = path.relative(a, b);
      return (
        r === '' ||
        (!r.startsWith('..' + path.sep) && r !== '..' && !path.isAbsolute(r))
      );
    };
    check(
      !relation(keyDir, destination) &&
        !relation(destination, keyDir) &&
        !fs.existsSync(destination),
      'B2_TRANSFER_TARGET_EXISTS',
    );
    const context = sessionFor(options, false);
    check(
      TARGET_FIELDS.every(
        (name) => context.target[name] === record.target[name],
      ),
      'B2_TRANSFER_SCOPE_INVALID',
    );
    await bucketCheck(context);
    const bytes = await download(context, record);
    fs.mkdirSync(destination, { mode: 0o700 });
    writeNew(
      destination,
      '.capture.lock',
      Buffer.from('b2-checkpoint-recovery-incomplete'),
    );
    const stage = fs.mkdtempSync(path.join(destination, '.stage-'));
    if (process.platform !== 'win32') fs.chmodSync(stage, 0o700);
    writeNew(
      stage,
      '.owner.json',
      Buffer.from(
        JSON.stringify({
          format: 'biosphere-private-platform-lab-v1',
          owner: record.owner,
          kind: 'checkpoint',
        }),
      ),
    );
    writeNew(stage, 'checkpoint.bsp', bytes);
    writeNew(
      stage,
      'checkpoint.json',
      Buffer.from(JSON.stringify(record.checkpoint)),
    );
    const loaded = loadCheckpoint(stage, keyDir);
    check(
      loaded.sha256 === record.checkpoint.sha256 &&
        loaded.artifactId === record.checkpoint.artifactId,
      'B2_TRANSFER_RECOVERY_INVALID',
    );
    for (const name of ['.owner.json', 'checkpoint.bsp', 'checkpoint.json'])
      fs.renameSync(path.join(stage, name), path.join(destination, name));
    fs.rmdirSync(stage);
    fs.unlinkSync(path.join(destination, '.capture.lock'));
    return {
      code: 'B2_CHECKPOINT_RECOVERED',
      encryptedBytes: bytes.length,
      checkpointValidated: true,
      deploymentAuthorized: false,
    };
  } catch (error) {
    throw safeError(error);
  }
}
module.exports = { publishCheckpoint, recoverCheckpoint };
