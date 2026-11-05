// Shared helpers for the SRS audit. Everything is pinned to the disposable
// loopback stack; assertSafeTarget() aborts the run for any other target.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
const require = createRequire(join(repo, 'package.json'));
const { Client } = require('pg');

export const BASE = 'http://127.0.0.1:3901';
const GATEWAY = 'http://127.0.0.1:18397';
const SINK = 'http://127.0.0.1:18394';
const MAILPIT = 'http://127.0.0.1:18398';

const runDir = process.env.AUDIT_RUN_DIR ?? join(tmpdir(), 'biosphere-srs-audit');
const env = Object.fromEntries(
  readFileSync(join(runDir, 'audit.env'), 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
);

export const db = new Client({
  host: '127.0.0.1',
  port: 18399,
  user: 'postgres',
  password: env.AUDIT_DB_PASSWORD,
  database: 'postgres',
});

export async function assertSafeTarget() {
  const url = new URL(BASE);
  if (url.hostname !== '127.0.0.1') throw new Error('Refusing non-loopback API');
  await db.connect();
  const marker = await db.query("select count(*)::int n from pg_roles where rolname='supabase_auth_admin'");
  if (marker.rows[0].n !== 1) throw new Error('Unexpected database');
  const egress = await sql("select inet_server_port() as port");
  if (Number(egress[0].port) !== 5432) throw new Error('Unexpected server port');
}

export const sql = async (text, params) => (await db.query(text, params)).rows;
export const one = async (text, params) => (await sql(text, params))[0];

export const tokens = {};
export const ids = {};
export const results = [];
let current = { module: '', srs: [] };
let counter = 0;

/** Sets the module and default SRS IDs that the following checks record against. */
export function section(module, srs = []) {
  current = { module, srs };
}

export function check(op, kind, name, pass, detail = {}) {
  counter += 1;
  const srs = detail.srs ?? current.srs;
  const row = {
    id: `T${String(counter).padStart(4, '0')}`,
    module: detail.module ?? current.module,
    srs,
    op,
    kind,
    name,
    expected: detail.expected ?? null,
    actual: detail.actual ?? null,
    pass: Boolean(pass),
    note: detail.note ?? null,
  };
  results.push(row);
  if (!row.pass) {
    console.log(`FAIL ${row.id} [${srs.join(',')}] ${op} ${name} expected=${row.expected} actual=${JSON.stringify(row.actual)?.slice(0, 260)}`);
  }
  return row.pass;
}

/** Records something that could not be settled here. Counts as neither pass nor fail. */
export function info(op, name, detail = {}) {
  counter += 1;
  results.push({
    id: `T${String(counter).padStart(4, '0')}`,
    module: detail.module ?? current.module,
    srs: detail.srs ?? current.srs,
    op,
    kind: 'inconclusive',
    name,
    expected: detail.expected ?? null,
    actual: detail.actual ?? null,
    pass: null,
    note: detail.note ?? null,
  });
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

export async function api(role, method, path, options = {}) {
  const url = new URL(BASE + path);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  const headers = { ...(options.headers ?? {}) };
  const token = role && (tokens[role] ?? role);
  if (token && role !== 'none') headers.authorization = `Bearer ${token}`;
  let body;
  if (options.form) {
    body = options.form;
  } else if (options.json !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(options.json);
  }
  for (let attempt = 0; ; attempt += 1) {
    const started = Date.now();
    const response = await fetch(url, { method, headers, body });
    if (response.status === 429 && !options.keep429 && attempt < 4) {
      await sleep(61_000);
      continue;
    }
    const type = response.headers.get('content-type') ?? '';
    const raw = Buffer.from(await response.arrayBuffer());
    let parsed = null;
    if (type.includes('json')) {
      try {
        parsed = JSON.parse(raw.toString('utf8'));
      } catch {
        parsed = null;
      }
    }
    return {
      status: response.status,
      body: parsed,
      text: type.includes('json') || type.includes('text') || type.includes('svg') ? raw.toString('utf8') : '',
      raw,
      type,
      headers: response.headers,
      ms: Date.now() - started,
    };
  }
}

/** One HTTP check: calls, compares the status, returns the response for further asserts. */
export async function call(name, kind, role, method, path, expected, options = {}) {
  const r = await api(role, method, path, options);
  const wanted = [].concat(expected);
  check(`${method} ${options.op ?? path}`, kind, name, wanted.includes(r.status), {
    expected: wanted.join('|'),
    actual: wanted.includes(r.status) ? r.status : { status: r.status, body: r.body ?? r.text.slice(0, 200) },
    srs: options.srs,
  });
  return r;
}

export const authHeaders = () => ({
  apikey: env.AUDIT_SERVICE_KEY,
  authorization: `Bearer ${env.AUDIT_SERVICE_KEY}`,
  'content-type': 'application/json',
});

export async function gotrue(method, path, json, headers = authHeaders()) {
  const response = await fetch(`${GATEWAY}/auth/v1${path}`, {
    method,
    headers,
    body: json === undefined ? undefined : JSON.stringify(json),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

export async function signIn(email, password) {
  const r = await gotrue('POST', '/token?grant_type=password', { email, password }, {
    apikey: env.AUDIT_ANON_KEY,
    'content-type': 'application/json',
  });
  return r.body;
}

export const anonHeaders = (extra = {}) => ({
  apikey: env.AUDIT_ANON_KEY,
  'content-type': 'application/json',
  ...extra,
});

export async function forgeToken(claims) {
  const { createHmac } = await import('node:crypto');
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const head = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(claims)}`;
  return `${head}.${createHmac('sha256', env.AUDIT_JWT_SECRET).update(head).digest('base64url')}`;
}

export const emails = {
  sent: async () => (await fetch(`${SINK}/sent`)).json(),
  clear: () => fetch(`${SINK}/sent`, { method: 'DELETE' }),
  failing: (fail) => fetch(`${SINK}/mode`, { method: 'POST', body: JSON.stringify({ fail }) }),
  /** Waits briefly for fire-and-forget sends. */
  async waitFor(predicate, ms = 4000) {
    const end = Date.now() + ms;
    for (;;) {
      const list = await this.sent();
      if (list.some(predicate) || Date.now() > end) return list;
      await sleep(150);
    }
  },
};

export const mailpit = {
  async messages() {
    const r = await fetch(`${MAILPIT}/api/v1/messages`);
    return (await r.json()).messages ?? [];
  },
  async body(id) {
    return (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json();
  },
  clear: () => fetch(`${MAILPIT}/api/v1/messages`, { method: 'DELETE' }),
};

export async function auditRow(action, predicate = {}, ms = 2500) {
  const end = Date.now() + ms;
  for (;;) {
    const rows = await sql('select * from audit_log where action = $1 order by created_at desc limit 50', [action]);
    const hit = rows.find((row) =>
      Object.entries(predicate).every(([key, value]) => row[key] === value),
    );
    if (hit || Date.now() > end) return hit;
    await sleep(120);
  }
}

export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

export function upload(fields, file, name = 'file.png', type = 'image/png') {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, String(value));
  if (file) form.set('file', new Blob([file], { type }), name);
  return form;
}

export const UNKNOWN_ID = '00000000-0000-4000-8000-00000000abcd';

export function save(path) {
  // Signed storage URLs carry a token; keep them out of a file that may be committed.
  writeFileSync(path, `${JSON.stringify(results, null, 1).replace(/token=[A-Za-z0-9._-]+/g, 'token=REDACTED')}\n`);
}

export { repo, here, sleep, env as auditEnv };
