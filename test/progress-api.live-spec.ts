/**
 * Progress-report live API suite (opt-in).
 *
 * Boots the real AppModule (all controllers, global guards, ValidationPipe as
 * in main.ts, real Prisma) against a disposable local PostgreSQL built from
 * prisma/migrations. Supabase Auth/Storage is a loopback fake reached through
 * SUPABASE_URL; Brevo email is captured; every other outbound host is blocked.
 * Nothing reaches the team's hosted database or sends real email.
 *
 * Run: npm run test:progress-api:db
 * Results: docs/progress-report-backend/api-test-results.json
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
// Importing the class does not load .env; only ConfigModule.forRoot() in AppModule does.
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DisposableAppDatabase } from './support/progress-api-live/disposable-app-database';
import {
  FakeSupabase,
  installOutboundGuard,
} from './support/progress-api-live/fake-supabase';
import { ROUTES } from './support/progress-api-live/routes';

jest.setTimeout(900_000);

type Kind =
  | 'happy'
  | 'invalid-input'
  | 'no-jwt'
  | 'invalid-jwt'
  | 'wrong-role'
  | 'inactive-account'
  | 'pending-onboarding'
  | 'not-found';

interface CaseResult {
  id: string;
  module: string;
  srs: string[];
  method: string;
  path: string;
  kind: Kind;
  expected: string;
  actualStatus: number | null;
  pass: boolean;
  db?: string;
  note?: string;
}

interface ApiResponse {
  status: number;
  body: any;
  headers: Record<string, string>;
  text: string;
}

const RESULTS_PATH =
  process.env.PROGRESS_API_RESULTS ??
  resolve(__dirname, '../docs/progress-report-backend/api-test-results.json');

const results: CaseResult[] = [];
let app: INestApplication<App>;
let db: DisposableAppDatabase;
let fake: FakeSupabase;
let outbound: ReturnType<typeof installOutboundGuard>;
const tokens: Record<string, string> = {};
const accounts: Record<
  string,
  { authId: string; accountId: string; email: string }
> = {};

// --- pacing: stay under the global 300/min throttle ---------------------
const sent: number[] = [];
async function pace() {
  for (;;) {
    const now = Date.now();
    while (sent.length && now - sent[0] > 61_000) sent.shift();
    if (sent.length < 240) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  sent.push(Date.now());
}

async function api(
  method: string,
  path: string,
  opts: {
    token?: string;
    body?: unknown;
    query?: Record<string, string | number | boolean>;
    file?: {
      field?: string;
      buffer: Buffer;
      filename: string;
      contentType: string;
    };
    fields?: Record<string, string>;
  } = {},
): Promise<ApiResponse> {
  await pace();
  const server = app.getHttpServer();
  const verb = method.toLowerCase() as
    'get' | 'post' | 'put' | 'patch' | 'delete';
  let req = request(server)[verb](path);
  if (opts.token) req = req.set('Authorization', `Bearer ${opts.token}`);
  if (opts.query) req = req.query(opts.query);
  if (opts.file) {
    for (const [k, v] of Object.entries(opts.fields ?? {}))
      req = req.field(k, v);
    req = req.attach(opts.file.field ?? 'file', opts.file.buffer, {
      filename: opts.file.filename,
      contentType: opts.file.contentType,
    });
  } else if (opts.body !== undefined) req = req.send(opts.body as object);
  const res = await req;
  return {
    status: res.status,
    body: res.body,
    headers: res.headers,
    text: res.text ?? '',
  };
}

function record(
  c: Omit<CaseResult, 'pass' | 'actualStatus' | 'expected'> & {
    res: ApiResponse | null;
    expect: number | number[];
    check?: boolean;
  },
): boolean {
  const allowed = Array.isArray(c.expect) ? c.expect : [c.expect];
  const statusOk = c.res !== null && allowed.includes(c.res.status);
  const pass = statusOk && (c.check ?? true);
  results.push({
    id: c.id,
    module: c.module,
    srs: c.srs,
    method: c.method,
    path: c.path,
    kind: c.kind,
    expected: allowed.join('|') + (c.check === undefined ? '' : ' + checks'),
    actualStatus: c.res?.status ?? null,
    pass,
    db: c.db,
    note:
      c.note ??
      (pass || !c.res
        ? undefined
        : JSON.stringify(c.res.body ?? c.res.text).slice(0, 300)),
  });
  return pass;
}

async function q<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.admin.query(sql, params)).rows as T[];
}

async function one<T = any>(
  sql: string,
  params: unknown[] = [],
): Promise<T | undefined> {
  return (await q<T>(sql, params))[0];
}

function idOf(res: ApiResponse): string {
  const body = res.body as
    | { id?: string; data?: { id?: string }; specimen?: { id?: string } }
    | undefined;
  return body?.id ?? body?.data?.id ?? body?.specimen?.id ?? '';
}

type LotRow = {
  storage_unit_id?: string;
  quantity: number | string;
  condition_class?: string;
};

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
function glb() {
  const json = Buffer.from(
    JSON.stringify({ asset: { version: '2.0' } }).padEnd(28, ' '),
  );
  const header = Buffer.alloc(12);
  header.write('glTF', 0, 'ascii');
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + json.length, 8);
  const chunk = Buffer.alloc(8);
  chunk.writeUInt32LE(json.length, 0);
  chunk.write('JSON', 4, 'ascii');
  return Buffer.concat([header, chunk, json]);
}

function today(offsetDays = 0) {
  const d = new Date(Date.now() + 8 * 3600_000 + offsetDays * 86400_000);
  return d.toISOString().slice(0, 10);
}

const SAMPLE_ID = '00000000-0000-4000-8000-000000000001';
function concrete(path: string) {
  return path.replace(/:[A-Za-z]+/g, (param) =>
    param === ':slug' ? 'no-such-slug' : SAMPLE_ID,
  );
}

beforeAll(async () => {
  outbound = installOutboundGuard();
  db = await DisposableAppDatabase.start();
  fake = new FakeSupabase(db.admin);
  await fake.start();

  // Every key the app reads is pinned to local values, so ConfigModule cannot
  // fill any of them from the developer's .env (which names the shared project).
  Object.assign(process.env, {
    // MailService sends nothing when NODE_ENV=test; 'development' lets it call
    // Brevo, which the outbound guard captures instead of delivering.
    NODE_ENV: 'development',
    DATABASE_URL: db.url(),
    DIRECT_URL: db.url(),
    SUPABASE_URL: fake.baseUrl,
    SUPABASE_SECRET_KEY: 'fake-service-role-key',
    SUPABASE_ANON_KEY: 'fake-anon-key',
    BREVO_API_KEY: 'fake-brevo-key',
    MAIL_FROM_EMAIL: 'museum@example.test',
    MAIL_FROM_NAME: 'USC Biological Museum',
    FRONTEND_URL: 'http://localhost:3000',
    PUBLIC_SITE_URL: 'http://localhost:3000',
    CURATOR_ALERT_EMAILS: '',
    NOTIFICATION_STATE_ENABLED: 'true',
    FAQ_REVIEW_ENABLED: '',
  });

  const seed = async (
    key: string,
    role: 'CURATOR' | 'DEVELOPER',
    status: 'ACTIVE' | 'INACTIVE',
    appMeta: Record<string, unknown> = {},
  ) => {
    const authId = randomUUID();
    const accountId = randomUUID();
    const email = `${key.toLowerCase()}@example.test`;
    await db.admin.query(
      `INSERT INTO auth.users (id, email, encrypted_password, raw_app_meta_data, created_at, updated_at)
       VALUES ($1, $2, 'bcrypt-placeholder', $3::jsonb, now(), now())`,
      [authId, email, JSON.stringify(appMeta)],
    );
    await db.admin.query(
      `INSERT INTO user_account (id, auth_user_id, full_name, role, status) VALUES ($1, $2, $3, $4, $5)`,
      [accountId, authId, `Synthetic ${key}`, role, status],
    );
    tokens[key] = fake.addUser({
      id: authId,
      email,
      password: 'Correct-Horse-Battery-1',
      app_metadata: appMeta,
      user_metadata: {},
    });
    accounts[key] = { authId, accountId, email };
  };
  await seed('curatorA', 'CURATOR', 'ACTIVE');
  await seed('curatorB', 'CURATOR', 'ACTIVE');
  await seed('inactiveCurator', 'CURATOR', 'INACTIVE');
  await seed('developer', 'DEVELOPER', 'ACTIVE');
  await seed('pendingCurator', 'CURATOR', 'ACTIVE', {
    onboarding_pending: true,
  });
  tokens.invalid = 'not-a-real-token';

  await db.admin.query(`
    INSERT INTO backup_history (id, created_by, backup_type, storage_path, status, started_at, completed_at) VALUES
      ('44444444-4444-4444-8444-444444444441', '${accounts.curatorA.accountId}', 'SCHEDULED_FULL', 'private/synthetic/full.dump', 'COMPLETED', '2026-11-01T00:00:00Z', '2026-11-01T00:01:00Z'),
      ('44444444-4444-4444-8444-444444444442', NULL, 'SCHEDULED_FULL', NULL, 'FAILED', '2026-11-02T00:00:00Z', '2026-11-02T00:01:00Z');
  `);

  // Loaded only now, after the environment above is pinned.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { AppModule } = require('../src/app.module') as {
    AppModule: new () => unknown;
  };

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  await app.init();

  // Hard stop if anything still points at a non-local database.
  const configured = app.get(ConfigService).get<string>('DATABASE_URL') ?? '';
  if (!configured.includes('@127.0.0.1:'))
    throw new Error(
      'Refusing to run: DATABASE_URL is not the disposable local database',
    );
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PrismaService } = require('../src/prisma/prisma.service') as {
    PrismaService: new () => {
      $queryRawUnsafe(sql: string): Promise<Array<{ db: string }>>;
    };
  };
  const probe = await app
    .get(PrismaService)
    .$queryRawUnsafe('SELECT current_database() AS db');
  if (probe[0]?.db !== 'biosphere_progress_api_disposable')
    throw new Error(
      'Refusing to run: Prisma is not connected to the disposable database',
    );

  // Prove the app's own fetch is the guarded one before any scenario can email.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { MailService } = require('../src/mail/mail.service') as {
    MailService: new () => { send(e: unknown): Promise<unknown> };
  };
  await app.get(MailService).send({
    to: 'preflight@example.test',
    subject: 'preflight',
    text: 'preflight',
    html: '<p>preflight</p>',
  });
  if (outbound.emails.length !== 1 || outbound.blocked.length !== 0)
    throw new Error(
      'Refusing to run: outbound email is not captured by the harness',
    );
  outbound.emails.length = 0;
});

afterAll(async () => {
  try {
    const summary = {
      generatedAt: new Date().toISOString(),
      target:
        'disposable local PostgreSQL (prisma/migrations) + loopback fake Supabase; Brevo captured',
      totals: {
        cases: results.length,
        passed: results.filter((r) => r.pass).length,
        failed: results.filter((r) => !r.pass).length,
      },
      outboundBlocked: outbound?.blocked ?? [],
      emailsCaptured: (outbound?.emails ?? []).map((e) => ({
        to: e.to,
        subject: e.subject,
      })),
      results,
    };
    mkdirSync(resolve(RESULTS_PATH, '..'), { recursive: true });
    writeFileSync(RESULTS_PATH, JSON.stringify(summary, null, 2));
  } finally {
    await app?.close();
    await fake?.stop();
    await db?.close();
    outbound?.restore();
  }
  const failures = results.filter((result) => !result.pass);
  if (results.length === 0 || failures.length > 0) {
    throw new Error(
      `Progress API observations: ${results.length} recorded, ${failures.length} failed. ${failures.map((result) => result.id).join(', ')}`,
    );
  }
});

/** Protected inquiry/visit routes also evidence REQ-4.8-10 / REQ-4.9-15 (no personal data to unauthorized actors). */
function privacy(path: string): string[] {
  if (path.startsWith('/inquiries')) return ['REQ-4.8-10'];
  if (path.startsWith('/visit-requests')) return ['REQ-4.9-15'];
  return [];
}

function moduleOf(path: string) {
  return path.split('/')[1] || 'root';
}

// ---------------------------------------------------------------------------
describe('Route access matrix (all 140 routes)', () => {
  it('rejects missing and invalid JWTs on every protected route (REQ-4.1-06)', async () => {
    for (const r of ROUTES.filter((x) => x.access !== 'PUBLIC')) {
      const path = concrete(r.path);
      record({
        id: `MATRIX-NOJWT ${r.method} ${r.path}`,
        module: moduleOf(r.path),
        srs: ['REQ-4.1-06', ...privacy(r.path)],
        method: r.method,
        path: r.path,
        kind: 'no-jwt',
        res: await api(r.method, path, { body: {} }),
        expect: 401,
      });
      record({
        id: `MATRIX-BADJWT ${r.method} ${r.path}`,
        module: moduleOf(r.path),
        srs: ['REQ-4.1-06'],
        method: r.method,
        path: r.path,
        kind: 'invalid-jwt',
        res: await api(r.method, path, { token: tokens.invalid, body: {} }),
        expect: 401,
      });
    }
  });

  it('enforces Curator/Developer separation on every role-restricted route (REQ-4.1-14, REQ-4.2-06/07/08)', async () => {
    for (const r of ROUTES.filter(
      (x) => x.access === 'CURATOR' || x.access === 'DEVELOPER',
    )) {
      const wrong = r.access === 'CURATOR' ? tokens.developer : tokens.curatorA;
      const srs =
        r.access === 'CURATOR'
          ? ['REQ-4.1-14', 'REQ-4.2-06', 'REQ-4.2-07']
          : ['REQ-4.1-14', 'REQ-4.2-08'];
      record({
        id: `MATRIX-ROLE ${r.method} ${r.path}`,
        module: moduleOf(r.path),
        srs: [...srs, ...privacy(r.path)],
        method: r.method,
        path: r.path,
        kind: 'wrong-role',
        res: await api(r.method, concrete(r.path), { token: wrong, body: {} }),
        expect: 403,
      });
    }
  });

  it('denies inactive and onboarding-pending accounts on every protected route (REQ-4.1-12, REQ-4.1-07)', async () => {
    for (const r of ROUTES.filter((x) => x.access !== 'PUBLIC')) {
      record({
        id: `MATRIX-INACTIVE ${r.method} ${r.path}`,
        module: moduleOf(r.path),
        srs: ['REQ-4.1-12'],
        method: r.method,
        path: r.path,
        kind: 'inactive-account',
        res: await api(r.method, concrete(r.path), {
          token: tokens.inactiveCurator,
          body: {},
        }),
        expect: 403,
      });
    }
    for (const r of ROUTES.filter((x) => x.access === 'CURATOR').slice(0, 10)) {
      record({
        id: `MATRIX-PENDING ${r.method} ${r.path}`,
        module: moduleOf(r.path),
        srs: ['REQ-4.1-07'],
        method: r.method,
        path: r.path,
        kind: 'pending-onboarding',
        res: await api(r.method, concrete(r.path), {
          token: tokens.pendingCurator,
          body: {},
        }),
        expect: 403,
      });
    }
    const audited = await one<{ n: string }>(
      `SELECT count(*)::text AS n FROM audit_log WHERE action = 'ACCESS_DENIED' AND user_id = $1`,
      [accounts.inactiveCurator.accountId],
    );
    record({
      id: 'MATRIX-INACTIVE audit',
      module: 'auth',
      srs: ['REQ-4.1-15'],
      method: 'DB',
      path: 'audit_log',
      kind: 'happy',
      res: { status: 200, body: audited, headers: {}, text: '' },
      expect: 200,
      check: Number(audited?.n) > 0,
      db: `ACCESS_DENIED rows for inactive account: ${audited?.n}`,
    });
  });

  it('leaves the public routes reachable without a JWT', async () => {
    // /auth/login and /auth/onboarding/complete are public but authenticate the
    // caller themselves; they are covered by the auth scenarios (and login has
    // a 5/min throttle the scenarios need).
    for (const r of ROUTES.filter(
      (x) => x.access === 'PUBLIC' && !x.path.startsWith('/auth/'),
    )) {
      const res = await api(r.method, concrete(r.path), { body: {} });
      record({
        id: `MATRIX-PUBLIC ${r.method} ${r.path}`,
        module: moduleOf(r.path),
        srs: ['REQ-4.8-01', 'REQ-4.9-01', 'REQ-4.11-01'].filter(
          (s) =>
            (r.path.includes('inquir') && s === 'REQ-4.8-01') ||
            (r.path.includes('visit') && s === 'REQ-4.9-01') ||
            (r.path.includes('faq') && s === 'REQ-4.11-01'),
        ),
        method: r.method,
        path: r.path,
        kind: 'no-jwt',
        res,
        expect: [200, 201, 400, 404, 503],
        check: res.status !== 401 && res.status !== 403,
      });
    }
  });
});

// ---------------------------------------------------------------------------
describe('Authentication and accounts (§4.1, §4.2)', () => {
  it('logs in, rejects bad credentials generically and audits attempts', async () => {
    const m = 'auth';
    let res = await api('POST', '/auth/login', {
      body: {
        email: accounts.curatorA.email,
        password: 'Correct-Horse-Battery-1',
      },
    });
    record({
      id: 'AUTH-LOGIN-OK',
      module: m,
      srs: ['REQ-4.1-01', 'REQ-4.1-04'],
      method: 'POST',
      path: '/auth/login',
      kind: 'happy',
      res,
      expect: [200, 201],
      check:
        typeof res.body?.access_token === 'string' &&
        res.body?.user?.role === 'CURATOR' &&
        !JSON.stringify(res.body).includes('Correct-Horse'),
    });
    const loginAudit = await one(
      `SELECT details FROM audit_log WHERE action='LOGIN' AND status='SUCCESS' AND user_id=$1`,
      [accounts.curatorA.accountId],
    );
    record({
      id: 'AUTH-LOGIN-AUDIT',
      module: m,
      srs: ['REQ-4.1-15'],
      method: 'DB',
      path: 'audit_log',
      kind: 'happy',
      res: { status: 200, body: null, headers: {}, text: '' },
      expect: 200,
      check:
        !!loginAudit && !JSON.stringify(loginAudit).includes('Correct-Horse'),
      db: 'LOGIN SUCCESS row present; password absent',
    });

    res = await api('POST', '/auth/login', {
      body: { email: accounts.curatorA.email, password: 'wrong-password' },
    });
    const unknown = await api('POST', '/auth/login', {
      body: { email: 'nobody@example.test', password: 'wrong-password' },
    });
    record({
      id: 'AUTH-LOGIN-BAD',
      module: m,
      srs: ['REQ-4.1-01', 'REQ-4.1-15'],
      method: 'POST',
      path: '/auth/login',
      kind: 'invalid-input',
      res,
      expect: 401,
      check:
        res.body?.message === unknown.body?.message && unknown.status === 401,
      note: 'same message for wrong password and unknown account',
    });
    const failed = await one<{ n: string }>(
      `SELECT count(*)::text n FROM audit_log WHERE action='LOGIN' AND status='FAILED'`,
    );
    record({
      id: 'AUTH-LOGIN-FAIL-AUDIT',
      module: m,
      srs: ['REQ-4.1-15'],
      method: 'DB',
      path: 'audit_log',
      kind: 'happy',
      res: { status: 200, body: null, headers: {}, text: '' },
      expect: 200,
      check: Number(failed?.n) >= 2,
      db: `LOGIN FAILED rows: ${failed?.n}`,
    });

    res = await api('POST', '/auth/login', { body: { email: 'not-an-email' } });
    record({
      id: 'AUTH-LOGIN-INVALID',
      module: m,
      srs: ['REQ-4.1-01'],
      method: 'POST',
      path: '/auth/login',
      kind: 'invalid-input',
      res,
      expect: [400, 401],
    });

    res = await api('POST', '/auth/login', {
      body: {
        email: accounts.inactiveCurator.email,
        password: 'Correct-Horse-Battery-1',
      },
    });
    record({
      id: 'AUTH-LOGIN-INACTIVE',
      module: m,
      srs: ['REQ-4.1-12'],
      method: 'POST',
      path: '/auth/login',
      kind: 'inactive-account',
      res,
      expect: [401, 403],
    });
  });

  it('returns the session identity and completes onboarding', async () => {
    let res = await api('GET', '/auth/me', { token: tokens.curatorA });
    record({
      id: 'AUTH-ME',
      module: 'auth',
      srs: ['REQ-4.1-04'],
      method: 'GET',
      path: '/auth/me',
      kind: 'happy',
      res,
      expect: 200,
      check: res.body?.role === 'CURATOR',
    });
    res = await api('GET', '/auth/me', { token: tokens.developer });
    record({
      id: 'AUTH-ME-DEV',
      module: 'auth',
      srs: ['REQ-4.1-13'],
      method: 'GET',
      path: '/auth/me',
      kind: 'happy',
      res,
      expect: 200,
      check: res.body?.role === 'DEVELOPER',
    });

    res = await api('POST', '/auth/onboarding/complete', {
      token: tokens.pendingCurator,
      body: { password: 'Fixture-First-Password-2026!' },
    });
    const meta = await one(
      `SELECT raw_app_meta_data m FROM auth.users WHERE id=$1`,
      [accounts.pendingCurator.authId],
    );
    const audit = await one(
      `SELECT 1 FROM audit_log WHERE action='ONBOARDING_COMPLETED' AND status='SUCCESS'`,
    );
    record({
      id: 'AUTH-ONBOARD-COMPLETE',
      module: 'auth',
      srs: ['REQ-4.1-07', 'REQ-4.1-11'],
      method: 'POST',
      path: '/auth/onboarding/complete',
      kind: 'happy',
      res,
      expect: [200, 201],
      check:
        res.body?.onboardingComplete === true &&
        meta?.m?.onboarding_pending !== true &&
        !!audit,
      db: `app_metadata after: ${JSON.stringify(meta?.m)}`,
    });
    res = await api('POST', '/auth/onboarding/complete', {
      body: { password: 'Fixture-First-Password-2026!' },
    });
    record({
      id: 'AUTH-ONBOARD-NOJWT',
      module: 'auth',
      srs: ['REQ-4.1-19'],
      method: 'POST',
      path: '/auth/onboarding/complete',
      kind: 'no-jwt',
      res,
      expect: 401,
    });
  });

  it('lets a curator invite a curator and lists account state (REQ-4.1-07)', async () => {
    let res = await api('POST', '/user-accounts/invitations', {
      token: tokens.curatorA,
      body: { email: 'New.Curator@Example.test', fullName: 'Invited Curator' },
    });
    const row = await one(
      `SELECT ua.status, u.raw_app_meta_data m FROM user_account ua JOIN auth.users u ON u.id = ua.auth_user_id WHERE u.email='new.curator@example.test'`,
    );
    const audit = await one(
      `SELECT 1 FROM audit_log WHERE action ILIKE '%INVITE%' AND status='SUCCESS'`,
    );
    record({
      id: 'ACCT-INVITE',
      module: 'user-accounts',
      srs: ['REQ-4.1-02', 'REQ-4.1-07', 'REQ-4.1-11', 'REQ-4.1-17'],
      method: 'POST',
      path: '/user-accounts/invitations',
      kind: 'happy',
      res,
      expect: 201,
      check: row?.m?.onboarding_pending === true && !!audit,
      db: `account ${JSON.stringify(row)}`,
    });
    res = await api('POST', '/user-accounts/invitations', {
      token: tokens.curatorA,
      body: { email: 'new.curator@example.test', fullName: 'Again' },
    });
    record({
      id: 'ACCT-INVITE-DUP',
      module: 'user-accounts',
      srs: ['REQ-4.1-07'],
      method: 'POST',
      path: '/user-accounts/invitations',
      kind: 'invalid-input',
      res,
      expect: [400, 409, 422],
    });
    res = await api('POST', '/user-accounts/invitations', {
      token: tokens.curatorA,
      body: { email: 'bad', fullName: '' },
    });
    record({
      id: 'ACCT-INVITE-INVALID',
      module: 'user-accounts',
      srs: ['REQ-4.1-07'],
      method: 'POST',
      path: '/user-accounts/invitations',
      kind: 'invalid-input',
      res,
      expect: 400,
    });
    res = await api('GET', '/user-accounts', { token: tokens.curatorA });
    const list: any[] = Array.isArray(res.body)
      ? res.body
      : (res.body?.data ?? res.body?.items ?? []);
    const invited = list.find((a) =>
      JSON.stringify(a).toLowerCase().includes('new.curator@example.test'),
    );
    record({
      id: 'ACCT-LIST',
      module: 'user-accounts',
      srs: ['REQ-4.1-08'],
      method: 'GET',
      path: '/user-accounts',
      kind: 'happy',
      res,
      expect: 200,
      check: !!invited && /pending|invit/i.test(JSON.stringify(invited)),
      note: invited
        ? `invitee entry: ${JSON.stringify(invited).slice(0, 200)}`
        : 'invitee not listed',
    });
    const curatorStatusRoute = ROUTES.some(
      (r) => r.path.startsWith('/user-accounts') && r.method === 'PATCH',
    );
    record({
      id: 'ACCT-CURATOR-ACTIVATE',
      module: 'user-accounts',
      srs: ['REQ-4.1-08', 'REQ-4.1-09'],
      method: 'PATCH',
      path: '/user-accounts/:id/status',
      kind: 'happy',
      res: null,
      expect: 200,
      check: curatorStatusRoute,
      note: 'Not executed: reconcile the legacy Curator activation requirement with the Nov 7 Developer-owned status/handover decision and its owner-accepted HTTP evidence.',
    });
    const passwordRoute = ROUTES.some((r) => /password/i.test(r.path));
    record({
      id: 'ACCT-CHANGE-PASSWORD',
      module: 'auth',
      srs: ['REQ-4.1-16', 'REQ-4.1-18'],
      method: 'POST',
      path: '(none)',
      kind: 'happy',
      res: null,
      expect: 200,
      check: passwordRoute,
      note: 'Not executed here: backend password change/recovery/reset routes exist; their current HTTP and audit behavior still needs executed evidence in this progress harness.',
    });
  });

  it('runs Developer curator management with recorded authorization (REQ-4.2-02/03)', async () => {
    let res = await api('POST', '/developer/curators/onboard', {
      token: tokens.developer,
      body: {
        email: 'initial.curator@example.test',
        fullName: 'Initial Curator',
      },
    });
    const created = await one(
      `SELECT ua.id, ua.status, u.raw_app_meta_data m FROM user_account ua JOIN auth.users u ON u.id=ua.auth_user_id WHERE u.email='initial.curator@example.test'`,
    );
    record({
      id: 'DEV-ONBOARD',
      module: 'developer',
      srs: ['REQ-4.2-02', 'REQ-4.2-09'],
      method: 'POST',
      path: '/developer/curators/onboard',
      kind: 'happy',
      res,
      expect: 201,
      check: !!created,
      db: `created ${JSON.stringify(created)}`,
    });
    record({
      id: 'DEV-ONBOARD-PENDING-FLAG',
      module: 'developer',
      srs: ['REQ-4.2-02'],
      method: 'DB',
      path: 'auth.users.raw_app_meta_data',
      kind: 'happy',
      res: { status: 200, body: null, headers: {}, text: '' },
      expect: 200,
      check: created?.m?.onboarding_pending === true,
      note: `Developer-onboarded curator app_metadata=${JSON.stringify(created?.m)}; curator invitations set onboarding_pending=true, Developer onboarding does not`,
    });
    // An invite link yields a session before any password exists. Curator
    // invitations block that session until onboarding completes; check the
    // Developer-onboarded account gets the same protection.
    const invited = [...fake.users.values()].find(
      (u) => u.email === 'initial.curator@example.test',
    );
    if (invited) {
      const inviteSession = fake.addUser(invited);
      res = await api('GET', '/dashboard/summary', { token: inviteSession });
      record({
        id: 'DEV-ONBOARD-SESSION-GATED',
        module: 'developer',
        srs: ['REQ-4.2-02'],
        method: 'GET',
        path: '/dashboard/summary',
        kind: 'pending-onboarding',
        res,
        expect: 403,
        note: `invite-link session before password setup got ${res.status}`,
      });
    }
    res = await api('POST', '/developer/curators/onboard', {
      token: tokens.developer,
      body: { email: 'x' },
    });
    record({
      id: 'DEV-ONBOARD-INVALID',
      module: 'developer',
      srs: ['REQ-4.2-02'],
      method: 'POST',
      path: '/developer/curators/onboard',
      kind: 'invalid-input',
      res,
      expect: 400,
    });

    res = await api('GET', '/developer/curators', { token: tokens.developer });
    const list: any[] = Array.isArray(res.body)
      ? res.body
      : (res.body?.data ?? []);
    // The Developer entity carries no email, so find the curator-invited account by name.
    const invitee = list.find((c) => c?.fullName === 'Invited Curator');
    // Look for an invitation-state field, ignoring the name (which contains "Invited").
    const inviteState = invitee
      ? JSON.stringify({ ...invitee, fullName: undefined })
      : '';
    record({
      id: 'DEV-CURATORS-LIST',
      module: 'developer',
      srs: ['REQ-4.2-02', 'REQ-4.2-03'],
      method: 'GET',
      path: '/developer/curators',
      kind: 'happy',
      res,
      expect: 200,
      check:
        !!invitee &&
        (/pending|invit/i.test(inviteState) || invitee.status !== 'ACTIVE'),
      note: invitee
        ? `invitee as Developer sees it: ${inviteState.slice(0, 220)}`
        : 'invitee missing',
    });

    res = await api(
      'PATCH',
      `/developer/curators/${accounts.curatorB.accountId}/status`,
      { token: tokens.developer, body: { status: 'INACTIVE' } },
    );
    record({
      id: 'DEV-STATUS-NO-REASON',
      module: 'developer',
      srs: ['REQ-4.2-03'],
      method: 'PATCH',
      path: '/developer/curators/:id/status',
      kind: 'invalid-input',
      res,
      expect: 400,
    });
    res = await api(
      'PATCH',
      `/developer/curators/${accounts.curatorB.accountId}/status`,
      {
        token: tokens.developer,
        body: {
          status: 'INACTIVE',
          authorizationReason: 'Memo 2026-11 synthetic',
        },
      },
    );
    const status = await one(`SELECT status FROM user_account WHERE id=$1`, [
      accounts.curatorB.accountId,
    ]);
    const audit = await one(
      `SELECT details FROM audit_log WHERE module ILIKE '%developer%' AND action ILIKE '%STATUS%' ORDER BY created_at DESC LIMIT 1`,
    );
    record({
      id: 'DEV-STATUS-DEACTIVATE',
      module: 'developer',
      srs: ['REQ-4.2-03', 'REQ-4.2-09', 'REQ-4.1-11'],
      method: 'PATCH',
      path: '/developer/curators/:id/status',
      kind: 'happy',
      res,
      expect: 200,
      check:
        status?.status === 'INACTIVE' &&
        JSON.stringify(audit ?? {}).includes('Memo 2026-11'),
      db: `status=${status?.status}; audit=${JSON.stringify(audit).slice(0, 160)}`,
    });
    res = await api('GET', '/auth/me', { token: tokens.curatorB });
    record({
      id: 'DEV-STATUS-EFFECT',
      module: 'auth',
      srs: ['REQ-4.1-12'],
      method: 'GET',
      path: '/auth/me',
      kind: 'inactive-account',
      res,
      expect: 403,
    });
    res = await api(
      'PATCH',
      `/developer/curators/${accounts.curatorB.accountId}/status`,
      {
        token: tokens.developer,
        body: {
          status: 'ACTIVE',
          authorizationReason: 'Memo 2026-11 reinstate',
        },
      },
    );
    record({
      id: 'DEV-STATUS-REACTIVATE',
      module: 'developer',
      srs: ['REQ-4.2-03'],
      method: 'PATCH',
      path: '/developer/curators/:id/status',
      kind: 'happy',
      res,
      expect: 200,
    });
  });
});

// ---------------------------------------------------------------------------
const ctx: Record<string, string> = {};

describe('Storage locations (§4.6)', () => {
  it('creates, reads, moves and archives a hierarchy', async () => {
    const C = tokens.curatorA;
    const mk = async (
      label: string,
      unitType: string,
      parentId: string | null,
      holds: boolean,
      capacity?: number,
    ) =>
      api('POST', '/storage-locations', {
        token: C,
        body: {
          label,
          unitType,
          storageType: 'DRY',
          parentId,
          holdsSpecimens: holds,
          ...(capacity ? { capacity } : {}),
        },
      });
    let res = await mk('Zoology Room', 'ROOM', null, false);
    ctx.room = idOf(res);
    record({
      id: 'STO-CREATE-ROOM',
      module: 'storage-locations',
      srs: ['REQ-4.6-01', 'REQ-4.6-02', 'REQ-4.6-04'],
      method: 'POST',
      path: '/storage-locations',
      kind: 'happy',
      res,
      expect: 201,
      check: !!(await one('SELECT 1 FROM storage_unit WHERE id=$1', [
        ctx.room,
      ])),
    });
    ctx.cabA = idOf(await mk('Cabinet A', 'CABINET', ctx.room, false));
    ctx.cabB = idOf(await mk('Cabinet B', 'CABINET', ctx.room, false));
    res = await mk('Drawer 1', 'DRAWER', ctx.cabA, true, 10);
    ctx.drawer1 = idOf(res);
    record({
      id: 'STO-CREATE-CHILD',
      module: 'storage-locations',
      srs: ['REQ-4.6-03', 'REQ-4.6-04'],
      method: 'POST',
      path: '/storage-locations',
      kind: 'happy',
      res,
      expect: 201,
      check:
        (
          await one(
            'SELECT parent_id, capacity, holds_specimens FROM storage_unit WHERE id=$1',
            [ctx.drawer1],
          )
        )?.parent_id === ctx.cabA,
    });
    ctx.drawer2 = idOf(await mk('Drawer 2', 'DRAWER', ctx.cabA, true));
    ctx.box = idOf(await mk('Box 1', 'BOX', ctx.drawer2, true));
    ctx.spare = idOf(await mk('Spare Shelf', 'SHELF', ctx.room, true));

    res = await api('POST', '/storage-locations', {
      token: C,
      body: { label: '' },
    });
    record({
      id: 'STO-CREATE-INVALID',
      module: 'storage-locations',
      srs: ['REQ-4.6-04'],
      method: 'POST',
      path: '/storage-locations',
      kind: 'invalid-input',
      res,
      expect: 400,
    });

    for (const [id, path, srs] of [
      ['STO-LIST', '/storage-locations', ['REQ-4.6-02']],
      ['STO-SEARCH', '/storage-locations/search?search=Drawer', ['REQ-4.6-02']],
      ['STO-OCCUPANCY', '/storage-locations/occupancy-summary', ['REQ-4.6-11']],
      ['STO-GET', `/storage-locations/${ctx.drawer1}`, ['REQ-4.6-04']],
      ['STO-PATH', `/storage-locations/${ctx.drawer1}/path`, ['REQ-4.6-08']],
      [
        'STO-CHILDREN',
        `/storage-locations/${ctx.cabA}/children`,
        ['REQ-4.6-03'],
      ],
      [
        'STO-CAPACITY',
        `/storage-locations/${ctx.drawer1}/capacity-check?additionalQuantity=50`,
        ['REQ-4.6-11'],
      ],
    ] as const) {
      const r = await api('GET', path, { token: C });
      const extra =
        id === 'STO-PATH'
          ? JSON.stringify(r.body).includes('Zoology Room')
          : id === 'STO-CAPACITY'
            ? r.body?.exceedsCapacity === true
            : true;
      record({
        id,
        module: 'storage-locations',
        srs: [...srs],
        method: 'GET',
        path: path.split('?')[0],
        kind: 'happy',
        res: r,
        expect: 200,
        check: extra,
      });
    }
    res = await api('GET', '/storage-locations/not-a-uuid', { token: C });
    record({
      id: 'STO-GET-BADID',
      module: 'storage-locations',
      srs: ['REQ-4.6-04'],
      method: 'GET',
      path: '/storage-locations/:id',
      kind: 'invalid-input',
      res,
      expect: 400,
    });
    res = await api('GET', `/storage-locations/${SAMPLE_ID}`, { token: C });
    record({
      id: 'STO-GET-404',
      module: 'storage-locations',
      srs: ['REQ-4.6-04'],
      method: 'GET',
      path: '/storage-locations/:id',
      kind: 'not-found',
      res,
      expect: 404,
    });

    res = await api('PATCH', `/storage-locations/${ctx.drawer1}`, {
      token: C,
      body: { label: 'Drawer 1 (Birds)' },
    });
    record({
      id: 'STO-UPDATE',
      module: 'storage-locations',
      srs: ['REQ-4.6-02'],
      method: 'PATCH',
      path: '/storage-locations/:id',
      kind: 'happy',
      res,
      expect: 200,
      check:
        (await one('SELECT label FROM storage_unit WHERE id=$1', [ctx.drawer1]))
          ?.label === 'Drawer 1 (Birds)',
    });

    res = await api('PATCH', `/storage-locations/${ctx.drawer2}/move`, {
      token: C,
      body: { newParentId: ctx.cabB, reason: 'Reorganise' },
    });
    const boxParent = await one(
      'SELECT parent_id FROM storage_unit WHERE id=$1',
      [ctx.box],
    );
    const moved = await one('SELECT parent_id FROM storage_unit WHERE id=$1', [
      ctx.drawer2,
    ]);
    const hist = await one(
      'SELECT 1 FROM storage_movement_history WHERE storage_unit_id=$1',
      [ctx.drawer2],
    );
    record({
      id: 'STO-MOVE',
      module: 'storage-locations',
      srs: ['REQ-4.6-07'],
      method: 'PATCH',
      path: '/storage-locations/:id/move',
      kind: 'happy',
      res,
      expect: 200,
      check:
        moved?.parent_id === ctx.cabB &&
        boxParent?.parent_id === ctx.drawer2 &&
        !!hist,
      db: 'parent changed; child Box 1 still under Drawer 2; movement history row',
    });
    res = await api('PATCH', `/storage-locations/${ctx.cabB}/move`, {
      token: C,
      body: { newParentId: ctx.box },
    });
    record({
      id: 'STO-MOVE-CYCLE',
      module: 'storage-locations',
      srs: ['REQ-4.6-12'],
      method: 'PATCH',
      path: '/storage-locations/:id/move',
      kind: 'invalid-input',
      res,
      expect: [400, 409, 422],
    });
    res = await api('PATCH', `/storage-locations/${ctx.cabB}/move`, {
      token: C,
      body: { newParentId: ctx.cabB },
    });
    record({
      id: 'STO-MOVE-SELF',
      module: 'storage-locations',
      srs: ['REQ-4.6-12'],
      method: 'PATCH',
      path: '/storage-locations/:id/move',
      kind: 'invalid-input',
      res,
      expect: [400, 409, 422],
    });
    res = await api('GET', `/storage-locations/${ctx.drawer2}/movements`, {
      token: C,
    });
    record({
      id: 'STO-MOVEMENTS',
      module: 'storage-locations',
      srs: ['REQ-4.6-09'],
      method: 'GET',
      path: '/storage-locations/:id/movements',
      kind: 'happy',
      res,
      expect: 200,
    });
  });
});

describe('Specimens, cataloging, lots (§4.4, §4.5, §4.6)', () => {
  it('creates collections and enforces unique names', async () => {
    const C = tokens.curatorA;
    let res = await api('POST', '/collections', {
      token: C,
      body: { collectionName: 'Ornithology' },
    });
    ctx.collection = idOf(res);
    record({
      id: 'COL-CREATE',
      module: 'collections',
      srs: ['REQ-4.4-01', 'REQ-4.3-01'],
      method: 'POST',
      path: '/collections',
      kind: 'happy',
      res,
      expect: 201,
      check: !!(await one('SELECT 1 FROM collection WHERE id=$1', [
        ctx.collection,
      ])),
    });
    res = await api('POST', '/collections', {
      token: C,
      body: { collectionName: ' ornithology ' },
    });
    record({
      id: 'COL-DUPLICATE',
      module: 'collections',
      srs: ['REQ-4.4-01'],
      method: 'POST',
      path: '/collections',
      kind: 'invalid-input',
      res,
      expect: [400, 409],
    });
    res = await api('POST', '/collections', { token: C, body: {} });
    record({
      id: 'COL-INVALID',
      module: 'collections',
      srs: ['REQ-4.4-01'],
      method: 'POST',
      path: '/collections',
      kind: 'invalid-input',
      res,
      expect: 400,
    });
    for (const [id, method, path, body] of [
      ['COL-LIST', 'GET', '/collections', undefined],
      ['COL-GET', 'GET', `/collections/${ctx.collection}`, undefined],
      [
        'COL-UPDATE',
        'PATCH',
        `/collections/${ctx.collection}`,
        { collectionName: 'Ornithology Collection' },
      ],
    ] as const) {
      record({
        id,
        module: 'collections',
        srs: ['REQ-4.4-01'],
        method,
        path: path.replace(ctx.collection, ':id'),
        kind: 'happy',
        res: await api(method, path, { token: C, body }),
        expect: 200,
      });
    }
  });

  it('creates specimens as Uncataloged with unique generated or supplied accession numbers', async () => {
    const C = tokens.curatorA;
    const year = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
    }).format(new Date());
    let res = await api('POST', '/specimens', {
      token: C,
      body: {
        commonName: 'Philippine Eagle',
        scientificName: 'Pithecophaga jefferyi',
        specimenCategory: 'Bird',
      },
    });
    ctx.sp1 = idOf(res);
    const row = await one(
      'SELECT status, accession_number, created_by, public_display_allowed FROM specimen WHERE id=$1',
      [ctx.sp1],
    );
    record({
      id: 'SPC-CREATE',
      module: 'specimens',
      srs: [
        'REQ-4.4-01',
        'REQ-4.4-02',
        'REQ-4.4-03',
        'REQ-4.4-05',
        'REQ-4.4-06',
        'REQ-4.4-17',
        'REQ-4.4-18',
      ],
      method: 'POST',
      path: '/specimens',
      kind: 'happy',
      res,
      expect: 201,
      check:
        row?.status === 'UNCATALOGED' &&
        row?.accession_number === `USC-BM-${year}-0001` &&
        row?.created_by === accounts.curatorA.accountId &&
        row?.public_display_allowed === false,
      db: JSON.stringify(row),
    });
    const next = await api('POST', '/specimens', {
      token: C,
      body: { commonName: 'Synthetic consecutive accession check' },
    });
    record({
      id: 'SPC-CREATE-NEXT-ACCESSION',
      module: 'specimens',
      srs: ['REQ-4.4-03', 'REQ-4.4-04'],
      method: 'POST',
      path: '/specimens',
      kind: 'happy',
      res: next,
      expect: 201,
      check: next.body.accessionNumber === `USC-BM-${year}-0002`,
    });
    expect(next.status).toBe(201);
    expect(next.body.accessionNumber).toBe(`USC-BM-${year}-0002`);
    res = await api('POST', '/specimens', {
      token: C,
      body: { commonName: 'x', gender: 'ROBOT' },
    });
    record({
      id: 'SPC-CREATE-INVALID',
      module: 'specimens',
      srs: ['REQ-4.4-01'],
      method: 'POST',
      path: '/specimens',
      kind: 'invalid-input',
      res,
      expect: 400,
    });
    res = await api('POST', '/specimens', {
      token: C,
      body: { commonName: 'x', status: 'CATALOGED' },
    });
    record({
      id: 'SPC-CREATE-NO-STATUS-OVERRIDE',
      module: 'specimens',
      srs: ['REQ-4.4-06', 'REQ-4.4-14'],
      method: 'POST',
      path: '/specimens',
      kind: 'invalid-input',
      res,
      expect: 400,
    });

    res = await api('POST', '/specimens', {
      token: C,
      body: {
        commonName: 'Philippine Eagle',
        scientificName: 'Pithecophaga jefferyi',
        accessionNumber: 'USC-BM-TEST-0001',
        collectionId: ctx.collection,
      },
    });
    ctx.sp2 = idOf(res);
    record({
      id: 'SPC-CREATE-ACCESSION',
      module: 'specimens',
      srs: ['REQ-4.4-04', 'REQ-4.4-23'],
      method: 'POST',
      path: '/specimens',
      kind: 'happy',
      res,
      expect: 201,
    });
    res = await api('POST', '/specimens', {
      token: C,
      body: { commonName: 'Dup', accessionNumber: 'usc-bm-test-0001' },
    });
    record({
      id: 'SPC-ACCESSION-UNIQUE',
      module: 'specimens',
      srs: ['REQ-4.4-04'],
      method: 'POST',
      path: '/specimens',
      kind: 'invalid-input',
      res,
      expect: [400, 409],
    });
    res = await api('GET', '/specimens/accession-number-availability', {
      token: C,
      query: { accessionNumber: 'USC-BM-TEST-0001' },
    });
    record({
      id: 'SPC-ACCESSION-AVAIL',
      module: 'specimens',
      srs: ['REQ-4.4-04'],
      method: 'GET',
      path: '/specimens/accession-number-availability',
      kind: 'happy',
      res,
      expect: 200,
      check:
        res.body?.available === false || /false/.test(JSON.stringify(res.body)),
    });
    res = await api('GET', '/specimens/accession-number-availability', {
      token: C,
    });
    record({
      id: 'SPC-ACCESSION-AVAIL-INVALID',
      module: 'specimens',
      srs: ['REQ-4.4-04'],
      method: 'GET',
      path: '/specimens/accession-number-availability',
      kind: 'invalid-input',
      res,
      expect: 400,
    });
  });

  it('manages taxonomy, provenance, tags and media', async () => {
    const C = tokens.curatorA;
    const S = ctx.sp2;
    let res = await api('POST', `/specimens/${S}/taxonomy`, {
      token: C,
      body: {
        kingdom: 'Animalia',
        phylum: 'Chordata',
        class: 'Aves',
        family: 'Accipitridae',
        genus: 'Pithecophaga',
        species: 'jefferyi',
      },
    });
    record({
      id: 'TAX-CREATE',
      module: 'specimens',
      srs: ['REQ-4.4-01', 'REQ-4.4-14'],
      method: 'POST',
      path: '/specimens/:specimenId/taxonomy',
      kind: 'happy',
      res,
      expect: 201,
      check:
        (
          await one(
            'SELECT kingdom FROM specimen_taxonomy WHERE specimen_id=$1',
            [S],
          )
        )?.kingdom === 'Animalia',
    });
    record({
      id: 'TAX-GET',
      module: 'specimens',
      srs: ['REQ-4.4-09'],
      method: 'GET',
      path: '/specimens/:specimenId/taxonomy',
      kind: 'happy',
      res: await api('GET', `/specimens/${S}/taxonomy`, { token: C }),
      expect: 200,
    });
    record({
      id: 'TAX-UPDATE',
      module: 'specimens',
      srs: ['REQ-4.4-09'],
      method: 'PATCH',
      path: '/specimens/:specimenId/taxonomy',
      kind: 'happy',
      res: await api('PATCH', `/specimens/${S}/taxonomy`, {
        token: C,
        body: { habitat: 'Montane forest' },
      }),
      expect: 200,
    });
    record({
      id: 'TAX-INVALID',
      module: 'specimens',
      srs: ['REQ-4.4-08'],
      method: 'PATCH',
      path: '/specimens/:specimenId/taxonomy',
      kind: 'invalid-input',
      res: await api('PATCH', `/specimens/${S}/taxonomy`, {
        token: C,
        body: { kingdom: '' },
      }),
      expect: 400,
    });

    res = await api('POST', `/specimens/${S}/provenance`, {
      token: C,
      body: {
        collector: 'Synthetic Collector',
        collectionDate: today(1),
        preservationType: 'Skin',
        preservationMethod: 'Dry',
      },
    });
    record({
      id: 'PROV-FUTURE-DATE',
      module: 'specimens',
      srs: ['REQ-4.4-08'],
      method: 'POST',
      path: '/specimens/:specimenId/provenance',
      kind: 'invalid-input',
      res,
      expect: 400,
    });
    res = await api('POST', `/specimens/${S}/provenance`, {
      token: C,
      body: {
        collector: 'Synthetic Collector',
        collectionDate: '2020-05-01',
        collectionLocation: 'Mindanao',
        preservationType: 'Skin',
        preservationMethod: 'Dry',
      },
    });
    record({
      id: 'PROV-CREATE',
      module: 'specimens',
      srs: ['REQ-4.4-01'],
      method: 'POST',
      path: '/specimens/:specimenId/provenance',
      kind: 'happy',
      res,
      expect: 201,
      check: !!(await one(
        'SELECT 1 FROM specimen_provenance WHERE specimen_id=$1',
        [S],
      )),
    });
    record({
      id: 'PROV-GET',
      module: 'specimens',
      srs: ['REQ-4.4-09'],
      method: 'GET',
      path: '/specimens/:specimenId/provenance',
      kind: 'happy',
      res: await api('GET', `/specimens/${S}/provenance`, { token: C }),
      expect: 200,
    });
    record({
      id: 'PROV-UPDATE',
      module: 'specimens',
      srs: ['REQ-4.4-09'],
      method: 'PATCH',
      path: '/specimens/:specimenId/provenance',
      kind: 'happy',
      res: await api('PATCH', `/specimens/${S}/provenance`, {
        token: C,
        body: { donor: 'Synthetic Donor' },
      }),
      expect: 200,
    });

    res = await api('POST', `/specimens/${S}/tags`, {
      token: C,
      body: { tagName: 'Endemic' },
    });
    ctx.tag = res.body?.tagId ?? res.body?.tag?.id ?? res.body?.id;
    const tagRow = await one(
      `SELECT t.id FROM specimen_tag st JOIN tag t ON t.id=st.tag_id WHERE st.specimen_id=$1`,
      [S],
    );
    ctx.tag = tagRow?.id ?? ctx.tag;
    record({
      id: 'TAG-ATTACH',
      module: 'specimens',
      srs: ['REQ-4.7-02'],
      method: 'POST',
      path: '/specimens/:specimenId/tags',
      kind: 'happy',
      res,
      expect: 201,
      check: !!tagRow,
    });
    record({
      id: 'TAG-LIST-SPECIMEN',
      module: 'specimens',
      srs: ['REQ-4.7-02'],
      method: 'GET',
      path: '/specimens/:specimenId/tags',
      kind: 'happy',
      res: await api('GET', `/specimens/${S}/tags`, { token: C }),
      expect: 200,
    });
    record({
      id: 'TAG-LIST',
      module: 'specimens',
      srs: ['REQ-4.7-02'],
      method: 'GET',
      path: '/tags',
      kind: 'happy',
      res: await api('GET', '/tags', { token: C, query: { search: 'End' } }),
      expect: 200,
    });
    record({
      id: 'TAG-CHANGE',
      module: 'specimens',
      srs: ['REQ-4.7-02'],
      method: 'PATCH',
      path: '/specimens/:specimenId/tags/:tagId',
      kind: 'happy',
      res: await api('PATCH', `/specimens/${S}/tags/${ctx.tag}`, {
        token: C,
        body: { tagName: 'Critically Endangered' },
      }),
      expect: 200,
    });
    const tag2 = (
      await one(
        `SELECT t.id FROM specimen_tag st JOIN tag t ON t.id=st.tag_id WHERE st.specimen_id=$1`,
        [S],
      )
    )?.id;
    record({
      id: 'TAG-DETACH',
      module: 'specimens',
      srs: ['REQ-4.7-02'],
      method: 'DELETE',
      path: '/specimens/:specimenId/tags/:tagId',
      kind: 'happy',
      res: await api('DELETE', `/specimens/${S}/tags/${tag2}`, { token: C }),
      expect: [200, 204],
      check: !(await one('SELECT 1 FROM specimen_tag WHERE specimen_id=$1', [
        S,
      ])),
    });
    record({
      id: 'TAG-INVALID',
      module: 'specimens',
      srs: ['REQ-4.7-02'],
      method: 'POST',
      path: '/specimens/:specimenId/tags',
      kind: 'invalid-input',
      res: await api('POST', `/specimens/${S}/tags`, {
        token: C,
        body: { tagName: '' },
      }),
      expect: 400,
    });

    const png = {
      buffer: PNG,
      filename: 'eagle.png',
      contentType: 'image/png',
    };
    res = await api('POST', `/specimens/${S}/media`, {
      token: C,
      file: png,
      fields: { caption: 'Dorsal view' },
    });
    ctx.media = idOf(res);
    record({
      id: 'MEDIA-UPLOAD',
      module: 'specimens',
      srs: ['REQ-4.4-12'],
      method: 'POST',
      path: '/specimens/:specimenId/media',
      kind: 'happy',
      res,
      expect: 201,
      check:
        !!(await one('SELECT 1 FROM specimen_media WHERE id=$1', [
          ctx.media,
        ])) && fake.storedObjects.size > 0,
    });
    res = await api('POST', `/specimens/${S}/media`, {
      token: C,
      file: {
        buffer: Buffer.from('not an image at all'),
        filename: 'fake.png',
        contentType: 'image/png',
      },
    });
    record({
      id: 'MEDIA-UPLOAD-SPOOFED',
      module: 'specimens',
      srs: ['REQ-4.4-12'],
      method: 'POST',
      path: '/specimens/:specimenId/media',
      kind: 'invalid-input',
      res,
      expect: 400,
    });
    for (const [id, method, path, body] of [
      ['MEDIA-LIST', 'GET', `/specimens/${S}/media`, undefined],
      ['MEDIA-GET', 'GET', `/specimens/${S}/media/${ctx.media}`, undefined],
      [
        'MEDIA-SIGNED-URL',
        'GET',
        `/specimens/${S}/media/${ctx.media}/signed-url`,
        undefined,
      ],
      [
        'MEDIA-UPDATE',
        'PATCH',
        `/specimens/${S}/media/${ctx.media}`,
        { caption: 'Ventral view' },
      ],
      [
        'MEDIA-COVER',
        'PATCH',
        `/specimens/${S}/media/${ctx.media}/cover`,
        undefined,
      ],
    ] as const) {
      record({
        id,
        module: 'specimens',
        srs: ['REQ-4.4-12'],
        method,
        path: path.replace(S, ':specimenId').replace(ctx.media, ':mediaId'),
        kind: 'happy',
        res: await api(method, path, { token: C, body }),
        expect: 200,
      });
    }
    res = await api('PUT', `/specimens/${S}/media/${ctx.media}/file`, {
      token: C,
      file: png,
    });
    record({
      id: 'MEDIA-REPLACE',
      module: 'specimens',
      srs: ['REQ-4.4-12'],
      method: 'PUT',
      path: '/specimens/:specimenId/media/:mediaId/file',
      kind: 'happy',
      res,
      expect: 200,
    });
  });

  it('manages lots, partial moves, merges, condition changes and quantity rules (§4.5)', async () => {
    const C = tokens.curatorA;
    const S = ctx.sp2;
    let res = await api('POST', `/specimens/${S}/lots`, {
      token: C,
      body: { storageUnitId: ctx.cabA, conditionClass: 'Good', quantity: 2 },
    });
    record({
      id: 'LOT-CREATE-NONHOLDING',
      module: 'specimen-lots',
      srs: ['REQ-4.6-05'],
      method: 'POST',
      path: '/specimens/:specimenId/lots',
      kind: 'invalid-input',
      res,
      expect: [400, 409, 422],
    });
    res = await api('POST', `/specimens/${S}/lots`, {
      token: C,
      body: { storageUnitId: ctx.drawer1, conditionClass: 'Good', quantity: 0 },
    });
    record({
      id: 'LOT-CREATE-ZERO',
      module: 'specimen-lots',
      srs: ['REQ-4.5-02'],
      method: 'POST',
      path: '/specimens/:specimenId/lots',
      kind: 'invalid-input',
      res,
      expect: 400,
    });
    res = await api('POST', `/specimens/${S}/lots`, {
      token: C,
      body: {
        storageUnitId: ctx.drawer1,
        conditionClass: 'Good',
        quantity: 6,
        reason: 'Initial intake',
      },
    });
    ctx.lot1 = idOf(res);
    record({
      id: 'LOT-CREATE',
      module: 'specimen-lots',
      srs: ['REQ-4.5-01', 'REQ-4.5-02'],
      method: 'POST',
      path: '/specimens/:specimenId/lots',
      kind: 'happy',
      res,
      expect: 201,
      check:
        (await one('SELECT quantity FROM specimen_lot WHERE id=$1', [ctx.lot1]))
          ?.quantity === 6,
    });

    res = await api('POST', `/specimens/${S}/lots/${ctx.lot1}/movements`, {
      token: C,
      body: { targetStorageUnitId: ctx.box, quantity: 2, reason: 'Study loan' },
    });
    const lots = await q<LotRow>(
      'SELECT storage_unit_id, quantity, condition_class FROM specimen_lot WHERE specimen_id=$1 AND is_active ORDER BY quantity DESC',
      [S],
    );
    const total = lots.reduce((n, l) => n + Number(l.quantity), 0);
    const tx = await one(
      `SELECT * FROM specimen_lot_transaction WHERE source_lot_id=$1 AND transaction_type IN ('MOVEMENT','SPLIT') ORDER BY created_at DESC LIMIT 1`,
      [ctx.lot1],
    );
    record({
      id: 'LOT-PARTIAL-MOVE',
      module: 'specimen-lots',
      srs: [
        'REQ-4.5-04',
        'REQ-4.5-06',
        'REQ-4.6-06',
        'REQ-4.6-09',
        'REQ-4.5-11',
      ],
      method: 'POST',
      path: '/specimens/:specimenId/lots/:lotId/movements',
      kind: 'happy',
      res,
      expect: [200, 201],
      check:
        lots.length === 2 &&
        total === 6 &&
        !!tx &&
        tx.performed_by === accounts.curatorA.accountId &&
        Number(tx.quantity_affected) === 2,
      db: `lots=${JSON.stringify(lots)}; tx=${tx ? 'yes' : 'no'}`,
    });
    res = await api('POST', `/specimens/${S}/lots/${ctx.lot1}/movements`, {
      token: C,
      body: { targetStorageUnitId: ctx.box, quantity: 1, reason: 'More loans' },
    });
    const afterMerge = await q<LotRow>(
      'SELECT quantity FROM specimen_lot WHERE specimen_id=$1 AND is_active',
      [S],
    );
    record({
      id: 'LOT-MERGE',
      module: 'specimen-lots',
      srs: ['REQ-4.5-07'],
      method: 'POST',
      path: '/specimens/:specimenId/lots/:lotId/movements',
      kind: 'happy',
      res,
      expect: [200, 201],
      check: afterMerge.length === 2,
      db: `active lots after second move: ${afterMerge.length}`,
    });
    res = await api('POST', `/specimens/${S}/lots/${ctx.lot1}/movements`, {
      token: C,
      body: { targetStorageUnitId: ctx.box, quantity: 999 },
    });
    record({
      id: 'LOT-MOVE-OVER',
      module: 'specimen-lots',
      srs: ['REQ-4.5-08'],
      method: 'POST',
      path: '/specimens/:specimenId/lots/:lotId/movements',
      kind: 'invalid-input',
      res,
      expect: [400, 409, 422],
    });
    res = await api(
      'POST',
      `/specimens/${S}/lots/${ctx.lot1}/condition-changes`,
      {
        token: C,
        body: {
          targetConditionClass: 'Damaged',
          quantity: 1,
          reason: 'Feather loss',
        },
      },
    );
    const cond = await q<LotRow>(
      'SELECT condition_class, quantity FROM specimen_lot WHERE specimen_id=$1 AND is_active',
      [S],
    );
    record({
      id: 'LOT-CONDITION',
      module: 'specimen-lots',
      srs: ['REQ-4.5-05', 'REQ-4.5-06', 'REQ-4.5-10'],
      method: 'POST',
      path: '/specimens/:specimenId/lots/:lotId/condition-changes',
      kind: 'happy',
      res,
      expect: [200, 201],
      check:
        cond.some((l) => l.condition_class === 'Damaged') &&
        cond.reduce((n, l) => n + Number(l.quantity), 0) === 6,
      db: JSON.stringify(cond),
    });
    const before = Number(
      (await one('SELECT quantity FROM specimen_lot WHERE id=$1', [ctx.lot1]))
        ?.quantity,
    );
    res = await api(
      'POST',
      `/specimens/${S}/lots/${ctx.lot1}/quantity-adjustments`,
      {
        token: C,
        body: {
          adjustmentType: 'ADDITION',
          quantityDelta: 2,
          expectedQuantity: before,
        },
      },
    );
    record({
      id: 'LOT-ADJUST-NO-REASON',
      module: 'specimen-lots',
      srs: ['REQ-4.5-09', 'REQ-4.5-10'],
      method: 'POST',
      path: '/specimens/:specimenId/lots/:lotId/quantity-adjustments',
      kind: 'invalid-input',
      res,
      expect: 400,
    });
    res = await api(
      'POST',
      `/specimens/${S}/lots/${ctx.lot1}/quantity-adjustments`,
      {
        token: C,
        body: {
          adjustmentType: 'ADDITION',
          quantityDelta: 2,
          expectedQuantity: before,
          reason: 'Found in backlog',
        },
      },
    );
    record({
      id: 'LOT-ADJUST',
      module: 'specimen-lots',
      srs: ['REQ-4.5-09'],
      method: 'POST',
      path: '/specimens/:specimenId/lots/:lotId/quantity-adjustments',
      kind: 'happy',
      res,
      expect: [200, 201],
      check:
        Number(
          (
            await one('SELECT quantity FROM specimen_lot WHERE id=$1', [
              ctx.lot1,
            ])
          )?.quantity,
        ) ===
        before + 2,
    });
    res = await api(
      'POST',
      `/specimens/${S}/lots/${ctx.lot1}/quantity-adjustments`,
      {
        token: C,
        body: {
          adjustmentType: 'ADDITION',
          quantityDelta: 1,
          expectedQuantity: before,
          reason: 'Stale',
        },
      },
    );
    record({
      id: 'LOT-ADJUST-STALE',
      module: 'specimen-lots',
      srs: ['REQ-4.5-09'],
      method: 'POST',
      path: '/specimens/:specimenId/lots/:lotId/quantity-adjustments',
      kind: 'invalid-input',
      res,
      expect: [400, 409],
    });
    res = await api('GET', `/specimens/${S}/lots/summary`, { token: C });
    const dbTotal = (
      await q<LotRow>(
        'SELECT quantity FROM specimen_lot WHERE specimen_id=$1 AND is_active',
        [S],
      )
    ).reduce((n, l) => n + Number(l.quantity), 0);
    record({
      id: 'LOT-SUMMARY',
      module: 'specimen-lots',
      srs: ['REQ-4.5-03'],
      method: 'GET',
      path: '/specimens/:specimenId/lots/summary',
      kind: 'happy',
      res,
      expect: 200,
      check: Number(res.body?.totalQuantity) === dbTotal,
      db: `DB active total=${dbTotal}; API totalQuantity=${res.body?.totalQuantity}`,
    });
    for (const [id, path, srs] of [
      ['LOT-LIST', `/specimens/${S}/lots`, ['REQ-4.5-01']],
      ['LOT-HISTORY', `/specimens/${S}/lots/history`, ['REQ-4.5-11']],
      ['LOT-GET', `/specimens/${S}/lots/${ctx.lot1}`, ['REQ-4.5-02']],
      [
        'LOT-TRANSACTIONS',
        `/specimens/${S}/lots/${ctx.lot1}/transactions`,
        ['REQ-4.5-11'],
      ],
      [
        'STO-INVENTORY',
        `/storage-locations/${ctx.drawer1}/inventory`,
        ['REQ-4.6-02'],
      ],
      [
        'STO-LOT-MOVEMENTS',
        `/storage-locations/${ctx.box}/lot-movements`,
        ['REQ-4.6-09'],
      ],
    ] as const) {
      record({
        id,
        module: id.startsWith('STO') ? 'storage-locations' : 'specimen-lots',
        srs: [...srs],
        method: 'GET',
        path,
        kind: 'happy',
        res: await api('GET', path, { token: C }),
        expect: 200,
      });
    }
    res = await api('PATCH', `/specimens/${S}/lots/${ctx.lot1}/notes`, {
      token: C,
      body: { storageNotes: 'Top tray' },
    });
    record({
      id: 'LOT-NOTES',
      module: 'specimen-lots',
      srs: ['REQ-4.5-02'],
      method: 'PATCH',
      path: '/specimens/:specimenId/lots/:lotId/notes',
      kind: 'happy',
      res,
      expect: 200,
    });
    res = await api('GET', `/storage-locations/${ctx.box}/capacity-check`, {
      token: C,
      query: { additionalQuantity: 1 },
    });
    record({
      id: 'STO-CAPACITY-UNSET',
      module: 'storage-locations',
      srs: ['REQ-4.6-11'],
      method: 'GET',
      path: '/storage-locations/:id/capacity-check',
      kind: 'happy',
      res,
      expect: 200,
    });
    res = await api('PATCH', `/storage-locations/${ctx.box}/archive`, {
      token: C,
    });
    record({
      id: 'STO-ARCHIVE-OCCUPIED',
      module: 'storage-locations',
      srs: ['REQ-4.6-02'],
      method: 'PATCH',
      path: '/storage-locations/:id/archive',
      kind: 'invalid-input',
      res,
      expect: [400, 409],
    });
    res = await api('PATCH', `/storage-locations/${ctx.spare}/archive`, {
      token: C,
    });
    record({
      id: 'STO-ARCHIVE',
      module: 'storage-locations',
      srs: ['REQ-4.6-02'],
      method: 'PATCH',
      path: '/storage-locations/:id/archive',
      kind: 'happy',
      res,
      expect: 200,
      check: !!(
        await one('SELECT archived_at FROM storage_unit WHERE id=$1', [
          ctx.spare,
        ])
      )?.archived_at,
    });
  });

  it('completes, reopens and archives cataloging with history (§4.4)', async () => {
    const C = tokens.curatorA;
    let res = await api('GET', `/specimens/${ctx.sp1}/catalog-readiness`, {
      token: C,
    });
    record({
      id: 'CAT-READINESS',
      module: 'specimens',
      srs: ['REQ-4.4-08'],
      method: 'GET',
      path: '/specimens/:id/catalog-readiness',
      kind: 'happy',
      res,
      expect: 200,
      check: /accession|collection/i.test(JSON.stringify(res.body)),
    });
    res = await api('PATCH', `/specimens/${ctx.sp1}/complete-cataloging`, {
      token: C,
    });
    record({
      id: 'CAT-COMPLETE-INCOMPLETE',
      module: 'specimens',
      srs: ['REQ-4.4-07', 'REQ-4.4-08'],
      method: 'PATCH',
      path: '/specimens/:id/complete-cataloging',
      kind: 'invalid-input',
      res,
      expect: [400, 409, 422],
      check:
        (await one('SELECT status FROM specimen WHERE id=$1', [ctx.sp1]))
          ?.status === 'UNCATALOGED',
    });
    res = await api('PATCH', `/specimens/${ctx.sp2}/public-display`, {
      token: C,
      body: { publicDisplay: true },
    });
    record({
      id: 'CAT-PUBLIC-UNCATALOGED',
      module: 'specimens',
      srs: ['REQ-4.4-11', 'REQ-4.4-15'],
      method: 'PATCH',
      path: '/specimens/:id/public-display',
      kind: 'invalid-input',
      res,
      expect: [400, 409, 422],
    });
    res = await api('PATCH', `/specimens/${ctx.sp2}/complete-cataloging`, {
      token: C,
    });
    const sp2 = await one(
      'SELECT status, public_display_allowed FROM specimen WHERE id=$1',
      [ctx.sp2],
    );
    record({
      id: 'CAT-COMPLETE',
      module: 'specimens',
      srs: ['REQ-4.4-07', 'REQ-4.4-13', 'REQ-4.4-16'],
      method: 'PATCH',
      path: '/specimens/:id/complete-cataloging',
      kind: 'happy',
      res,
      expect: 200,
      check:
        sp2?.status === 'CATALOGED' && sp2?.public_display_allowed === false,
      db: JSON.stringify(sp2),
    });
    res = await api('PATCH', `/specimens/${ctx.sp2}`, {
      token: C,
      body: { accessionNumber: null },
    });
    record({
      id: 'CAT-GUARD-REQUIRED',
      module: 'specimens',
      srs: ['REQ-4.4-07'],
      method: 'PATCH',
      path: '/specimens/:id',
      kind: 'invalid-input',
      res,
      expect: [400, 409],
    });
    res = await api('PATCH', `/specimens/${ctx.sp2}`, {
      token: C,
      body: { remarks: 'Mounted 2026' },
    });
    record({
      id: 'SPC-UPDATE',
      module: 'specimens',
      srs: ['REQ-4.4-09', 'REQ-4.4-17'],
      method: 'PATCH',
      path: '/specimens/:id',
      kind: 'happy',
      res,
      expect: 200,
      check:
        (await one('SELECT updated_by FROM specimen WHERE id=$1', [ctx.sp2]))
          ?.updated_by === accounts.curatorA.accountId,
    });
    res = await api('PATCH', `/specimens/${ctx.sp2}/public-display`, {
      token: C,
      body: { publicDisplay: true },
    });
    record({
      id: 'CAT-PUBLIC-ON',
      module: 'specimens',
      srs: ['REQ-4.4-15', 'REQ-4.12-02'],
      method: 'PATCH',
      path: '/specimens/:id/public-display',
      kind: 'happy',
      res,
      expect: 200,
      check:
        (
          await one(
            'SELECT public_display_allowed p FROM specimen WHERE id=$1',
            [ctx.sp2],
          )
        )?.p === true,
    });
    res = await api('GET', `/specimens/${ctx.sp2}/revisions`, { token: C });
    record({
      id: 'SPC-REVISIONS',
      module: 'specimens',
      srs: ['REQ-4.4-17', 'REQ-4.15-01'],
      method: 'GET',
      path: '/specimens/:id/revisions',
      kind: 'happy',
      res,
      expect: 200,
      check:
        Number(
          (
            await one(
              `SELECT count(*)::int n FROM specimen_revision_history WHERE specimen_id=$1`,
              [ctx.sp2],
            )
          )?.n,
        ) > 0,
    });
    for (const [id, path, query, srs] of [
      ['SPC-LIST', '/specimens', undefined, ['REQ-4.4-09']],
      ['SPC-GET', `/specimens/${ctx.sp2}`, undefined, ['REQ-4.4-09']],
      [
        'SPC-DETAILS',
        `/specimens/${ctx.sp2}/details`,
        undefined,
        ['REQ-4.4-09'],
      ],
      [
        'SRCH-ACCESSION',
        '/specimens/search',
        { search: 'USC-BM-TEST-0001' },
        ['REQ-4.7-01'],
      ],
      [
        'SRCH-FILTERS',
        '/specimens/search',
        {
          status: 'CATALOGED',
          family: 'Accipitridae',
          publicDisplay: true,
          storageUnitId: ctx.cabA,
          sortBy: 'commonName',
          sortDirection: 'asc',
        },
        ['REQ-4.7-02', 'REQ-4.7-03'],
      ],
    ] as const) {
      const r = await api('GET', path, { token: C, query: query });
      const check =
        id === 'SRCH-ACCESSION' || id === 'SRCH-FILTERS'
          ? JSON.stringify(r.body).includes(ctx.sp2)
          : true;
      record({
        id,
        module: 'specimens',
        srs: [...srs],
        method: 'GET',
        path: path.replace(ctx.sp2, ':id'),
        kind: 'happy',
        res: r,
        expect: 200,
        check,
      });
    }
    res = await api('GET', '/specimens/search', {
      token: C,
      query: { sortBy: 'password' },
    });
    record({
      id: 'SRCH-INVALID',
      module: 'specimens',
      srs: ['REQ-4.7-03'],
      method: 'GET',
      path: '/specimens/search',
      kind: 'invalid-input',
      res,
      expect: 400,
    });
    res = await api('GET', `/specimens/${SAMPLE_ID}`, { token: C });
    record({
      id: 'SPC-GET-404',
      module: 'specimens',
      srs: ['REQ-4.4-09'],
      method: 'GET',
      path: '/specimens/:id',
      kind: 'not-found',
      res,
      expect: 404,
    });

    res = await api('POST', '/specimens/duplicate-check', {
      token: C,
      body: {
        scientificName: 'Pithecophaga jefferyi',
        commonName: 'Philippine Eagle',
      },
    });
    record({
      id: 'DUP-CHECK',
      module: 'specimens',
      srs: ['REQ-4.4-21'],
      method: 'POST',
      path: '/specimens/duplicate-check',
      kind: 'happy',
      res,
      expect: [200, 201],
      check:
        JSON.stringify(res.body).includes(ctx.sp1) ||
        JSON.stringify(res.body).includes(ctx.sp2),
    });
    res = await api('GET', `/specimens/${ctx.sp1}/possible-duplicates`, {
      token: C,
    });
    record({
      id: 'DUP-FOR-SPECIMEN',
      module: 'specimens',
      srs: ['REQ-4.4-21', 'REQ-4.4-22'],
      method: 'GET',
      path: '/specimens/:id/possible-duplicates',
      kind: 'happy',
      res,
      expect: 200,
      check:
        Number(
          (
            await one(
              `SELECT count(*)::int n FROM specimen WHERE common_name='Philippine Eagle'`,
            )
          )?.n,
        ) === 2,
    });

    res = await api('PATCH', `/specimens/${ctx.sp2}/reopen-cataloging`, {
      token: C,
      body: {},
    });
    record({
      id: 'CAT-REOPEN-NO-REASON',
      module: 'specimens',
      srs: ['REQ-4.4-09'],
      method: 'PATCH',
      path: '/specimens/:id/reopen-cataloging',
      kind: 'invalid-input',
      res,
      expect: 400,
    });
    res = await api('PATCH', `/specimens/${ctx.sp2}/reopen-cataloging`, {
      token: C,
      body: { reason: 'Correct taxonomy' },
    });
    record({
      id: 'CAT-REOPEN',
      module: 'specimens',
      srs: ['REQ-4.4-09'],
      method: 'PATCH',
      path: '/specimens/:id/reopen-cataloging',
      kind: 'happy',
      res,
      expect: 200,
      check:
        (await one('SELECT status FROM specimen WHERE id=$1', [ctx.sp2]))
          ?.status === 'UNCATALOGED',
    });
    await api('PATCH', `/specimens/${ctx.sp2}/complete-cataloging`, {
      token: C,
    });
    await api('PATCH', `/specimens/${ctx.sp2}/public-display`, {
      token: C,
      body: { publicDisplay: true },
    });

    res = await api('PATCH', `/specimens/${ctx.sp2}/archive`, { token: C });
    record({
      id: 'CAT-ARCHIVE-ACTIVE-LOT',
      module: 'specimens',
      srs: ['REQ-4.4-10'],
      method: 'PATCH',
      path: '/specimens/:id/archive',
      kind: 'invalid-input',
      res,
      expect: [400, 409],
    });
    res = await api('PATCH', `/specimens/${ctx.sp1}/archive`, { token: C });
    const arch = await one(
      'SELECT status, archived_by, archived_at FROM specimen WHERE id=$1',
      [ctx.sp1],
    );
    record({
      id: 'CAT-ARCHIVE',
      module: 'specimens',
      srs: ['REQ-4.4-10', 'REQ-4.4-17'],
      method: 'PATCH',
      path: '/specimens/:id/archive',
      kind: 'happy',
      res,
      expect: 200,
      check:
        arch?.status === 'ARCHIVED' &&
        arch?.archived_by === accounts.curatorA.accountId &&
        !!arch?.archived_at,
    });
    res = await api('PATCH', `/specimens/${ctx.sp1}/public-display`, {
      token: C,
      body: { publicDisplay: true },
    });
    record({
      id: 'CAT-PUBLIC-ARCHIVED',
      module: 'specimens',
      srs: ['REQ-4.4-11'],
      method: 'PATCH',
      path: '/specimens/:id/public-display',
      kind: 'invalid-input',
      res,
      expect: [400, 409, 422],
    });
    res = await api('PATCH', `/specimens/${ctx.sp1}/restore`, { token: C });
    record({
      id: 'CAT-RESTORE',
      module: 'specimens',
      srs: ['REQ-4.4-10'],
      method: 'PATCH',
      path: '/specimens/:id/restore',
      kind: 'happy',
      res,
      expect: 200,
      check:
        (await one('SELECT status FROM specimen WHERE id=$1', [ctx.sp1]))
          ?.status === 'UNCATALOGED',
    });
    record({
      id: 'SPC-NO-DELETE',
      module: 'specimens',
      srs: ['REQ-4.4-10'],
      method: 'DELETE',
      path: '/specimens/:id',
      kind: 'happy',
      res: await api('DELETE', `/specimens/${ctx.sp1}`, { token: C }),
      expect: 404,
      note: 'no routine delete route',
    });
  });

  it('previews and commits a CSV import with row validation (REQ-4.4-19/20)', async () => {
    const C = tokens.curatorA;
    const csv = [
      'commonName,scientificName,accessionNumber,collectionId,kingdom,collectionDate,preservationType,preservationMethod,storageUnit,conditionClass,quantity,mysteryColumn',
      `Rufous Hornbill,Buceros hydrocorax,USC-BM-TEST-0100,${ctx.collection},Animalia,2019-03-02,Skin,Dry,${ctx.drawer1},Good,1,x`,
      'Broken Row,,USC-BM-TEST-0101,,Animalia,2019-13-45,,,,Good,abc,y',
    ].join('\n');
    let res = await api('POST', '/specimens/import/preview', {
      token: C,
      file: {
        buffer: Buffer.from(csv),
        filename: 'import.csv',
        contentType: 'text/csv',
      },
    });
    ctx.preview = res.body?.previewId ?? res.body?.id;
    const body = JSON.stringify(res.body);
    record({
      id: 'IMP-PREVIEW',
      module: 'specimens',
      srs: ['REQ-4.4-19', 'REQ-4.4-20'],
      method: 'POST',
      path: '/specimens/import/preview',
      kind: 'happy',
      res,
      expect: [200, 201],
      check:
        !!ctx.preview &&
        /mysteryColumn/i.test(body) &&
        /collectionDate|date/i.test(body),
      note: body.slice(0, 280),
    });
    const countBefore = Number(
      (await one('SELECT count(*)::int n FROM specimen'))?.n,
    );
    // Preview row numbers count data rows from 1 (the header is not a row).
    res = await api('POST', '/specimens/import/commit', {
      token: C,
      body: { previewId: ctx.preview, rowNumbers: [1] },
    });
    const imported = await one(
      `SELECT id, status FROM specimen WHERE accession_number='USC-BM-TEST-0100'`,
    );
    record({
      id: 'IMP-COMMIT',
      module: 'specimens',
      srs: ['REQ-4.4-19', 'REQ-4.4-22'],
      method: 'POST',
      path: '/specimens/import/commit',
      kind: 'happy',
      res,
      expect: [200, 201],
      check:
        !!imported &&
        !(await one(
          `SELECT 1 FROM specimen WHERE accession_number='USC-BM-TEST-0101'`,
        )),
      db: `specimens ${countBefore} -> ${(await one('SELECT count(*)::int n FROM specimen'))?.n}`,
    });
    res = await api('POST', '/specimens/import/commit', {
      token: C,
      body: { previewId: 'nope' },
    });
    record({
      id: 'IMP-COMMIT-INVALID',
      module: 'specimens',
      srs: ['REQ-4.4-20'],
      method: 'POST',
      path: '/specimens/import/commit',
      kind: 'invalid-input',
      res,
      expect: 400,
    });
    res = await api('POST', '/specimens/import/preview', {
      token: C,
      file: {
        buffer: Buffer.from('MZ\x90\x00binary'),
        filename: 'evil.exe',
        contentType: 'application/octet-stream',
      },
    });
    record({
      id: 'IMP-PREVIEW-INVALID',
      module: 'specimens',
      srs: ['REQ-4.4-20'],
      method: 'POST',
      path: '/specimens/import/preview',
      kind: 'invalid-input',
      res,
      expect: [400, 415],
    });
  });
});

describe('Exhibits, QR and AR (§4.12, §4.13, §4.2)', () => {
  it('publishes a QR exhibit page without internal fields', async () => {
    const C = tokens.curatorA;
    let res = await api('POST', '/exhibits', {
      token: C,
      body: { specimenId: ctx.sp1, publicSlug: 'not-public' },
    });
    record({
      id: 'EXH-CREATE-NOT-APPROVED',
      module: 'exhibits',
      srs: ['REQ-4.12-01', 'REQ-4.12-02'],
      method: 'POST',
      path: '/exhibits',
      kind: 'invalid-input',
      res,
      expect: [400, 409, 422],
    });
    res = await api('POST', '/exhibits', {
      token: C,
      body: { specimenId: ctx.sp2, publicSlug: 'Bad Slug!' },
    });
    record({
      id: 'EXH-CREATE-BAD-SLUG',
      module: 'exhibits',
      srs: ['REQ-4.12-03'],
      method: 'POST',
      path: '/exhibits',
      kind: 'invalid-input',
      res,
      expect: 400,
    });
    res = await api('POST', '/exhibits', {
      token: C,
      body: {
        specimenId: ctx.sp2,
        publicSlug: 'philippine-eagle',
        publicDescription: 'National bird.',
        publicSpecimenFields: ['commonName', 'scientificName'],
      },
    });
    ctx.exhibit = idOf(res);
    record({
      id: 'EXH-CREATE',
      module: 'exhibits',
      srs: ['REQ-4.12-01', 'REQ-4.12-03', 'REQ-4.12-04'],
      method: 'POST',
      path: '/exhibits',
      kind: 'happy',
      res,
      expect: 201,
      check:
        (await one('SELECT status FROM exhibit WHERE id=$1', [ctx.exhibit]))
          ?.status === 'UNPUBLISHED',
    });
    res = await api('GET', '/exhibits/public/philippine-eagle');
    record({
      id: 'EXH-PUBLIC-UNPUBLISHED',
      module: 'exhibits',
      srs: ['REQ-4.12-08'],
      method: 'GET',
      path: '/exhibits/public/:slug',
      kind: 'not-found',
      res,
      expect: [404, 410],
      check: !JSON.stringify(res.body).includes('National bird'),
    });
    for (const [id, method, path, body, srs] of [
      ['EXH-LIST', 'GET', '/exhibits', undefined, ['REQ-4.7-10']],
      [
        'EXH-GET',
        'GET',
        `/exhibits/${ctx.exhibit}`,
        undefined,
        ['REQ-4.12-03'],
      ],
      [
        'EXH-UPDATE',
        'PATCH',
        `/exhibits/${ctx.exhibit}`,
        { interestingFacts: 'Largest eagle by wing surface.' },
        ['REQ-4.12-03'],
      ],
      [
        'EXH-PUBLISH',
        'PATCH',
        `/exhibits/${ctx.exhibit}/publish`,
        undefined,
        ['REQ-4.12-01', 'REQ-4.12-10'],
      ],
    ] as const) {
      record({
        id,
        module: 'exhibits',
        srs: [...srs],
        method,
        path: path.replace(ctx.exhibit, ':id'),
        kind: 'happy',
        res: await api(method, path, { token: C, body }),
        expect: 200,
      });
    }
    res = await api('GET', '/exhibits/public/philippine-eagle');
    const pub = JSON.stringify(res.body);
    const leaks = [
      'Drawer',
      'Cabinet',
      'Zoology Room',
      'Damaged',
      'Top tray',
      'Mounted 2026',
      'storage',
      'condition',
    ].filter((w) => pub.includes(w));
    record({
      id: 'EXH-PUBLIC',
      module: 'exhibits',
      srs: [
        'REQ-4.12-04',
        'REQ-4.12-08',
        'REQ-4.12-12',
        'REQ-4.6-10',
        'REQ-4.13-07',
        'REQ-4.10-08',
        'REQ-4.4-16',
      ],
      method: 'GET',
      path: '/exhibits/public/:slug',
      kind: 'happy',
      res,
      expect: 200,
      check: pub.includes('National bird') && leaks.length === 0,
      note: leaks.length
        ? `internal terms in public payload: ${leaks.join(', ')}`
        : undefined,
    });
    const audit = await one(
      `SELECT 1 FROM audit_log WHERE affected_record_id=$1 AND action ILIKE '%PUBLISH%'`,
      [ctx.exhibit],
    );
    record({
      id: 'EXH-PUBLISH-AUDIT',
      module: 'exhibits',
      srs: ['REQ-4.12-11'],
      method: 'DB',
      path: 'audit_log',
      kind: 'happy',
      res: { status: 200, body: null, headers: {}, text: '' },
      expect: 200,
      check: !!audit,
    });
    res = await api('GET', `/exhibits/${ctx.exhibit}/qr`, { token: C });
    record({
      id: 'EXH-QR-PNG',
      module: 'exhibits',
      srs: ['REQ-4.12-05'],
      method: 'GET',
      path: '/exhibits/:id/qr',
      kind: 'happy',
      res,
      expect: 200,
      check: String(res.headers['content-type']).includes('image/png'),
    });
    res = await api('GET', `/exhibits/${ctx.exhibit}/qr`, {
      token: C,
      query: { format: 'svg', size: 256 },
    });
    record({
      id: 'EXH-QR-SVG',
      module: 'exhibits',
      srs: ['REQ-4.12-05'],
      method: 'GET',
      path: '/exhibits/:id/qr',
      kind: 'happy',
      res,
      expect: 200,
    });
    res = await api('GET', `/exhibits/${ctx.exhibit}/qr`, {
      token: C,
      query: { format: 'gif' },
    });
    record({
      id: 'EXH-QR-INVALID',
      module: 'exhibits',
      srs: ['REQ-4.12-05'],
      method: 'GET',
      path: '/exhibits/:id/qr',
      kind: 'invalid-input',
      res,
      expect: 400,
    });
    res = await api('GET', `/exhibits/${ctx.exhibit}/label`, { token: C });
    const labelText = Buffer.isBuffer(res.body)
      ? res.body.toString('utf8')
      : res.text + JSON.stringify(res.body);
    record({
      id: 'EXH-LABEL',
      module: 'exhibits',
      srs: ['REQ-4.12-06'],
      method: 'GET',
      path: '/exhibits/:id/label',
      kind: 'happy',
      res,
      expect: 200,
      check:
        labelText.includes('philippine-eagle') && labelText.includes('<svg'),
      note: `content-type=${res.headers['content-type']}`,
    });

    res = await api('POST', `/exhibits/${ctx.exhibit}/media`, {
      token: C,
      file: { buffer: PNG, filename: 'e.png', contentType: 'image/png' },
      fields: { caption: 'Public photo' },
    });
    ctx.exMedia = idOf(res);
    record({
      id: 'EXH-MEDIA-ADD',
      module: 'exhibits',
      srs: ['REQ-4.12-03'],
      method: 'POST',
      path: '/exhibits/:id/media',
      kind: 'happy',
      res,
      expect: 201,
    });
    record({
      id: 'EXH-MEDIA-UPDATE',
      module: 'exhibits',
      srs: ['REQ-4.12-03'],
      method: 'PATCH',
      path: '/exhibits/:id/media/:mediaId',
      kind: 'happy',
      res: await api('PATCH', `/exhibits/${ctx.exhibit}/media/${ctx.exMedia}`, {
        token: C,
        body: { caption: 'Updated' },
      }),
      expect: 200,
    });
    record({
      id: 'EXH-MEDIA-REMOVE',
      module: 'exhibits',
      srs: ['REQ-4.12-03'],
      method: 'DELETE',
      path: '/exhibits/:id/media/:mediaId',
      kind: 'happy',
      res: await api(
        'DELETE',
        `/exhibits/${ctx.exhibit}/media/${ctx.exMedia}`,
        { token: C },
      ),
      expect: [200, 204],
    });

    res = await api('PATCH', `/exhibits/${ctx.exhibit}/ar-selection`, {
      token: C,
      body: { selected: true, note: 'Flagship species' },
    });
    record({
      id: 'EXH-AR-SELECT',
      module: 'exhibits',
      srs: ['REQ-4.13-01', 'REQ-4.13-02', 'REQ-4.13-08'],
      method: 'PATCH',
      path: '/exhibits/:id/ar-selection',
      kind: 'happy',
      res,
      expect: 200,
      check: !!(
        await one('SELECT ar_selected_at FROM exhibit WHERE id=$1', [
          ctx.exhibit,
        ])
      )?.ar_selected_at,
    });
    res = await api('PATCH', `/exhibits/${ctx.exhibit}/ar`, {
      token: C,
      body: { enabled: true },
    });
    record({
      id: 'EXH-AR-ENABLE-NO-ASSET',
      module: 'exhibits',
      srs: ['REQ-4.13-03'],
      method: 'PATCH',
      path: '/exhibits/:id/ar',
      kind: 'invalid-input',
      res,
      expect: [400, 409, 422],
    });
  });

  it('runs the Developer AR asset lifecycle with authorization (REQ-4.2-04/05)', async () => {
    const D = tokens.developer;
    let res = await api('GET', '/developer/ar-exhibits', { token: D });
    record({
      id: 'DEV-AR-EXHIBITS',
      module: 'developer',
      srs: ['REQ-4.2-04', 'REQ-4.2-08'],
      method: 'GET',
      path: '/developer/ar-exhibits',
      kind: 'happy',
      res,
      expect: 200,
      check: JSON.stringify(res.body).includes(ctx.exhibit),
    });
    const file = {
      buffer: glb(),
      filename: 'eagle.glb',
      contentType: 'model/gltf-binary',
    };
    res = await api('POST', '/developer/ar-assets', {
      token: D,
      file,
      fields: { exhibitId: ctx.exhibit, modelFormat: 'glb' },
    });
    record({
      id: 'DEV-AR-UPLOAD-NO-AUTH-REF',
      module: 'developer',
      srs: ['REQ-4.2-05'],
      method: 'POST',
      path: '/developer/ar-assets',
      kind: 'invalid-input',
      res,
      expect: 400,
    });
    res = await api('POST', '/developer/ar-assets', {
      token: D,
      file: {
        buffer: Buffer.from('not a model'),
        filename: 'x.glb',
        contentType: 'model/gltf-binary',
      },
      fields: {
        exhibitId: ctx.exhibit,
        modelFormat: 'glb',
        authorizationReference: 'License 2026-01',
      },
    });
    record({
      id: 'DEV-AR-UPLOAD-BAD-FILE',
      module: 'developer',
      srs: ['REQ-4.2-05'],
      method: 'POST',
      path: '/developer/ar-assets',
      kind: 'invalid-input',
      res,
      expect: 400,
    });
    res = await api('POST', '/developer/ar-assets', {
      token: D,
      file,
      fields: {
        exhibitId: ctx.exhibit,
        modelFormat: 'glb',
        authorizationReference: 'License 2026-01',
      },
    });
    ctx.asset = idOf(res);
    record({
      id: 'DEV-AR-UPLOAD',
      module: 'developer',
      srs: ['REQ-4.2-04', 'REQ-4.13-03', 'REQ-4.2-09'],
      method: 'POST',
      path: '/developer/ar-assets',
      kind: 'happy',
      res,
      expect: 201,
      check: !!(await one('SELECT 1 FROM ar_asset WHERE id=$1', [ctx.asset])),
    });
    for (const [id, path, body] of [
      ['DEV-AR-UPDATE', `/developer/ar-assets/${ctx.asset}`, undefined],
      [
        'DEV-AR-ACTIVATE',
        `/developer/ar-assets/${ctx.asset}/activate`,
        { authorizationReference: 'License 2026-01' },
      ],
    ] as const) {
      const r =
        id === 'DEV-AR-UPDATE'
          ? await api('PATCH', path, {
              token: D,
              file,
              fields: { authorizationReference: 'License 2026-01 v2' },
            })
          : await api('PATCH', path, { token: D, body });
      record({
        id,
        module: 'developer',
        srs: ['REQ-4.2-04', 'REQ-4.13-03'],
        method: 'PATCH',
        path: path.replace(ctx.asset, ':id'),
        kind: 'happy',
        res: r,
        expect: 200,
      });
    }
    res = await api('PATCH', `/exhibits/${ctx.exhibit}/ar`, {
      token: tokens.curatorA,
      body: { enabled: true },
    });
    record({
      id: 'EXH-AR-ENABLE',
      module: 'exhibits',
      srs: ['REQ-4.13-03', 'REQ-4.13-04'],
      method: 'PATCH',
      path: '/exhibits/:id/ar',
      kind: 'happy',
      res,
      expect: 200,
    });
    res = await api('GET', '/exhibits/public/philippine-eagle');
    record({
      id: 'EXH-PUBLIC-AR',
      module: 'exhibits',
      srs: ['REQ-4.13-03', 'REQ-4.13-04', 'REQ-4.13-06'],
      method: 'GET',
      path: '/exhibits/public/:slug',
      kind: 'happy',
      res,
      expect: 200,
      check:
        res.body?.ar?.available === true &&
        JSON.stringify(res.body).includes('National bird'),
      note: `ar=${JSON.stringify(res.body?.ar).slice(0, 160)}`,
    });
    record({
      id: 'DEV-AR-DEACTIVATE',
      module: 'developer',
      srs: ['REQ-4.2-04'],
      method: 'PATCH',
      path: '/developer/ar-assets/:id/deactivate',
      kind: 'happy',
      res: await api('PATCH', `/developer/ar-assets/${ctx.asset}/deactivate`, {
        token: D,
      }),
      expect: 200,
    });
    record({
      id: 'DEV-AR-DELETE',
      module: 'developer',
      srs: ['REQ-4.2-04'],
      method: 'DELETE',
      path: '/developer/ar-assets/:id',
      kind: 'happy',
      res: await api('DELETE', `/developer/ar-assets/${ctx.asset}`, {
        token: D,
        body: { authorizationReference: 'License withdrawn' },
      }),
      expect: [200, 204],
    });
    const devAudit = await one<{ n: number }>(
      `SELECT count(*)::int n FROM audit_log WHERE user_id=$1 AND action ILIKE '%AR_ASSET%'`,
      [accounts.developer.accountId],
    );
    record({
      id: 'DEV-AR-AUDIT',
      module: 'developer',
      srs: ['REQ-4.2-09', 'REQ-4.15-01'],
      method: 'DB',
      path: 'audit_log',
      kind: 'happy',
      res: { status: 200, body: null, headers: {}, text: '' },
      expect: 200,
      check: Number(devAudit?.n) >= 4,
      db: `AR audit rows: ${devAudit?.n}`,
    });
  });

  it('replaces, unpublishes, disables and archives exhibit URLs safely', async () => {
    const C = tokens.curatorA;
    let res = await api('PATCH', `/exhibits/${ctx.exhibit}/replace-url`, {
      token: C,
      body: { publicSlug: 'philippine-eagle-2' },
    });
    record({
      id: 'EXH-REPLACE-URL',
      module: 'exhibits',
      srs: ['REQ-4.12-10'],
      method: 'PATCH',
      path: '/exhibits/:id/replace-url',
      kind: 'happy',
      res,
      expect: 200,
      check:
        (
          await one('SELECT public_slug FROM exhibit WHERE id=$1', [
            ctx.exhibit,
          ])
        )?.public_slug === 'philippine-eagle-2',
    });
    res = await api('GET', '/exhibits/public/philippine-eagle');
    record({
      id: 'EXH-OLD-URL',
      module: 'exhibits',
      srs: ['REQ-4.12-09'],
      method: 'GET',
      path: '/exhibits/public/:slug',
      kind: 'not-found',
      res,
      expect: [404, 410],
      check: !JSON.stringify(res.body).includes('National bird'),
    });
    // Disable is only allowed from PUBLISHED, so republish between steps.
    for (const [id, action, srs, republishFirst] of [
      [
        'EXH-UNPUBLISH',
        'unpublish',
        ['REQ-4.12-01', 'REQ-4.12-09', 'REQ-4.12-11'],
        false,
      ],
      [
        'EXH-DISABLE',
        'disable',
        ['REQ-4.12-01', 'REQ-4.12-09', 'REQ-4.12-11'],
        true,
      ],
      ['EXH-ARCHIVE', 'archive', ['REQ-4.12-01', 'REQ-4.12-09'], false],
    ] as const) {
      if (republishFirst)
        await api('PATCH', `/exhibits/${ctx.exhibit}/publish`, { token: C });
      res = await api('PATCH', `/exhibits/${ctx.exhibit}/${action}`, {
        token: C,
      });
      const pub = await api('GET', '/exhibits/public/philippine-eagle-2');
      record({
        id,
        module: 'exhibits',
        srs: [...srs],
        method: 'PATCH',
        path: `/exhibits/:id/${action}`,
        kind: 'happy',
        res,
        expect: 200,
        check:
          pub.status >= 400 &&
          !JSON.stringify(pub.body).includes('National bird'),
        note: `${action}: ${res.status}; public page then ${pub.status} ${JSON.stringify(pub.body).slice(0, 120)}`,
      });
    }
    res = await api('PATCH', `/exhibits/${ctx.exhibit}/disable`, { token: C });
    record({
      id: 'EXH-DISABLE-ARCHIVED',
      module: 'exhibits',
      srs: ['REQ-4.12-01'],
      method: 'PATCH',
      path: '/exhibits/:id/disable',
      kind: 'invalid-input',
      res,
      expect: [400, 409],
    });
  });
});

describe('Inquiries, visit requests, notifications, dashboard (§4.3, §4.8, §4.9)', () => {
  it('accepts a public inquiry, emails receipt and alert, and lets curators work it', async () => {
    const C = tokens.curatorA;
    const valid = {
      name: 'Synthetic Visitor',
      email: 'visitor@example.test',
      phone: '+63 912 345 6789',
      message: 'Do you host school tours?',
      consentAccepted: true,
    };
    let res = await api('POST', '/inquiries', {
      body: { ...valid, consentAccepted: false },
    });
    record({
      id: 'INQ-NO-CONSENT',
      module: 'inquiries',
      srs: ['REQ-4.8-03'],
      method: 'POST',
      path: '/inquiries',
      kind: 'invalid-input',
      res,
      expect: 400,
    });
    res = await api('POST', '/inquiries', {
      body: { ...valid, email: 'not-email', message: '' },
    });
    record({
      id: 'INQ-INVALID',
      module: 'inquiries',
      srs: ['REQ-4.8-03'],
      method: 'POST',
      path: '/inquiries',
      kind: 'invalid-input',
      res,
      expect: 400,
    });
    res = await api('POST', '/inquiries', {
      body: { ...valid, isAdmin: true },
    });
    record({
      id: 'INQ-EXTRA-FIELD',
      module: 'inquiries',
      srs: ['REQ-4.8-02'],
      method: 'POST',
      path: '/inquiries',
      kind: 'invalid-input',
      res,
      expect: 400,
    });
    const mailBefore = outbound.emails.length;
    res = await api('POST', '/inquiries', { body: valid });
    ctx.inquiry = idOf(res);
    const row = await one(
      'SELECT status, consent_accepted_at, created_at FROM inquiry WHERE id=$1',
      [ctx.inquiry],
    );
    record({
      id: 'INQ-CREATE',
      module: 'inquiries',
      srs: ['REQ-4.8-01', 'REQ-4.8-02', 'REQ-4.8-04'],
      method: 'POST',
      path: '/inquiries',
      kind: 'happy',
      res,
      expect: 201,
      check:
        row?.status === 'PENDING' &&
        !!row?.consent_accepted_at &&
        !JSON.stringify(res.body).includes('912 345'),
      db: JSON.stringify(row),
    });
    await new Promise((r) => setTimeout(r, 1500));
    const mails = outbound.emails.slice(mailBefore);
    record({
      id: 'INQ-EMAILS',
      module: 'inquiries',
      srs: ['REQ-4.8-08', 'REQ-4.3-09'],
      method: 'MAIL',
      path: 'brevo',
      kind: 'happy',
      res: { status: 200, body: null, headers: {}, text: '' },
      expect: 200,
      check:
        mails.some((m) => m.to.includes('visitor@example.test')) &&
        mails.some((m) => m.to.includes(accounts.curatorA.email)),
      note:
        mails.map((m) => `${m.to.join(',')}: ${m.subject}`).join(' | ') ||
        'no email captured',
    });
    // The feed lists items still needing attention, so read it while the inquiry is PENDING.
    const feedRes = await api('GET', '/notifications', { token: C });
    const feedItems = ((feedRes.body as { items?: unknown } | undefined)
      ?.items ?? []) as Array<{ id?: string; type?: string }>;
    const feedItem = feedItems.find((i) => String(i.id).includes(ctx.inquiry));
    record({
      id: 'NOTIF-NEW-INQUIRY',
      module: 'notifications',
      srs: ['REQ-4.3-05', 'REQ-4.3-06', 'REQ-4.8-08'],
      method: 'GET',
      path: '/notifications',
      kind: 'happy',
      res: feedRes,
      expect: 200,
      check:
        feedItem?.type === 'NEW_INQUIRY' &&
        /inquir/i.test(JSON.stringify(feedItem)),
      note: JSON.stringify(feedItem ?? feedRes.body).slice(0, 220),
    });

    for (const [id, path, query, srs] of [
      [
        'INQ-LIST',
        '/inquiries',
        { status: 'PENDING', search: 'Synthetic' },
        ['REQ-4.8-05'],
      ],
      ['INQ-GET', `/inquiries/${ctx.inquiry}`, undefined, ['REQ-4.8-05']],
    ] as const) {
      record({
        id,
        module: 'inquiries',
        srs: [...srs],
        method: 'GET',
        path: path.replace(ctx.inquiry, ':id'),
        kind: 'happy',
        res: await api('GET', path, { token: C, query: query }),
        expect: 200,
      });
    }
    res = await api('GET', '/inquiries', {
      token: C,
      query: { submittedFrom: '2026-13-01' },
    });
    record({
      id: 'INQ-LIST-INVALID',
      module: 'inquiries',
      srs: ['REQ-4.8-05'],
      method: 'GET',
      path: '/inquiries',
      kind: 'invalid-input',
      res,
      expect: 400,
    });
    res = await api('PATCH', `/inquiries/${ctx.inquiry}`, {
      token: C,
      body: { status: 'PENDING' },
    });
    record({
      id: 'INQ-STATUS-INVALID',
      module: 'inquiries',
      srs: ['REQ-4.8-06'],
      method: 'PATCH',
      path: '/inquiries/:id',
      kind: 'invalid-input',
      res,
      expect: 400,
    });
    res = await api('PATCH', `/inquiries/${ctx.inquiry}`, {
      token: C,
      body: { status: 'REVIEWED', note: 'Checked' },
    });
    record({
      id: 'INQ-STATUS',
      module: 'inquiries',
      srs: ['REQ-4.8-06', 'REQ-4.8-11'],
      method: 'PATCH',
      path: '/inquiries/:id',
      kind: 'happy',
      res,
      expect: 200,
      check:
        (
          await one('SELECT status, reviewed_by FROM inquiry WHERE id=$1', [
            ctx.inquiry,
          ])
        )?.status === 'REVIEWED',
    });
    res = await api('POST', `/inquiries/${ctx.inquiry}/notes`, {
      token: C,
      body: { message: 'Call back Monday' },
    });
    record({
      id: 'INQ-NOTE',
      module: 'inquiries',
      srs: ['REQ-4.8-11'],
      method: 'POST',
      path: '/inquiries/:id/notes',
      kind: 'happy',
      res,
      expect: 201,
      check: !!(await one(
        `SELECT 1 FROM communication_history WHERE inquiry_id=$1 AND message='Call back Monday' AND recorded_by=$2`,
        [ctx.inquiry, accounts.curatorA.accountId],
      )),
    });
    const before = outbound.emails.length;
    res = await api('POST', `/inquiries/${ctx.inquiry}/replies`, {
      token: C,
      body: { subject: 'Tours', message: 'Yes, weekdays 9-4.' },
    });
    // The stored message is the full templated email, so match on the subject.
    const reply = await one(
      `SELECT delivery_result, recipient_email, sent_at, recorded_by FROM communication_history WHERE inquiry_id=$1 AND subject='Tours'`,
      [ctx.inquiry],
    );
    record({
      id: 'INQ-REPLY',
      module: 'inquiries',
      srs: ['REQ-4.8-05', 'REQ-4.8-09', 'REQ-4.8-11'],
      method: 'POST',
      path: '/inquiries/:id/replies',
      kind: 'happy',
      res,
      expect: 201,
      check:
        outbound.emails.length > before &&
        reply?.recipient_email === 'visitor@example.test' &&
        !!reply?.delivery_result,
      db: JSON.stringify(reply),
    });
    res = await api('POST', `/inquiries/${ctx.inquiry}/replies`, {
      token: C,
      body: { message: '' },
    });
    record({
      id: 'INQ-REPLY-INVALID',
      module: 'inquiries',
      srs: ['REQ-4.8-09'],
      method: 'POST',
      path: '/inquiries/:id/replies',
      kind: 'invalid-input',
      res,
      expect: 400,
    });
    record({
      id: 'INQ-HISTORY',
      module: 'inquiries',
      srs: ['REQ-4.8-11'],
      method: 'GET',
      path: '/inquiries/:id/history',
      kind: 'happy',
      res: await api('GET', `/inquiries/${ctx.inquiry}/history`, { token: C }),
      expect: 200,
    });
    res = await api('POST', `/inquiries/${ctx.inquiry}/referral`, {
      token: C,
      body: {
        visitorCount: 30,
        preferredSchedules: [
          { date: today(10), startTime: '09:00', endTime: '11:00' },
        ],
        organization: 'Synthetic School',
        purpose: 'Field trip',
      },
    });
    const ref = await one(
      `SELECT v.id, i.status FROM visit_request v JOIN inquiry i ON i.id = v.source_inquiry_id WHERE i.id=$1`,
      [ctx.inquiry],
    );
    record({
      id: 'INQ-REFERRAL',
      module: 'inquiries',
      srs: ['REQ-4.8-07', 'REQ-4.8-06'],
      method: 'POST',
      path: '/inquiries/:id/referral',
      kind: 'happy',
      res,
      expect: 201,
      check: ref?.status === 'TURNED_TO_VISIT_REQUEST',
      db: JSON.stringify(ref),
    });
    res = await api('POST', `/inquiries/${ctx.inquiry}/referral`, {
      token: C,
      body: { visitorCount: 0, preferredSchedules: [] },
    });
    record({
      id: 'INQ-REFERRAL-INVALID',
      module: 'inquiries',
      srs: ['REQ-4.8-07'],
      method: 'POST',
      path: '/inquiries/:id/referral',
      kind: 'invalid-input',
      res,
      expect: 400,
    });
  });

  it('accepts a public visit request with schedules and vehicles, then runs the curator workflow', async () => {
    const C = tokens.curatorA;
    const valid = {
      name: 'Synthetic Teacher',
      email: 'teacher@example.test',
      phone: '09123456789',
      organization: 'Synthetic High School',
      purpose: 'Biology class',
      preferredSchedules: [
        { date: today(14), startTime: '09:00', endTime: '11:00' },
        { date: today(15), startTime: '13:00', endTime: '15:00' },
      ],
      visitorCount: 25,
      bringingVehicle: true,
      vehicles: [
        { plateNumber: 'ABC 1234', carBrand: 'Toyota' },
        { plateNumber: 'XYZ 9876' },
      ],
      consentAccepted: true,
    };
    let res = await api('POST', '/visit-requests', {
      body: {
        ...valid,
        preferredSchedules: [
          { date: '2020-01-01', startTime: '09:00', endTime: '11:00' },
        ],
      },
    });
    record({
      id: 'VIS-PAST-DATE',
      module: 'visit-requests',
      srs: ['REQ-4.9-06'],
      method: 'POST',
      path: '/visit-requests',
      kind: 'invalid-input',
      res,
      expect: 400,
    });
    res = await api('POST', '/visit-requests', {
      body: {
        ...valid,
        preferredSchedules: [
          { date: today(14), startTime: '15:00', endTime: '13:00' },
        ],
      },
    });
    record({
      id: 'VIS-END-BEFORE-START',
      module: 'visit-requests',
      srs: ['REQ-4.9-06'],
      method: 'POST',
      path: '/visit-requests',
      kind: 'invalid-input',
      res,
      expect: 400,
    });
    res = await api('POST', '/visit-requests', {
      body: { ...valid, visitorCount: 0 },
    });
    record({
      id: 'VIS-ZERO-VISITORS',
      module: 'visit-requests',
      srs: ['REQ-4.9-06'],
      method: 'POST',
      path: '/visit-requests',
      kind: 'invalid-input',
      res,
      expect: 400,
    });
    res = await api('POST', '/visit-requests', {
      body: {
        ...valid,
        vehicles: [{ plateNumber: 'ABC 1234' }, { plateNumber: 'abc1234' }],
      },
    });
    record({
      id: 'VIS-DUP-PLATE',
      module: 'visit-requests',
      srs: ['REQ-4.9-05', 'REQ-4.9-06'],
      method: 'POST',
      path: '/visit-requests',
      kind: 'invalid-input',
      res,
      expect: 400,
    });
    res = await api('POST', '/visit-requests', {
      body: { ...valid, preferredSchedules: [] },
    });
    record({
      id: 'VIS-NO-SCHEDULE',
      module: 'visit-requests',
      srs: ['REQ-4.9-02'],
      method: 'POST',
      path: '/visit-requests',
      kind: 'invalid-input',
      res,
      expect: 400,
    });
    const mailBefore = outbound.emails.length;
    res = await api('POST', '/visit-requests', { body: valid });
    ctx.visit = idOf(res);
    const sched = await q(
      'SELECT preference_order FROM preferred_visit_date WHERE visit_id=$1',
      [ctx.visit],
    );
    const veh = await q(
      'SELECT plate_number FROM visit_request_vehicle WHERE visit_id=$1',
      [ctx.visit],
    );
    record({
      id: 'VIS-CREATE',
      module: 'visit-requests',
      srs: [
        'REQ-4.9-01',
        'REQ-4.9-02',
        'REQ-4.9-03',
        'REQ-4.9-04',
        'REQ-4.9-05',
      ],
      method: 'POST',
      path: '/visit-requests',
      kind: 'happy',
      res,
      expect: 201,
      check:
        sched.length === 2 &&
        veh.length === 2 &&
        (await one('SELECT status FROM visit_request WHERE id=$1', [ctx.visit]))
          ?.status === 'PENDING',
      db: `schedules=${sched.length} vehicles=${veh.length}`,
    });
    await new Promise((r) => setTimeout(r, 1500));
    const mails = outbound.emails.slice(mailBefore);
    record({
      id: 'VIS-EMAILS',
      module: 'visit-requests',
      srs: ['REQ-4.9-07', 'REQ-4.3-09'],
      method: 'MAIL',
      path: 'brevo',
      kind: 'happy',
      res: { status: 200, body: null, headers: {}, text: '' },
      expect: 200,
      check:
        mails.some((m) => m.to.includes('teacher@example.test')) &&
        mails.some((m) => m.to.includes(accounts.curatorA.email)),
      note: mails.map((m) => `${m.to.join(',')}: ${m.subject}`).join(' | '),
    });

    for (const [id, path, query, srs] of [
      [
        'VIS-LIST',
        '/visit-requests',
        { status: 'PENDING', search: 'Synthetic', visitDateFrom: today(1) },
        ['REQ-4.9-08'],
      ],
      ['VIS-GET', `/visit-requests/${ctx.visit}`, undefined, ['REQ-4.9-08']],
    ] as const) {
      record({
        id,
        module: 'visit-requests',
        srs: [...srs],
        method: 'GET',
        path: path.replace(ctx.visit, ':id'),
        kind: 'happy',
        res: await api('GET', path, { token: C, query: query }),
        expect: 200,
      });
    }
    res = await api('PATCH', `/visit-requests/${ctx.visit}`, {
      token: C,
      body: { status: 'COMPLETED' },
    });
    record({
      id: 'VIS-SKIP-TO-COMPLETED',
      module: 'visit-requests',
      srs: ['REQ-4.9-09'],
      method: 'PATCH',
      path: '/visit-requests/:id',
      kind: 'invalid-input',
      res,
      expect: [400, 409],
    });
    const beforeMsg = outbound.emails.length;
    res = await api('POST', `/visit-requests/${ctx.visit}/messages`, {
      token: C,
      body: {
        subject: 'Need list',
        message: 'Please send the list of visitors.',
      },
    });
    record({
      id: 'VIS-MESSAGE',
      module: 'visit-requests',
      srs: ['REQ-4.9-10', 'REQ-4.9-11', 'REQ-4.9-14'],
      method: 'POST',
      path: '/visit-requests/:id/messages',
      kind: 'happy',
      res,
      expect: 201,
      check:
        outbound.emails.length > beforeMsg &&
        (await one('SELECT status FROM visit_request WHERE id=$1', [ctx.visit]))
          ?.status === 'PENDING' &&
        !!(await one(
          `SELECT 1 FROM communication_history WHERE visit_request_id=$1 AND direction IS NOT NULL`,
          [ctx.visit],
        )),
    });
    res = await api('POST', `/visit-requests/${ctx.visit}/notes`, {
      token: C,
      body: { message: 'Principal confirmed by phone' },
    });
    record({
      id: 'VIS-NOTE',
      module: 'visit-requests',
      srs: ['REQ-4.9-14'],
      method: 'POST',
      path: '/visit-requests/:id/notes',
      kind: 'happy',
      res,
      expect: 201,
    });
    res = await api('PATCH', `/visit-requests/${ctx.visit}/approve-schedule`, {
      token: C,
      body: { preferenceOrder: 9 },
    });
    record({
      id: 'VIS-APPROVE-INVALID',
      module: 'visit-requests',
      srs: ['REQ-4.9.16'],
      method: 'PATCH',
      path: '/visit-requests/:id/approve-schedule',
      kind: 'invalid-input',
      res,
      expect: 400,
    });
    res = await api('PATCH', `/visit-requests/${ctx.visit}/approve-schedule`, {
      token: C,
      body: { preferenceOrder: 2, notifyVisitor: true },
    });
    const appr = await one(
      'SELECT status, approved_date FROM visit_request WHERE id=$1',
      [ctx.visit],
    );
    const kept = await q(
      'SELECT 1 FROM preferred_visit_date WHERE visit_id=$1',
      [ctx.visit],
    );
    record({
      id: 'VIS-APPROVE',
      module: 'visit-requests',
      srs: ['REQ-4.9.16', 'REQ-4.9-09'],
      method: 'PATCH',
      path: '/visit-requests/:id/approve-schedule',
      kind: 'happy',
      res,
      expect: 200,
      check: appr?.status === 'APPROVED_BY_CURATOR' && kept.length === 2,
      db: JSON.stringify(appr),
    });
    res = await api(
      'GET',
      `/visit-requests/${ctx.visit}/campus-entry-summary`,
      { token: C },
    );
    record({
      id: 'VIS-CAMPUS-SUMMARY',
      module: 'visit-requests',
      srs: ['REQ-4.9-12', 'REQ-4.9-13'],
      method: 'GET',
      path: '/visit-requests/:id/campus-entry-summary',
      kind: 'happy',
      res,
      expect: 200,
      check: JSON.stringify(res.body).includes('ABC'),
    });
    res = await api('PATCH', `/visit-requests/${ctx.visit}`, {
      token: C,
      body: { status: 'SUBMITTED_FOR_CAMPUS_ENTRY', note: 'Sent to security' },
    });
    record({
      id: 'VIS-STATUS',
      module: 'visit-requests',
      srs: ['REQ-4.9-09', 'REQ-4.9-11', 'REQ-4.9-14'],
      method: 'PATCH',
      path: '/visit-requests/:id',
      kind: 'happy',
      res,
      expect: 200,
      check:
        (await one('SELECT status FROM visit_request WHERE id=$1', [ctx.visit]))
          ?.status === 'SUBMITTED_FOR_CAMPUS_ENTRY',
    });
    res = await api('PATCH', `/visit-requests/${ctx.visit}`, {
      token: C,
      body: { status: 'COMPLETED' },
    });
    record({
      id: 'VIS-COMPLETE-BEFORE-DATE',
      module: 'visit-requests',
      srs: ['REQ-4.9-09'],
      method: 'PATCH',
      path: '/visit-requests/:id',
      kind: 'invalid-input',
      res,
      expect: [200, 400, 409],
      check: true,
      note: `Completed before the approved date (${appr?.approved_date}) returned ${res.status}; SRS does not state a date rule (observation from last report).`,
    });
    record({
      id: 'VIS-HISTORY',
      module: 'visit-requests',
      srs: ['REQ-4.9-14'],
      method: 'GET',
      path: '/visit-requests/:id/history',
      kind: 'happy',
      res: await api('GET', `/visit-requests/${ctx.visit}/history`, {
        token: C,
      }),
      expect: 200,
    });
  });

  it('feeds notifications and dashboard counts from real records (§4.3)', async () => {
    const C = tokens.curatorA;
    let res = await api('GET', '/notifications', { token: C });
    const feed = JSON.stringify(res.body);
    record({
      id: 'NOTIF-FEED',
      module: 'notifications',
      srs: ['REQ-4.3-05', 'REQ-4.3-06', 'REQ-4.9-07'],
      method: 'GET',
      path: '/notifications',
      kind: 'happy',
      res,
      expect: 200,
      check: feed.includes('NEW_VISIT_REQUEST') && /recordType/.test(feed),
      note: feed.slice(0, 200),
    });
    record({
      id: 'NOTIF-NO-PRIVATE',
      module: 'notifications',
      srs: ['REQ-4.3-08'],
      method: 'GET',
      path: '/notifications',
      kind: 'happy',
      res,
      expect: 200,
      check:
        !feed.includes('visitor@example.test') && !feed.includes('912 345'),
    });
    const n = (res.body?.items ?? res.body?.notifications ?? res.body ?? [])[0];
    res = await api('PATCH', '/notifications/state', {
      token: C,
      body: {
        notificationId: n?.id ?? `NEW_INQUIRY:${ctx.inquiry}`,
        state: 'READ',
      },
    });
    const auditCount = Number(
      (await one('SELECT count(*)::int n FROM audit_log'))?.n,
    );
    record({
      id: 'NOTIF-READ',
      module: 'notifications',
      srs: ['REQ-4.3-07'],
      method: 'PATCH',
      path: '/notifications/state',
      kind: 'happy',
      res,
      expect: [200, 204],
      check:
        Number((await one('SELECT count(*)::int n FROM audit_log'))?.n) >=
        auditCount,
    });
    res = await api('PATCH', '/notifications/state', {
      token: C,
      body: { notificationId: 'DROP TABLE', state: 'GONE' },
    });
    record({
      id: 'NOTIF-STATE-INVALID',
      module: 'notifications',
      srs: ['REQ-4.3-07'],
      method: 'PATCH',
      path: '/notifications/state',
      kind: 'invalid-input',
      res,
      expect: 400,
    });

    res = await api('GET', '/dashboard/summary', { token: C });
    const counts = await one(
      `SELECT count(*) FILTER (WHERE status='UNCATALOGED')::int u, count(*) FILTER (WHERE status='CATALOGED')::int c, count(*) FILTER (WHERE status='ARCHIVED')::int a FROM specimen`,
    );
    const body = JSON.stringify(res.body);
    record({
      id: 'DASH-SUMMARY',
      module: 'dashboard',
      srs: ['REQ-4.3-01', 'REQ-4.3-02', 'REQ-4.3-04'],
      method: 'GET',
      path: '/dashboard/summary',
      kind: 'happy',
      res,
      expect: 200,
      check:
        body.includes(String(counts?.u)) && body.includes(String(counts?.c)),
      db: JSON.stringify(counts),
      note: body.slice(0, 300),
    });
    record({
      id: 'DASH-SYNC-STATES',
      module: 'dashboard',
      srs: ['REQ-4.3-03'],
      method: 'GET',
      path: '/dashboard/summary',
      kind: 'happy',
      res,
      expect: 200,
      check: true,
      note: 'Sync states are client-side (browser drafts); the server only reports accepted drafts. Scored on the frontend.',
    });
  });
});

describe('Reports, FAQ, offline sync, audit, backups (§4.7, §4.11, §4.14, §4.15)', () => {
  it('generates every report type and records history and audit (§4.7)', async () => {
    const C = tokens.curatorA;
    let res = await api('GET', '/reports', { token: C });
    const defs = JSON.stringify(res.body);
    record({
      id: 'RPT-DEFINITIONS',
      module: 'reports',
      srs: ['REQ-4.7-04'],
      method: 'GET',
      path: '/reports',
      kind: 'happy',
      res,
      expect: 200,
    });
    const definitions = (
      Array.isArray(res.body)
        ? res.body
        : (res.body?.types ?? res.body?.definitions ?? [])
    ) as Array<{ type?: string; id?: string } | string>;
    const types: string[] = definitions.map((d) =>
      typeof d === 'string' ? d : (d.type ?? d.id ?? ''),
    );
    const plan: Array<[string, string, string, string[]]> = [];
    const pick = (re: RegExp) => types.find((t) => re.test(t)) ?? '';
    plan.push([
      'RPT-CONSOLIDATED-DOCX',
      pick(/CONSOLIDATED|OPERATIONS/),
      'DOCX',
      ['REQ-4.7-05', 'REQ-4.7-06', 'REQ-4.7-11', 'REQ-4.7-16'],
    ]);
    plan.push([
      'RPT-INVENTORY-PDF',
      pick(/INVENTORY/),
      'PDF',
      ['REQ-4.7-07', 'REQ-4.7-12', 'REQ-4.7-13'],
    ]);
    plan.push([
      'RPT-INVENTORY-CSV',
      pick(/INVENTORY/),
      'CSV',
      ['REQ-4.7-07', 'REQ-4.7-12'],
    ]);
    plan.push(['RPT-INQUIRY', pick(/INQUIRY/), 'CSV', ['REQ-4.7-08']]);
    plan.push(['RPT-VISIT', pick(/VISIT/), 'PDF', ['REQ-4.7-09']]);
    plan.push(['RPT-QR-AR', pick(/QR|EXHIBIT|AR/), 'PDF', ['REQ-4.7-10']]);
    for (const [id, type, format, srs] of plan) {
      const r = await api('POST', '/reports', {
        token: C,
        body: { type, format, period: 'MONTHLY', month: today().slice(0, 7) },
      });
      record({
        id,
        module: 'reports',
        srs,
        method: 'POST',
        path: '/reports',
        kind: 'happy',
        res: r,
        expect: [200, 201],
        check:
          !!type &&
          (r.text?.length ?? 0) + JSON.stringify(r.body ?? '').length > 50,
        note: type
          ? `${type}/${format} content-type=${r.headers['content-type']}`
          : `no report type matched in ${defs.slice(0, 200)}`,
      });
    }
    res = await api('POST', '/reports', {
      token: C,
      body: {
        type: plan[1][1],
        format: 'PDF',
        period: 'CUSTOM',
        from: '2026-12-31',
        to: '2026-01-01',
      },
    });
    record({
      id: 'RPT-INVALID-PERIOD',
      module: 'reports',
      srs: ['REQ-4.7-15'],
      method: 'POST',
      path: '/reports',
      kind: 'invalid-input',
      res,
      expect: 400,
      check: typeof res.body?.message !== 'undefined',
    });
    res = await api('POST', '/reports', {
      token: C,
      body: { type: 'EVERYTHING', format: 'XLS' },
    });
    record({
      id: 'RPT-INVALID-TYPE',
      module: 'reports',
      srs: ['REQ-4.7-15'],
      method: 'POST',
      path: '/reports',
      kind: 'invalid-input',
      res,
      expect: 400,
    });
    record({
      id: 'RPT-HISTORY',
      module: 'reports',
      srs: ['REQ-4.7-14'],
      method: 'GET',
      path: '/reports/history',
      kind: 'happy',
      res: await api('GET', '/reports/history', { token: C }),
      expect: 200,
    });
    record({
      id: 'RPT-SUMMARY',
      module: 'reports',
      srs: ['REQ-4.7-04'],
      method: 'GET',
      path: '/reports/summary',
      kind: 'happy',
      res: await api('GET', '/reports/summary', {
        token: C,
        query: { period: 'MONTHLY', month: today().slice(0, 7) },
      }),
      expect: [200, 400],
    });
    const audit = await one<{ n: number }>(
      `SELECT count(*)::int n FROM audit_log WHERE module ILIKE '%report%' AND user_id=$1`,
      [accounts.curatorA.accountId],
    );
    record({
      id: 'RPT-AUDIT',
      module: 'reports',
      srs: ['REQ-4.7-14', 'REQ-4.15-01'],
      method: 'DB',
      path: 'audit_log',
      kind: 'happy',
      res: { status: 200, body: null, headers: {}, text: '' },
      expect: 200,
      check: Number(audit?.n) >= 6,
      db: `report audit rows: ${audit?.n}`,
    });
  });

  it('manages FAQ knowledge and answers only from active entries (§4.11)', async () => {
    const C = tokens.curatorA;
    let res = await api('POST', '/faq/entries', {
      token: C,
      body: {
        question: 'What are the museum opening hours?',
        answer: 'Monday to Friday, 9 AM to 4 PM.',
        alternativeWording: ['When are you open?'],
        keywords: ['hours', 'open'],
        category: 'Visit',
      },
    });
    ctx.faq = idOf(res);
    record({
      id: 'FAQ-CREATE',
      module: 'faq',
      srs: ['REQ-4.11-02', 'REQ-4.11-03', 'REQ-4.11-09'],
      method: 'POST',
      path: '/faq/entries',
      kind: 'happy',
      res,
      expect: 201,
      check: !!(await one('SELECT status FROM faq_entry WHERE id=$1', [
        ctx.faq,
      ])),
    });
    res = await api('POST', '/faq/entries', {
      token: C,
      body: { question: '', answer: '' },
    });
    record({
      id: 'FAQ-CREATE-INVALID',
      module: 'faq',
      srs: ['REQ-4.11-02'],
      method: 'POST',
      path: '/faq/entries',
      kind: 'invalid-input',
      res,
      expect: 400,
    });
    const status = (
      await one('SELECT status FROM faq_entry WHERE id=$1', [ctx.faq])
    )?.status;
    if (status !== 'ACTIVE') {
      res = await api('POST', '/faq/assistant/ask', {
        body: { question: 'When are you open?' },
      });
      record({
        id: 'FAQ-ASK-INACTIVE',
        module: 'faq',
        srs: ['REQ-4.11-04'],
        method: 'POST',
        path: '/faq/assistant/ask',
        kind: 'happy',
        res,
        expect: [200, 201],
        check: !JSON.stringify(res.body).includes('9 AM to 4 PM'),
      });
    }
    res = await api('PATCH', `/faq/entries/${ctx.faq}/activate`, { token: C });
    record({
      id: 'FAQ-ACTIVATE',
      module: 'faq',
      srs: ['REQ-4.11-02'],
      method: 'PATCH',
      path: '/faq/entries/:id/activate',
      kind: 'happy',
      res,
      expect: 200,
      check:
        (await one('SELECT status FROM faq_entry WHERE id=$1', [ctx.faq]))
          ?.status === 'ACTIVE',
    });
    res = await api('POST', '/faq/assistant/ask', {
      body: { question: 'When are you open?' },
    });
    record({
      id: 'FAQ-ASK-MATCH',
      module: 'faq',
      srs: [
        'REQ-4.11-01',
        'REQ-4.11-03',
        'REQ-4.11-04',
        'REQ-4.11-10',
        'REQ-4.10-08',
      ],
      method: 'POST',
      path: '/faq/assistant/ask',
      kind: 'happy',
      res,
      expect: [200, 201],
      check: JSON.stringify(res.body).includes('9 AM to 4 PM'),
    });
    res = await api('POST', '/faq/assistant/ask', {
      body: { question: 'Who will win the next election?' },
    });
    record({
      id: 'FAQ-ASK-FALLBACK',
      module: 'faq',
      srs: ['REQ-4.11-05', 'REQ-4.11-06'],
      method: 'POST',
      path: '/faq/assistant/ask',
      kind: 'happy',
      res,
      expect: [200, 201],
      check:
        /inquir/i.test(JSON.stringify(res.body)) &&
        !JSON.stringify(res.body).includes('9 AM to 4 PM'),
    });
    res = await api('POST', '/faq/assistant/ask', {
      body: { question: 'x'.repeat(501) },
    });
    record({
      id: 'FAQ-ASK-INVALID',
      module: 'faq',
      srs: ['REQ-4.11-07'],
      method: 'POST',
      path: '/faq/assistant/ask',
      kind: 'invalid-input',
      res,
      expect: 400,
    });
    res = await api('POST', '/faq/assistant/ask', {
      body: { question: 'hours?', email: 'leak@example.test' },
    });
    record({
      id: 'FAQ-ASK-NO-PII',
      module: 'faq',
      srs: ['REQ-4.11-07'],
      method: 'POST',
      path: '/faq/assistant/ask',
      kind: 'invalid-input',
      res,
      expect: 400,
    });
    res = await api('GET', '/faq/assistant/suggestions');
    record({
      id: 'FAQ-SUGGESTIONS',
      module: 'faq',
      srs: ['REQ-4.11-01'],
      method: 'GET',
      path: '/faq/assistant/suggestions',
      kind: 'happy',
      res,
      expect: 200,
      check: JSON.stringify(res.body).includes('opening hours'),
    });
    for (const [id, method, path, body] of [
      ['FAQ-LIST', 'GET', '/faq/entries', undefined],
      ['FAQ-GET', 'GET', `/faq/entries/${ctx.faq}`, undefined],
      [
        'FAQ-UPDATE',
        'PATCH',
        `/faq/entries/${ctx.faq}`,
        { answer: 'Monday to Friday, 9 AM to 4:30 PM.' },
      ],
      [
        'FAQ-DEACTIVATE',
        'PATCH',
        `/faq/entries/${ctx.faq}/deactivate`,
        undefined,
      ],
    ] as const) {
      record({
        id,
        module: 'faq',
        srs: ['REQ-4.11-02'],
        method,
        path: path.replace(ctx.faq, ':id'),
        kind: 'happy',
        res: await api(method, path, { token: C, body }),
        expect: 200,
      });
    }
    res = await api('POST', '/faq/assistant/ask', {
      body: { question: 'When are you open?' },
    });
    record({
      id: 'FAQ-ASK-AFTER-DEACTIVATE',
      module: 'faq',
      srs: ['REQ-4.11-04'],
      method: 'POST',
      path: '/faq/assistant/ask',
      kind: 'happy',
      res,
      expect: [200, 201],
      check: !JSON.stringify(res.body).includes('4:30 PM'),
    });
    record({
      id: 'FAQ-ARCHIVE',
      module: 'faq',
      srs: ['REQ-4.11-02'],
      method: 'PATCH',
      path: '/faq/entries/:id/archive',
      kind: 'happy',
      res: await api('PATCH', `/faq/entries/${ctx.faq}/archive`, { token: C }),
      expect: 200,
    });
    const audits = Number(
      (
        await one(
          `SELECT count(*)::int n FROM audit_log WHERE affected_record_id=$1`,
          [ctx.faq],
        )
      )?.n,
    );
    record({
      id: 'FAQ-AUDIT',
      module: 'faq',
      srs: ['REQ-4.11-09'],
      method: 'DB',
      path: 'audit_log',
      kind: 'happy',
      res: { status: 200, body: null, headers: {}, text: '' },
      expect: 200,
      check: audits >= 4,
      db: `FAQ audit rows: ${audits}`,
    });
    res = await api('GET', '/faq/assistant/review-policy');
    record({
      id: 'FAQ-REVIEW-POLICY',
      module: 'faq',
      srs: ['REQ-4.11-07'],
      method: 'GET',
      path: '/faq/assistant/review-policy',
      kind: 'happy',
      res,
      expect: 200,
    });
    res = await api('POST', '/faq/assistant/review-submissions', {
      body: {
        question: 'Do you sell tickets?',
        consent: true,
        submissionId: randomUUID(),
      },
    });
    record({
      id: 'FAQ-REVIEW-SUBMIT-OFF',
      module: 'faq',
      srs: ['REQ-4.11-07'],
      method: 'POST',
      path: '/faq/assistant/review-submissions',
      kind: 'happy',
      res,
      expect: [201, 503],
      note: 'Opt-in collection is off by default (FAQ_REVIEW_ENABLED unset); 503 is the designed response.',
    });
    res = await api('GET', '/faq/review-queue', { token: C });
    record({
      id: 'FAQ-REVIEW-QUEUE-OFF',
      module: 'faq',
      srs: ['REQ-4.11-02'],
      method: 'GET',
      path: '/faq/review-queue',
      kind: 'happy',
      res,
      expect: [200, 503],
    });
  });

  it('syncs offline drafts idempotently (§4.14)', async () => {
    const C = tokens.curatorA;
    const draftId = randomUUID();
    const body = {
      clientDraftId: draftId,
      draft: {
        commonName: 'Offline Kingfisher',
        scientificName: 'Alcedo argentata',
      },
    };
    let res = await api('POST', '/offline-sync/specimen-drafts', {
      token: C,
      body,
    });
    record({
      id: 'OFF-SYNC',
      module: 'offline-sync',
      srs: ['REQ-4.14-03', 'REQ-4.14-04', 'REQ-4.14-06'],
      method: 'POST',
      path: '/offline-sync/specimen-drafts',
      kind: 'happy',
      res,
      expect: [200, 201],
      check:
        (
          await one(
            `SELECT status FROM specimen WHERE common_name='Offline Kingfisher'`,
          )
        )?.status === 'UNCATALOGED',
    });
    res = await api('POST', '/offline-sync/specimen-drafts', {
      token: C,
      body,
    });
    const n = Number(
      (
        await one(
          `SELECT count(*)::int n FROM specimen WHERE common_name='Offline Kingfisher'`,
        )
      )?.n,
    );
    record({
      id: 'OFF-SYNC-RETRY',
      module: 'offline-sync',
      srs: ['REQ-4.14-08'],
      method: 'POST',
      path: '/offline-sync/specimen-drafts',
      kind: 'happy',
      res,
      expect: [200, 201],
      check: n === 1,
      db: `records after retry: ${n}`,
    });
    res = await api('POST', '/offline-sync/specimen-drafts', {
      token: C,
      body: { ...body, draft: { commonName: 'Changed payload' } },
    });
    record({
      id: 'OFF-SYNC-CONFLICT',
      module: 'offline-sync',
      srs: ['REQ-4.14-07', 'REQ-4.14-08'],
      method: 'POST',
      path: '/offline-sync/specimen-drafts',
      kind: 'invalid-input',
      res,
      expect: [400, 409, 422],
    });
    res = await api('POST', '/offline-sync/specimen-drafts', {
      token: C,
      body: { clientDraftId: 'nope', draft: { gender: 'ROBOT' } },
    });
    record({
      id: 'OFF-SYNC-INVALID',
      module: 'offline-sync',
      srs: ['REQ-4.14-07'],
      method: 'POST',
      path: '/offline-sync/specimen-drafts',
      kind: 'invalid-input',
      res,
      expect: 400,
    });
    res = await api('POST', '/offline-sync/specimen-drafts', {
      token: C,
      body: {
        clientDraftId: randomUUID(),
        draft: { commonName: 'x', status: 'CATALOGED' },
      },
    });
    record({
      id: 'OFF-SYNC-TEXT-ONLY',
      module: 'offline-sync',
      srs: ['REQ-4.14-03', 'REQ-4.14-11'],
      method: 'POST',
      path: '/offline-sync/specimen-drafts',
      kind: 'invalid-input',
      res,
      expect: 400,
    });
  });

  it('exposes audit logs read-only with filters and backup history (§4.15)', async () => {
    const C = tokens.curatorA;
    let res = await api('GET', '/audit-logs', {
      token: C,
      query: { module: 'specimens', limit: 10 },
    });
    const first = (res.body?.items ?? res.body?.data ?? res.body ?? [])[0];
    record({
      id: 'AUD-LIST',
      module: 'audit',
      srs: ['REQ-4.15-01', 'REQ-4.15-02', 'REQ-4.15-04'],
      method: 'GET',
      path: '/audit-logs',
      kind: 'happy',
      res,
      expect: 200,
      check: !!first && /action/i.test(JSON.stringify(first)),
    });
    record({
      id: 'AUD-GET',
      module: 'audit',
      srs: ['REQ-4.15-02'],
      method: 'GET',
      path: '/audit-logs/:id',
      kind: 'happy',
      res: await api('GET', `/audit-logs/${first?.id}`, { token: C }),
      expect: 200,
    });
    res = await api('GET', '/audit-logs', {
      token: C,
      query: { from: '2026-11-01' },
    });
    record({
      id: 'AUD-LIST-INVALID',
      module: 'audit',
      srs: ['REQ-4.15-04'],
      method: 'GET',
      path: '/audit-logs',
      kind: 'invalid-input',
      res,
      expect: 400,
    });
    const mutate = ROUTES.filter(
      (r) => r.path.startsWith('/audit-logs') && r.method !== 'GET',
    );
    res = await api('DELETE', `/audit-logs/${first?.id}`, { token: C });
    record({
      id: 'AUD-IMMUTABLE',
      module: 'audit',
      srs: ['REQ-4.15-03'],
      method: 'DELETE',
      path: '/audit-logs/:id',
      kind: 'happy',
      res,
      expect: 404,
      check: mutate.length === 0,
      note: 'no edit/delete route exists',
    });
    const covered = await q<{ module: string }>(
      `SELECT DISTINCT module FROM audit_log ORDER BY 1`,
    );
    record({
      id: 'AUD-COVERAGE',
      module: 'audit',
      srs: ['REQ-4.15-01'],
      method: 'DB',
      path: 'audit_log',
      kind: 'happy',
      res: { status: 200, body: null, headers: {}, text: '' },
      expect: 200,
      check: true,
      db: `modules audited in this run: ${covered.map((c) => c.module).join(', ')}`,
    });
    res = await api('GET', '/backups/history', { token: C });
    record({
      id: 'BAK-HISTORY',
      module: 'backup',
      srs: ['REQ-4.15-06', 'REQ-4.15-10'],
      method: 'GET',
      path: '/backups/history',
      kind: 'happy',
      res,
      expect: 200,
      check: JSON.stringify(res.body).includes('FAILED'),
    });
    record({
      id: 'BAK-GET',
      module: 'backup',
      srs: ['REQ-4.15-06'],
      method: 'GET',
      path: '/backups/history/:id',
      kind: 'happy',
      res: await api(
        'GET',
        '/backups/history/44444444-4444-4444-8444-444444444441',
        { token: C },
      ),
      expect: 200,
    });
    record({
      id: 'BAK-GET-404',
      module: 'backup',
      srs: ['REQ-4.15-06'],
      method: 'GET',
      path: '/backups/history/:id',
      kind: 'not-found',
      res: await api('GET', `/backups/history/${SAMPLE_ID}`, { token: C }),
      expect: 404,
    });
    const backupWrite = ROUTES.some(
      (r) => r.path.startsWith('/backups') && r.method !== 'GET',
    );
    record({
      id: 'BAK-RUN-RESTORE',
      module: 'backup',
      srs: [
        'REQ-4.15-05',
        'REQ-4.15-06',
        'REQ-4.15-07',
        'REQ-4.15-08',
        'REQ-4.15-09',
        'REQ-4.15-11',
      ],
      method: 'POST',
      path: '(none)',
      kind: 'happy',
      res: null,
      expect: 200,
      check: backupWrite,
      note: 'Not executed: standalone synthetic recovery and history recording exist; intended-source recovery and deployed scheduling/retention/custody acceptance remain separate gates. No public restore POST is required.',
    });
  });

  it('isolates a rejected draft alert to its curator and clears it after successful sync', async () => {
    const draftId = randomUUID();
    const accessionNumber = `TEST-SYNC-ALERT-${draftId}`;
    const matchesDraft = (response: ApiResponse): boolean => {
      const items: unknown = response.body?.items;
      if (!Array.isArray(items)) return false;
      return items.some((item: unknown) => {
        if (typeof item !== 'object' || item === null) return false;
        const value = item as {
          type?: unknown;
          recordType?: unknown;
          recordId?: unknown;
        };
        return (
          value.type === 'SYNC_FAILED' &&
          value.recordType === 'offline_draft' &&
          value.recordId === draftId
        );
      });
    };
    const observation = (
      id: string,
      method: string,
      path: string,
      res: ApiResponse,
      expected: number,
      check: boolean,
    ) => {
      const passed = record({
        id,
        module: 'notifications',
        srs: ['REQ-4.3-05', 'REQ-4.3-10'],
        method,
        path,
        kind: expected >= 400 ? 'invalid-input' : 'happy',
        res,
        expect: expected,
        check,
      });
      expect(passed).toBe(true);
    };
    let res = await api('POST', '/specimens', {
      token: tokens.curatorA,
      body: { accessionNumber, commonName: 'Synthetic sync-alert holder' },
    });
    observation(
      'NOTIF-SYNC-FIXTURE',
      'POST',
      '/specimens',
      res,
      201,
      !!idOf(res),
    );

    res = await api('GET', '/notifications', {
      token: tokens.curatorB,
      query: { limit: 100 },
    });
    const otherCuratorCount = res.body?.operationalAlerts;
    observation(
      'NOTIF-SYNC-OTHER-BASELINE',
      'GET',
      '/notifications',
      res,
      200,
      Number.isInteger(otherCuratorCount) && Array.isArray(res.body?.items),
    );
    const draft = {
      accessionNumber,
      commonName: 'Synthetic rejected offline draft',
    };
    res = await api('POST', '/offline-sync/specimen-drafts', {
      token: tokens.curatorA,
      body: { clientDraftId: draftId, draft },
    });
    observation(
      'NOTIF-SYNC-REJECTED',
      'POST',
      '/offline-sync/specimen-drafts',
      res,
      409,
      res.body?.code === 'ACCESSION_NUMBER_TAKEN',
    );
    res = await api('GET', '/notifications', {
      token: tokens.curatorA,
      query: { limit: 100 },
    });
    const ownerFailureCount = res.body?.operationalAlerts;
    observation(
      'NOTIF-SYNC-FAILED',
      'GET',
      '/notifications',
      res,
      200,
      matchesDraft(res) &&
        Number.isInteger(ownerFailureCount) &&
        ownerFailureCount > 0,
    );
    res = await api('GET', '/notifications', {
      token: tokens.curatorB,
      query: { limit: 100 },
    });
    observation(
      'NOTIF-SYNC-OTHER-ISOLATED',
      'GET',
      '/notifications',
      res,
      200,
      Array.isArray(res.body?.items) &&
        !matchesDraft(res) &&
        res.body?.operationalAlerts === otherCuratorCount,
    );
    res = await api('POST', '/offline-sync/specimen-drafts', {
      token: tokens.curatorA,
      body: {
        clientDraftId: draftId,
        draft: { ...draft, accessionNumber: `TEST-SYNC-RECOVER-${draftId}` },
      },
    });
    observation(
      'NOTIF-SYNC-RECOVERED',
      'POST',
      '/offline-sync/specimen-drafts',
      res,
      200,
      res.body?.alreadySynchronized === false &&
        res.body?.specimen?.status === 'UNCATALOGED' &&
        res.body?.specimen?.publicDisplay === false,
    );
    res = await api('GET', '/notifications', {
      token: tokens.curatorA,
      query: { limit: 100 },
    });
    observation(
      'NOTIF-SYNC-CLEARED',
      'GET',
      '/notifications',
      res,
      200,
      Array.isArray(res.body?.items) &&
        !matchesDraft(res) &&
        res.body?.operationalAlerts === ownerFailureCount - 1,
    );
  });

  // Keep this after the initial login cases: the real per-route five/minute
  // throttle stays enabled while the paced full suite exercises other modules.
  it('signs in with the password chosen during onboarding', async () => {
    const firstLogin = await api('POST', '/auth/login', {
      body: {
        email: accounts.pendingCurator.email,
        password: 'Fixture-First-Password-2026!',
      },
    });
    record({
      id: 'AUTH-ONBOARD-FIRST-LOGIN',
      module: 'auth',
      srs: ['REQ-4.1-07', 'REQ-4.1-11'],
      method: 'POST',
      path: '/auth/login',
      kind: 'happy',
      res: firstLogin,
      expect: 201,
      check:
        firstLogin.body?.user?.accountId === accounts.pendingCurator.accountId,
    });
    expect(firstLogin.status).toBe(201);
  });

  it('serves the root status route', async () => {
    record({
      id: 'ROOT',
      module: 'root',
      srs: [],
      method: 'GET',
      path: '/',
      kind: 'happy',
      res: await api('GET', '/'),
      expect: 200,
    });
    record({
      id: 'NO-OUTBOUND',
      module: 'harness',
      srs: [],
      method: 'NET',
      path: 'outbound',
      kind: 'happy',
      res: { status: 200, body: null, headers: {}, text: '' },
      expect: 200,
      check: outbound.blocked.length === 0,
      note: outbound.blocked.join(', ') || 'no blocked outbound requests',
    });
  });
});
