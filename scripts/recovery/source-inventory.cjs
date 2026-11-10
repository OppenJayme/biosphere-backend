#!/usr/bin/env node
'use strict';
// Metadata-only command boundary. Trusted adapters must be supplied explicitly.
// Never loads dotenv, constructs a connection, exports rows or downloads objects.
const BUCKETS = Object.freeze([
  'user-avatars',
  'specimen-media',
  'exhibit-media',
  'inquiry-attachments',
  'ar-assets',
]);
const TABLES = Object.freeze([
  'public.specimen',
  'public.user_account',
  'auth.users',
  'auth.identities',
  'storage.buckets',
  'storage.objects',
]);
function stop(code) {
  throw Object.assign(new Error(code), { safeCode: code });
}
function check(value, code = 'SOURCE_INVENTORY_METADATA_INVALID') {
  if (!value) stop(code);
}
async function bounded(operation) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              Object.assign(new Error('timeout'), {
                safeCode: 'SOURCE_INVENTORY_TIMEOUT',
              }),
            ),
          5000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
function bytes(value) {
  check(typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value));
  const result = Number(value);
  check(Number.isSafeInteger(result));
  return result;
}
async function inspectSource(adapters) {
  check(
    adapters &&
      typeof adapters.database?.query === 'function' &&
      typeof adapters.storage?.listBuckets === 'function' &&
      typeof adapters.storage?.listObjects === 'function',
    'SOURCE_INVENTORY_ADAPTER_REQUIRED',
  );
  check(
    typeof adapters.expectedDatabase === 'string' &&
      /^[a-z][a-z0-9_]{0,62}$/.test(adapters.expectedDatabase),
    'SOURCE_INVENTORY_CONFIGURATION_INVALID',
  );
  const db = adapters.database;
  let begun = false;
  let database;
  try {
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    begun = true;
    await db.query(
      "SET LOCAL statement_timeout = '5s'; SET LOCAL lock_timeout = '1s'",
    );
    const { rows } = await db.query(`SELECT current_database() AS name,
      current_setting('server_version_num') AS version,
      current_setting('transaction_read_only') AS read_only,
      pg_database_size(current_database())::text AS physical_bytes`);
    check(
      rows.length === 1 && rows[0].name === adapters.expectedDatabase,
      'SOURCE_INVENTORY_SOURCE_MISMATCH',
    );
    check(rows[0].read_only === 'on', 'SOURCE_INVENTORY_READ_ONLY_REQUIRED');
    const schemas = await db.query(`SELECT nspname FROM pg_namespace
      WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema'`);
    const tables = await db.query(`SELECT n.nspname || '.' || c.relname AS name
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind IN ('r', 'p') AND n.nspname IN ('public', 'auth', 'storage')`);
    check(
      TABLES.every((name) => tables.rows.some((row) => row.name === name)),
      'SOURCE_INVENTORY_SCOPE_MISMATCH',
    );
    const extensions = await db.query(
      'SELECT count(*)::text AS count FROM pg_extension',
    );
    database = {
      serverVersionNumber: bytes(rows[0].version),
      physicalBytes: bytes(rows[0].physical_bytes),
      requiredTablesPresent: TABLES.length,
      scopedTables: tables.rows.length,
      extraSchemas: schemas.rows.filter(
        (row) => !['public', 'auth', 'storage'].includes(row.nspname),
      ).length,
      extensions: bytes(extensions.rows[0].count),
    };
  } finally {
    // Roll back even successful read-only inspection; never own/close the adapter.
    if (begun) await db.query('ROLLBACK');
  }
  const listed = await bounded(() => adapters.storage.listBuckets());
  check(Array.isArray(listed) && listed.length <= 1000);
  const bucketIds = listed.map((bucket) => bucket?.id);
  check(
    bucketIds.every((id) => typeof id === 'string') &&
      new Set(bucketIds).size === bucketIds.length,
  );
  check(
    BUCKETS.every((id) => bucketIds.includes(id)),
    'SOURCE_INVENTORY_SCOPE_MISMATCH',
  );
  const summary = {
    buckets: BUCKETS.length,
    extraBuckets: listed.length - BUCKETS.length,
    objects: 0,
    declaredObjectBytes: 0,
    unknownSizeObjects: 0,
  };
  const deadline = Date.now() + 30000;
  for (const bucketId of BUCKETS) {
    let cursor = null;
    const cursors = new Set();
    const keys = new Set();
    let pages = 0;
    do {
      check(
        Date.now() < deadline && ++pages <= 1000,
        'SOURCE_INVENTORY_LIMIT_EXCEEDED',
      );
      const page = await bounded(() =>
        adapters.storage.listObjects({ bucketId, cursor, pageSize: 1000 }),
      );
      check(
        page &&
          Array.isArray(page.objects) &&
          page.objects.length <= 1000 &&
          (page.nextCursor === null ||
            (typeof page.nextCursor === 'string' &&
              page.nextCursor.length > 0 &&
              page.nextCursor.length <= 4096)),
      );
      for (const object of page.objects) {
        check(
          typeof object?.key === 'string' &&
            object.key.length > 0 &&
            object.key.length <= 1024 &&
            !keys.has(object.key),
        );
        keys.add(object.key);
        check(++summary.objects <= 100000, 'SOURCE_INVENTORY_LIMIT_EXCEEDED');
        if (object.sizeBytes === null) summary.unknownSizeObjects++;
        else {
          check(
            Number.isSafeInteger(object.sizeBytes) && object.sizeBytes >= 0,
          );
          summary.declaredObjectBytes += object.sizeBytes;
          check(Number.isSafeInteger(summary.declaredObjectBytes));
        }
      }
      cursor = page.nextCursor;
      if (cursor !== null) {
        check(!cursors.has(cursor), 'SOURCE_INVENTORY_PAGINATION_INVALID');
        cursors.add(cursor);
      }
    } while (cursor !== null);
  }
  return {
    code: 'SOURCE_INVENTORY_RECORDED',
    databaseNameMatched: true,
    sourceIdentityVerified: false,
    database,
    storage: summary,
    sizeBasis: 'DATABASE_PHYSICAL_AND_OBJECT_DECLARED_METADATA',
    scopeComplete: database.extraSchemas === 0 && summary.extraBuckets === 0,
    objectBytesVerified: false,
    checkpointSizeMeasured: false,
    consistentCaptureVerified: false,
    completeBackup: false,
    deploymentAuthorized: false,
  };
}
async function runInventory(argv, adapters) {
  if (
    Array.isArray(argv) &&
    (argv.length === 0 ||
      (argv.length === 1 && ['help', 'plan'].includes(argv[0])))
  ) {
    return {
      code: 'SOURCE_INVENTORY_PLAN',
      adapterRequired: true,
      defaultNetworkAccess: false,
      deploymentAuthorized: false,
    };
  }
  if (!Array.isArray(argv) || argv.length !== 1 || argv[0] !== 'inspect')
    return {
      code: 'SOURCE_INVENTORY_ARGUMENTS_INVALID',
      deploymentAuthorized: false,
    };
  try {
    return await inspectSource(adapters);
  } catch (error) {
    const allowed = new Set([
      'SOURCE_INVENTORY_METADATA_INVALID',
      'SOURCE_INVENTORY_TIMEOUT',
      'SOURCE_INVENTORY_ADAPTER_REQUIRED',
      'SOURCE_INVENTORY_CONFIGURATION_INVALID',
      'SOURCE_INVENTORY_SOURCE_MISMATCH',
      'SOURCE_INVENTORY_READ_ONLY_REQUIRED',
      'SOURCE_INVENTORY_SCOPE_MISMATCH',
      'SOURCE_INVENTORY_LIMIT_EXCEEDED',
      'SOURCE_INVENTORY_PAGINATION_INVALID',
    ]);
    return {
      code: allowed.has(error?.safeCode)
        ? error.safeCode
        : 'SOURCE_INVENTORY_FAILED',
      completeBackup: false,
      deploymentAuthorized: false,
    };
  }
}
module.exports = { runInventory };
if (require.main === module) {
  runInventory(process.argv.slice(2)).then((result) => {
    process.stdout.write(JSON.stringify(result) + '\n');
    process.exitCode = result.code === 'SOURCE_INVENTORY_PLAN' ? 0 : 1;
  });
}
