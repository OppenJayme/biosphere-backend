#!/usr/bin/env node
/** Synthetic-only recovery prototype. No dotenv, URLs, hosted credentials or scheduler. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const {
  randomUUID,
  randomBytes,
  createHash,
  createCipheriv,
  createDecipheriv,
} = require('node:crypto');
const IMAGE =
  'postgres@sha256:eee6c6e1b0894fa4fe0075eb054af9fd1cf39a35321c2d4110626cfe506411fb';
const FORMAT = 'biosphere-synthetic-recovery-v1';
const DATABASE = 'biosphere_recovery_fixture';
const BUCKETS = [
  'ar-assets',
  'exhibit-media',
  'inquiry-attachments',
  'specimen-media',
  'user-avatars',
];
const MAGIC = Buffer.from('BSPREC01');
const MAX = 64 * 1024 * 1024;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HOST =
  process.platform === 'win32'
    ? 'npipe:////./pipe/dockerDesktopLinuxEngine'
    : 'unix:///var/run/docker.sock';
const ENV = Object.fromEntries(
  Object.entries(process.env).filter(([k]) =>
    [
      'path',
      'systemroot',
      'windir',
      'comspec',
      'pathext',
      'temp',
      'tmp',
      'userprofile',
      'localappdata',
      'appdata',
      'programfiles',
      'programdata',
    ].includes(k.toLowerCase()),
  ),
);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function fail(code) {
  const e = new Error(code);
  e.safeCode = code;
  throw e;
}
function check(ok, code) {
  if (!ok) fail(code);
}
function json(bytes) {
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch {
    fail('INVALID_JSON');
  }
}
function docker(args, input) {
  try {
    return execFileSync('docker', ['--host', HOST, ...args], {
      env: ENV,
      input,
      timeout: 60000,
      maxBuffer: MAX,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch {
    fail('DOCKER_OPERATION_FAILED');
  }
}
function sql(id, text) {
  return docker(
    [
      'exec',
      '-i',
      id,
      'psql',
      '-X',
      '-qAt',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'postgres',
      '-d',
      DATABASE,
    ],
    text,
  )
    .toString('utf8')
    .trim();
}
function quoteId(s) {
  return '"' + s.replaceAll('"', '""') + '"';
}
function canonicalPath(p) {
  return process.platform === 'win32' ? p.toLowerCase() : p;
}
function safePath(root, relative, allowMissing = false) {
  check(
    typeof relative === 'string' &&
      relative.length < 1024 &&
      !path.isAbsolute(relative) &&
      !relative.includes('\\'),
    'UNSAFE_PATH',
  );
  const parts = relative.split('/');
  for (const part of parts)
    check(
      /^[a-zA-Z0-9_. -]+$/.test(part) &&
        part !== '.' &&
        part !== '..' &&
        !/[. ]$/.test(part) &&
        !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part),
      'UNSAFE_PATH',
    );
  let result = root;
  for (const part of parts) {
    result = path.join(result, part);
    if (fs.existsSync(result))
      check(!fs.lstatSync(result).isSymbolicLink(), 'SYMLINK_REJECTED');
    else check(allowMissing, 'MISSING_FILE');
  }
  return result;
}
function readBounded(file) {
  const stat = fs.lstatSync(file);
  check(
    stat.isFile() && !stat.isSymbolicLink() && stat.size <= MAX,
    'INVALID_FILE',
  );
  return fs.readFileSync(file);
}
function loadProfile(file) {
  const absolute = path.resolve(file),
    root = path.dirname(absolute);
  check(
    canonicalPath(fs.realpathSync(root)) === canonicalPath(root),
    'SYMLINK_REJECTED',
  );
  check(!fs.lstatSync(absolute).isSymbolicLink(), 'SYMLINK_REJECTED');
  const p = json(readBounded(absolute));
  const keys = [
    'format',
    'owner',
    'sourceContainer',
    'targetContainer',
    'image',
    'operator',
  ];
  check(
    Object.keys(p).length === keys.length &&
      Object.keys(p).every((k) => keys.includes(k)),
    'INVALID_PROFILE',
  );
  check(
    p.format === FORMAT &&
      UUID.test(p.owner) &&
      p.operator === 'synthetic-rehearsal' &&
      p.image === IMAGE,
    'INVALID_PROFILE',
  );
  check(
    /^[a-f0-9]{64}$/.test(p.sourceContainer) &&
      /^[a-f0-9]{64}$/.test(p.targetContainer) &&
      p.sourceContainer !== p.targetContainer,
    'INVALID_TARGET',
  );
  check(
    readBounded(safePath(root, '.recovery-owner')).toString('utf8') === p.owner,
    'OWNERSHIP_MISMATCH',
  );
  return { ...p, root };
}
function owned(p, id) {
  const c = json(docker(['inspect', id]))[0];
  check(
    c.Id === id &&
      c.Config.Labels?.['biosphere.recovery.owner'] === p.owner &&
      c.State.Running,
    'CONTAINER_NOT_OWNED',
  );
  const image = json(docker(['image', 'inspect', IMAGE]))[0];
  check(
    c.Image === image.Id &&
      c.HostConfig.NetworkMode === 'none' &&
      Object.keys(c.HostConfig.PortBindings || {}).length === 0,
    'CONTAINMENT_REJECTED',
  );
  check(
    (c.Mounts || []).every((m) => m.Type === 'tmpfs') &&
      !(c.HostConfig.Binds || []).length,
    'CONTAINMENT_REJECTED',
  );
  check(
    sql(
      id,
      'SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()',
    ) === '0',
    'SOURCE_NOT_QUIESCENT',
  );
}
function schemaHash(id) {
  const bytes = docker([
    'exec',
    id,
    'pg_dump',
    '-U',
    'postgres',
    '-d',
    DATABASE,
    '--schema-only',
    '--no-owner',
  ]);
  // PostgreSQL randomizes psql \restrict guards; they are not schema content.
  let text = bytes.toString('utf8').replace(/^\\(?:un)?restrict .*\r?\n/gm, '');
  // PG17 reparses this existing migration's varchar-array coercion on restore.
  // Normalize only these two exact equivalent forms, never arbitrary CHECK text.
  text = text.replace(
    "CONSTRAINT faq_review_item_status_check CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'REVIEWED'::character varying, 'DISMISSED'::character varying])::text[])))",
    "CONSTRAINT faq_review_item_status_check CHECK (((status)::text = ANY (ARRAY[('PENDING'::character varying)::text, ('REVIEWED'::character varying)::text, ('DISMISSED'::character varying)::text])))",
  );
  return hash(text);
}
function databaseInventory(id) {
  const tables = json(
    Buffer.from(
      sql(
        id,
        "SELECT coalesce(json_agg(json_build_object('schema',n.nspname,'name',c.relname) ORDER BY n.nspname,c.relname),'[]') FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p') AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'",
      ),
    ),
  );
  // One bounded read-only psql session avoids a Docker process per table.
  const queries = tables.map(
    (t) =>
      `SELECT json_build_object('rows',coalesce((SELECT json_agg(r.line ORDER BY r.line COLLATE "C") FROM (SELECT row_to_json(t)::text AS line FROM ${quoteId(t.schema)}.${quoteId(t.name)} t) r),'[]'))`,
  );
  const rows = sql(
    id,
    "SET timezone='UTC'; BEGIN READ ONLY; " + queries.join(';') + '; ROLLBACK',
  )
    .split('\n')
    .filter(Boolean)
    .map((line) => json(Buffer.from(line)).rows);
  check(rows.length === tables.length, 'INVENTORY_FAILED');
  for (let n = 0; n < tables.length; n++) {
    tables[n].rows = rows[n].length;
    tables[n].sha256 = hash(rows[n].join('\n'));
  }
  const seqs = json(
    Buffer.from(
      sql(
        id,
        "SELECT coalesce(json_agg(json_build_object('schema',n.nspname,'name',c.relname) ORDER BY n.nspname,c.relname),'[]') FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='S' AND n.nspname NOT IN ('pg_catalog','information_schema')",
      ),
    ),
  );
  for (const s of seqs)
    s.value = sql(
      id,
      `SELECT last_value::text || ':' || is_called::text FROM ${quoteId(s.schema)}.${quoteId(s.name)}`,
    );
  return { schemaSha256: schemaHash(id), tables, sequences: seqs };
}
function fileEntry(root, relative) {
  const data = readBounded(safePath(root, relative));
  return {
    path: relative,
    bytes: data.length,
    sha256: hash(data),
    data: data.toString('base64'),
  };
}
function objects(root) {
  const dir = safePath(root, 'objects');
  check(
    JSON.stringify(fs.readdirSync(dir).sort()) === JSON.stringify(BUCKETS),
    'BUCKET_SCOPE_MISMATCH',
  );
  const result = [];
  function walk(relative) {
    const file = safePath(root, relative),
      stat = fs.lstatSync(file);
    if (stat.isDirectory())
      for (const name of fs.readdirSync(file).sort())
        walk(relative + '/' + name);
    else result.push(fileEntry(root, relative));
    check(result.length <= 1000, 'SIZE_LIMIT');
  }
  for (const bucket of BUCKETS) {
    check(
      fs.lstatSync(safePath(root, 'objects/' + bucket)).isDirectory(),
      'INVALID_BUCKET',
    );
    walk('objects/' + bucket);
  }
  return result;
}
function checkObjectReferences(id, files) {
  for (const name of [
    'public.specimen',
    'public.audit_log',
    'public._prisma_migrations',
    'auth.users',
    'auth.identities',
    'storage.buckets',
    'storage.objects',
  ])
    check(
      sql(id, `SELECT to_regclass('${name}') IS NOT NULL`) === 't',
      'REQUIRED_SCOPE_MISSING',
    );
  const buckets = json(
    Buffer.from(
      sql(
        id,
        'SELECT coalesce(json_agg(id ORDER BY id COLLATE "C"),\'[]\') FROM storage.buckets',
      ),
    ),
  );
  check(
    JSON.stringify(buckets) === JSON.stringify(BUCKETS),
    'BUCKET_SCOPE_MISMATCH',
  );
  const refs = json(
    Buffer.from(
      sql(
        id,
        "SELECT coalesce(json_agg('objects/'||bucket_id||'/'||name ORDER BY bucket_id COLLATE \"C\",name COLLATE \"C\"),'[]') FROM storage.objects",
      ),
    ),
  );
  check(
    JSON.stringify(refs) === JSON.stringify(files.map((f) => f.path).sort()),
    'OBJECT_REFERENCE_MISMATCH',
  );
}
function decodeEntry(e) {
  check(typeof e.data === 'string' && e.data.length <= MAX, 'INVALID_PAYLOAD');
  const b = Buffer.from(e.data, 'base64');
  check(
    Number.isSafeInteger(e.bytes) &&
      b.toString('base64') === e.data &&
      e.bytes === b.length &&
      hash(b) === e.sha256,
    'INTEGRITY_FAILED',
  );
  return b;
}
function seal(packet, key) {
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(MAGIC);
  const body = Buffer.from(JSON.stringify(packet));
  check(body.length + 36 <= MAX, 'SIZE_LIMIT');
  const encrypted = Buffer.concat([cipher.update(body), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), encrypted]);
}
function openPacket(file, key, p, snapshot) {
  const b = readBounded(file);
  check(b.length > 36 && b.subarray(0, 8).equals(MAGIC), 'INVALID_SNAPSHOT');
  let bytes;
  try {
    const d = createDecipheriv('aes-256-gcm', key, b.subarray(8, 20), {
      authTagLength: 16,
    });
    d.setAAD(MAGIC);
    d.setAuthTag(b.subarray(20, 36));
    bytes = Buffer.concat([d.update(b.subarray(36)), d.final()]);
  } catch {
    fail('AUTHENTICATION_FAILED');
  }
  const packet = json(bytes);
  bytes.fill(0);
  check(
    packet.format === FORMAT &&
      packet.owner === p.owner &&
      packet.snapshotId === snapshot &&
      packet.sourceContainer === p.sourceContainer &&
      packet.image === IMAGE,
    'SNAPSHOT_SCOPE_MISMATCH',
  );
  check(
    JSON.stringify(packet.buckets) === JSON.stringify(BUCKETS) &&
      Array.isArray(packet.files) &&
      packet.files.length <= 1000,
    'INVALID_PAYLOAD',
  );
  const names = new Set();
  for (const f of packet.files) {
    check(
      f.path.startsWith('objects/') &&
        BUCKETS.includes(f.path.split('/')[1]) &&
        !names.has(f.path),
      'INVALID_PAYLOAD',
    );
    safePath(p.root, f.path, true);
    names.add(f.path);
    decodeEntry(f);
  }
  decodeEntry(packet.database);
  decodeEntry(packet.configuration);
  return packet;
}
function verify(p, packet) {
  const actualDatabase = databaseInventory(p.targetContainer);
  check(
    actualDatabase.schemaSha256 === packet.inventory.schemaSha256,
    'SCHEMA_VERIFICATION_FAILED',
  );
  check(
    JSON.stringify(actualDatabase.tables) ===
      JSON.stringify(packet.inventory.tables),
    'TABLE_VERIFICATION_FAILED',
  );
  check(
    JSON.stringify(actualDatabase.sequences) ===
      JSON.stringify(packet.inventory.sequences),
    'SEQUENCE_VERIFICATION_FAILED',
  );
  const restored = safePath(p.root, 'restores/' + packet.snapshotId);
  const actual = objects(restored),
    expected = packet.files.map(({ path, bytes, sha256 }) => ({
      path,
      bytes,
      sha256,
    }));
  check(
    JSON.stringify(
      actual.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 })),
    ) === JSON.stringify(expected),
    'OBJECT_VERIFICATION_FAILED',
  );
  check(
    hash(readBounded(safePath(restored, 'configuration.json'))) ===
      packet.configuration.sha256,
    'CONFIG_VERIFICATION_FAILED',
  );
  checkObjectReferences(p.targetContainer, actual);
}
function execute(operation, p, snapshot, key) {
  // Recovery must work when the captured source is stopped or unavailable.
  if (operation === 'capture') owned(p, p.sourceContainer);
  owned(p, p.targetContainer);
  const snapshots = safePath(p.root, 'checkpoints', true);
  if (!fs.existsSync(snapshots)) fs.mkdirSync(snapshots, { mode: 0o700 });
  if (operation === 'capture') {
    const inventory = databaseInventory(p.sourceContainer),
      files = objects(p.root);
    checkObjectReferences(p.sourceContainer, files);
    const configuration = fileEntry(p.root, 'configuration.json');
    check(
      json(Buffer.from(configuration.data, 'base64')).mode === 'synthetic',
      'INVALID_CONFIG',
    );
    const db = docker([
      'exec',
      p.sourceContainer,
      'pg_dump',
      '-U',
      'postgres',
      '-d',
      DATABASE,
      '--format=custom',
      '--no-owner',
    ]);
    check(db.subarray(0, 5).toString() === 'PGDMP', 'EXPORT_FAILED');
    check(
      JSON.stringify(databaseInventory(p.sourceContainer)) ===
        JSON.stringify(inventory) &&
        JSON.stringify(objects(p.root)) === JSON.stringify(files),
      'SOURCE_CHANGED',
    );
    const packet = {
      format: FORMAT,
      owner: p.owner,
      snapshotId: snapshot,
      sourceContainer: p.sourceContainer,
      image: IMAGE,
      operator: p.operator,
      createdAt: new Date().toISOString(),
      buckets: BUCKETS,
      inventory,
      files,
      configuration,
      database: {
        bytes: db.length,
        sha256: hash(db),
        data: db.toString('base64'),
      },
    };
    const file = safePath(p.root, 'checkpoints/' + snapshot + '.bsp', true);
    const sealed = seal(packet, key);
    const fd = fs.openSync(file, 'wx', 0o600);
    try {
      fs.writeFileSync(fd, sealed);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    openPacket(file, key, p, snapshot);
    return {
      status: 'CAPTURED',
      snapshotId: snapshot,
      tables: inventory.tables.length,
      objects: files.length,
      coverage: 'synthetic-only',
    };
  }
  const packet = openPacket(
    safePath(p.root, 'checkpoints/' + snapshot + '.bsp'),
    key,
    p,
    snapshot,
  );
  if (operation === 'restore') {
    check(
      sql(
        p.targetContainer,
        "SELECT (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public') + (SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typtype IN ('e','d','c')) + (SELECT count(*) FROM pg_extension WHERE extname<>'plpgsql')",
      ) === '0',
      'TARGET_NOT_EMPTY',
    );
    check(
      sql(
        p.targetContainer,
        "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p','S','v','m','f') AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'",
      ) === '0',
      'TARGET_NOT_EMPTY',
    );
    check(
      sql(
        p.targetContainer,
        "SELECT count(*) FROM pg_namespace WHERE nspname NOT IN ('public','pg_catalog','information_schema') AND nspname NOT LIKE 'pg_toast%' AND nspname NOT LIKE 'pg_temp%'",
      ) === '0',
      'TARGET_NOT_EMPTY',
    );
    const parent = safePath(p.root, 'restores', true);
    if (!fs.existsSync(parent)) fs.mkdirSync(parent, { mode: 0o700 });
    const restored = safePath(p.root, 'restores/' + snapshot, true);
    try {
      fs.mkdirSync(restored, { mode: 0o700 });
    } catch (error) {
      if (error.code === 'EEXIST') fail('RESTORE_WORKSPACE_EXISTS');
      throw error;
    }
    for (const bucket of BUCKETS)
      fs.mkdirSync(path.join(restored, 'objects', bucket), {
        recursive: true,
        mode: 0o700,
      });
    for (const entry of packet.files) {
      const file = safePath(restored, entry.path, true);
      fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
      fs.writeFileSync(file, decodeEntry(entry), { flag: 'wx', mode: 0o600 });
    }
    fs.writeFileSync(
      path.join(restored, 'configuration.json'),
      decodeEntry(packet.configuration),
      { flag: 'wx', mode: 0o600 },
    );
    docker(
      [
        'exec',
        '-i',
        p.targetContainer,
        'pg_restore',
        '-U',
        'postgres',
        '-d',
        DATABASE,
        '--no-owner',
        '--clean',
        '--if-exists',
        '--single-transaction',
        '--exit-on-error',
      ],
      decodeEntry(packet.database),
    );
  }
  verify(p, packet);
  return {
    status: operation === 'restore' ? 'RESTORED_VERIFIED' : 'VERIFIED',
    snapshotId: snapshot,
    tables: packet.inventory.tables.length,
    objects: packet.files.length,
    coverage: 'synthetic-only',
  };
}
function main() {
  const args = process.argv.slice(2),
    operation = args.shift();
  if (operation === 'help' && args.length === 0) {
    console.log(
      JSON.stringify({
        usage:
          'capture --profile FILE | restore/verify --profile FILE --snapshot UUID',
        scope:
          'Owned network-disabled synthetic fixtures only; never production-ready',
      }),
    );
    return;
  }
  check(
    ['capture', 'restore', 'verify'].includes(operation),
    'INVALID_ARGUMENTS',
  );
  const flags = {};
  while (args.length) {
    const k = args.shift(),
      v = args.shift();
    check(
      ['--profile', '--snapshot'].includes(k) && v && !flags[k],
      'INVALID_ARGUMENTS',
    );
    flags[k] = v;
  }
  check(
    flags['--profile'] &&
      ((operation === 'capture' && !flags['--snapshot']) ||
        (operation !== 'capture' && UUID.test(flags['--snapshot']))),
    'INVALID_ARGUMENTS',
  );
  const p = loadProfile(flags['--profile']),
    snapshot = operation === 'capture' ? randomUUID() : flags['--snapshot'],
    attempt = randomUUID();
  const lock = safePath(p.root, '.recovery-lock', true),
    ledger = safePath(p.root, 'recovery-events.jsonl', true);
  let locked = false,
    key;
  function record(status, code) {
    fs.appendFileSync(
      ledger,
      JSON.stringify({
        attemptId: attempt,
        snapshotId: snapshot,
        operation,
        operator: p.operator,
        status,
        code: code || null,
        at: new Date().toISOString(),
      }) + '\n',
      { mode: 0o600 },
    );
  }
  try {
    try {
      fs.writeFileSync(lock, attempt, { flag: 'wx', mode: 0o600 });
      locked = true;
    } catch {
      fail('RUN_LOCKED');
    }
    record('IN_PROGRESS');
    key = readBounded(safePath(p.root, 'recovery.key'));
    check(key.length === 32, 'INVALID_KEY');
    const result = execute(operation, p, snapshot, key);
    record(result.status);
    console.log(JSON.stringify(result));
  } catch (e) {
    record('FAILED', e.safeCode || 'OPERATION_FAILED');
    throw e;
  } finally {
    key?.fill(0);
    if (locked && fs.readFileSync(lock, 'utf8') === attempt)
      fs.unlinkSync(lock);
  }
}
try {
  main();
} catch (e) {
  console.log(
    JSON.stringify({
      status: 'FAILED',
      code: e.safeCode || 'OPERATION_FAILED',
    }),
  );
  process.exitCode = 1;
}
