'use strict';
// Offline metadata review only: never reads environment/config or contacts B2.
const fs = require('node:fs');
function exact(value, keys) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((k) => Object.hasOwn(value, k))
  );
}
function valid(record) {
  if (
    !exact(record, ['format', 'authorization', 'bucket']) ||
    record.format !== 'biosphere-b2-preflight-v1'
  )
    return false;
  const auth = record.authorization,
    bucket = record.bucket;
  if (
    !exact(auth, ['bucketRefs', 'namePrefix', 'capabilities', 'expiresAt']) ||
    !exact(bucket, [
      'bucketRef',
      'private',
      'retentionReadable',
      'objectLockEnabled',
      'mode',
      'retentionDays',
    ])
  )
    return false;
  const ref = (value) =>
    typeof value === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(value);
  const date = auth.expiresAt;
  if (
    typeof date !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(date) ||
    !Number.isFinite(Date.parse(date)) ||
    new Date(date).toISOString() !== date
  )
    return false;
  return (
    (auth.bucketRefs === null ||
      (Array.isArray(auth.bucketRefs) &&
        auth.bucketRefs.length <= 16 &&
        auth.bucketRefs.every(ref))) &&
    ref(bucket.bucketRef) &&
    typeof auth.namePrefix === 'string' &&
    auth.namePrefix.length <= 128 &&
    Array.isArray(auth.capabilities) &&
    auth.capabilities.length <= 32 &&
    new Set(auth.capabilities).size === auth.capabilities.length &&
    auth.capabilities.every(
      (c) => typeof c === 'string' && /^[a-zA-Z][a-zA-Z0-9]{0,63}$/.test(c),
    ) &&
    ['private', 'retentionReadable', 'objectLockEnabled'].every(
      (k) => typeof bucket[k] === 'boolean',
    ) &&
    (bucket.mode === null ||
      (typeof bucket.mode === 'string' && bucket.mode.length <= 32)) &&
    Number.isSafeInteger(bucket.retentionDays) &&
    bucket.retentionDays >= 0
  );
}
function publish(code, status, blockers = []) {
  process.stdout.write(
    JSON.stringify({
      code,
      providerVerified: false,
      deploymentAuthorized: false,
      blockers,
    }) + '\n',
  );
  process.exitCode = status;
}
function main() {
  if (process.argv.length !== 3 || process.argv[2] !== 'check') throw Error();
  const buffer = Buffer.alloc(16385);
  let length = 0;
  while (length < buffer.length) {
    const count = fs.readSync(0, buffer, length, buffer.length - length, null);
    if (!count) break;
    length += count;
  }
  if (length > 16384) throw Error();
  const record = JSON.parse(buffer.subarray(0, length).toString('utf8'));
  if (!valid(record)) throw Error();
  const blockers = [];
  const block = (condition, code) => {
    if (condition) blockers.push(code);
  };
  const required = [
    'listBuckets',
    'readBucketRetentions',
    'readFileRetentions',
    'readFiles',
    'writeFiles',
  ];
  const auth = record.authorization,
    bucket = record.bucket;
  block(!bucket.objectLockEnabled, 'OBJECT_LOCK_DISABLED');
  block(!bucket.private, 'BUCKET_NOT_PRIVATE');
  block(!bucket.retentionReadable, 'RETENTION_UNREADABLE');
  block(
    !['governance', 'compliance'].includes(bucket.mode),
    'RETENTION_MODE_MISSING',
  );
  block(bucket.retentionDays !== 1, 'TEST_RETENTION_OUT_OF_BOUNDS');
  block(
    !auth.bucketRefs || auth.bucketRefs.length !== 1,
    'KEY_NOT_SINGLE_BUCKET',
  );
  block(
    auth.bucketRefs?.length === 1 && auth.bucketRefs[0] !== bucket.bucketRef,
    'BUCKET_MISMATCH',
  );
  block(auth.namePrefix !== 'synthetic/', 'PREFIX_NOT_SYNTHETIC');
  block(
    required.some((c) => !auth.capabilities.includes(c)),
    'MISSING_KEY_CAPABILITIES',
  );
  block(
    auth.capabilities.some((c) => ![...required, 'listFiles'].includes(c)),
    'EXCESS_KEY_CAPABILITIES',
  );
  const remaining = Date.parse(auth.expiresAt) - Date.now();
  block(
    !Number.isFinite(remaining) || remaining <= 0 || remaining > 24 * 3600000,
    'KEY_EXPIRY_OUT_OF_BOUNDS',
  );
  if (blockers.length) return publish('B2_PREFLIGHT_BLOCKED', 1, blockers);
  return publish('B2_METADATA_CONSISTENT_FOR_MANUAL_REVIEW', 0);
}
try {
  main();
} catch {
  publish('B2_METADATA_INVALID', 2);
}
