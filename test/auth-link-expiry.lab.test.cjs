/**
 * REQ-4.1-19: onboarding invitations and password-reset codes expire after the
 * configured period and cannot be used twice.
 *
 * Opt-in (`npm run test:auth:link-expiry`); needs Docker and the local
 * Supabase images. It never contacts the hosted project. A throwaway stack is
 * started on a private Docker network and removed afterwards:
 *   - Auth (GoTrue) at the hosted project's version, with the email link/code
 *     lifetime (GOTRUE_MAILER_OTP_EXP) shortened to LINK_LIFETIME_SECONDS;
 *   - supabase/postgres for Auth's tables;
 *   - Mailpit as the controlled inbox that receives the invite and reset mail.
 *
 * Both flows are exercised the way BioSphere uses them:
 *   - invite: the emailed /verify link, which redirects to /login/accept-invite
 *     with a session (or an error) in the URL hash;
 *   - reset: the emailed 8-digit code (the hosted code length), checked with verifyOtp type "recovery".
 *
 * What it proves: Auth enforces the configured lifetime and single use. What
 * it does not prove: the hosted project's own value (3600 s, not yet an
 * approved period) or the hosted email templates.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createHmac, randomBytes } = require('node:crypto');
const http = require('node:http');

const enabled = process.env.RUN_AUTH_EXPIRY_LAB === 'true';

const IMAGES = {
  database: 'public.ecr.aws/supabase/postgres:17.11.0.004',
  // Same Auth version the hosted project reported on 2026-11-05.
  auth: 'public.ecr.aws/supabase/gotrue:v2.197.0',
  mail: 'public.ecr.aws/supabase/mailpit:v1.31.3',
};
const LINK_LIFETIME_SECONDS = 20;
const REDIRECT = 'http://localhost:3000/login/accept-invite';

const owner = randomBytes(4).toString('hex');
const prefix = `biosphere-expiry-${owner}`;
const network = `${prefix}-net`;
const password = randomBytes(16).toString('hex');
const jwtSecret = randomBytes(32).toString('hex');

const docker = (args, input) =>
  execFileSync('docker', args, {
    encoding: 'utf8',
    input,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(what, check, timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await sleep(500);
  }
  throw new Error(
    `${what} was not ready: ${lastError?.message ?? 'timed out'}`,
  );
}

function run(name, image, env, publish, command = []) {
  docker([
    'run',
    '--detach',
    '--name',
    `${prefix}-${name}`,
    '--network',
    network,
    '--network-alias',
    name,
    '--label',
    `biosphere.lab=${prefix}`,
    '--add-host',
    'host.docker.internal:host-gateway',
    ...(publish ? ['--publish', `127.0.0.1::${publish}`] : []),
    ...Object.entries(env).flatMap(([key, value]) => [
      '--env',
      `${key}=${value}`,
    ]),
    image,
    ...command,
  ]);
  if (!publish) return undefined;
  const mapped = docker(['port', `${prefix}-${name}`, `${publish}/tcp`]);
  return `http://127.0.0.1:${mapped.split('\n')[0].split(':').pop()}`;
}

function serviceRoleKey() {
  const encode = (value) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const body = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    role: 'service_role',
    iss: 'biosphere-expiry-lab',
    iat: now,
    exp: now + 3600,
  })}`;
  return `${body}.${createHmac('sha256', jwtSecret).update(body).digest('base64url')}`;
}

/** Serves the reset email template, so the mail carries the code as hosted does. */
function startTemplateServer() {
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end('<p>Your BioSphere reset code is <b>{{ .Token }}</b></p>');
  });
  return new Promise((resolve) => {
    server.listen(0, '0.0.0.0', () => resolve(server));
  });
}

test(
  'invites and reset codes expire after the configured period and are single use (REQ-4.1-19)',
  { skip: !enabled, timeout: 300000 },
  async (t) => {
    const templates = await startTemplateServer();
    t.after(() => {
      templates.close();
      try {
        const ids = docker([
          'ps',
          '-aq',
          '--filter',
          `label=biosphere.lab=${prefix}`,
        ]);
        if (ids) docker(['rm', '-f', ...ids.split(/\s+/)]);
        docker(['network', 'rm', network]);
      } catch {
        /* already gone */
      }
    });

    docker(['network', 'create', network]);

    run(
      'database',
      IMAGES.database,
      { POSTGRES_PASSWORD: password, POSTGRES_DB: 'postgres' },
      null,
      ['postgres', '-c', 'config_file=/etc/postgresql/postgresql.conf'],
    );
    const sql = (statement) =>
      docker(
        [
          'exec',
          '-i',
          '--env',
          `PGPASSWORD=${password}`,
          `${prefix}-database`,
          'psql',
          '-X',
          '-qAt',
          '-v',
          'ON_ERROR_STOP=1',
          '-h',
          '127.0.0.1',
          '-U',
          'supabase_admin',
          '-d',
          'postgres',
        ],
        statement,
      );
    await until('database', () => sql('SELECT 1;') === '1');
    sql(`ALTER USER supabase_auth_admin WITH PASSWORD '${password}';`);

    const mailUrl = run('mail', IMAGES.mail, {}, 8025);
    const authUrl = run(
      'auth',
      IMAGES.auth,
      {
        GOTRUE_API_HOST: '0.0.0.0',
        GOTRUE_API_PORT: '9999',
        API_EXTERNAL_URL: 'http://auth:9999',
        GOTRUE_SITE_URL: 'http://localhost:3000',
        GOTRUE_URI_ALLOW_LIST: 'http://localhost:3000/**',
        GOTRUE_DB_DRIVER: 'postgres',
        GOTRUE_DB_DATABASE_URL: `postgres://supabase_auth_admin:${password}@database:5432/postgres`,
        GOTRUE_JWT_SECRET: jwtSecret,
        GOTRUE_JWT_EXP: '3600',
        GOTRUE_JWT_AUD: 'authenticated',
        GOTRUE_JWT_ADMIN_ROLES: 'service_role',
        GOTRUE_JWT_DEFAULT_GROUP_NAME: 'authenticated',
        // As on the hosted project: no public sign-up, invites only.
        GOTRUE_DISABLE_SIGNUP: 'true',
        GOTRUE_EXTERNAL_EMAIL_ENABLED: 'true',
        GOTRUE_EXTERNAL_PHONE_ENABLED: 'false',
        GOTRUE_MAILER_AUTOCONFIRM: 'false',
        GOTRUE_MAILER_OTP_EXP: String(LINK_LIFETIME_SECONDS),
        // Hosted "Email OTP length" (read 2026-11-05).
        GOTRUE_MAILER_OTP_LENGTH: '8',
        GOTRUE_MAILER_TEMPLATES_RECOVERY: `http://host.docker.internal:${templates.address().port}/recovery`,
        GOTRUE_SMTP_HOST: 'mail',
        GOTRUE_SMTP_PORT: '1025',
        GOTRUE_SMTP_ADMIN_EMAIL: 'noreply@biosphere.test',
        GOTRUE_SMTP_SENDER_NAME: 'BioSphere lab',
        GOTRUE_SMTP_MAX_FREQUENCY: '1s',
        GOTRUE_RATE_LIMIT_EMAIL_SENT: '1000',
      },
      9999,
    );
    await until('auth', async () => (await fetch(`${authUrl}/health`)).ok);
    await until('mail', async () => (await fetch(`${mailUrl}/api/v1/info`)).ok);

    const key = serviceRoleKey();
    const admin = (path, body) =>
      fetch(`${authUrl}${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          apikey: key,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

    /** Text of the one message sent to `email`. */
    const mailFor = (email) =>
      until(`mail for ${email}`, async () => {
        const search = await (
          await fetch(
            `${mailUrl}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`,
          )
        ).json();
        const id = search.messages?.[0]?.ID;
        if (!id) return undefined;
        const message = await (
          await fetch(`${mailUrl}/api/v1/message/${id}`)
        ).json();
        return `${message.Text ?? ''}\n${message.HTML ?? ''}`;
      });

    const invite = async (email) => {
      // As supabase-js inviteUserByEmail sends it: redirect_to in the query string.
      const response = await admin(
        `/invite?redirect_to=${encodeURIComponent(REDIRECT)}`,
        {
          email,
          data: { role: 'CURATOR' },
        },
      );
      assert.equal(response.status, 200, await response.text());
      const body = await mailFor(email);
      const link = body.match(/https?:\/\/[^\s"'<>]+\/verify\?[^\s"'<>]+/)?.[0];
      assert.ok(link, `invite mail has a verify link:\n${body}`);
      // The link names the container's address; reach it through the mapped port.
      const { pathname, search } = new URL(link.replace(/&amp;/g, '&'));
      return `${authUrl}${pathname.replace(/^\/(auth\/v1\/)?/, '/')}${search}`;
    };
    /** Where the browser lands after opening an invite link: the hash the accept-invite page reads. */
    const openInvite = async (link) => {
      const response = await fetch(link, { redirect: 'manual' });
      const location = response.headers.get('location') ?? '';
      return {
        location,
        hash: new URLSearchParams(location.split('#')[1] ?? ''),
      };
    };

    const requestReset = async (email) => {
      const created = await admin('/admin/users', {
        email,
        password: randomBytes(12).toString('hex'),
        email_confirm: true,
      });
      assert.equal(created.status, 200, await created.text());
      const recover = await fetch(`${authUrl}/recover`, {
        method: 'POST',
        headers: { apikey: key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      assert.equal(recover.status, 200, await recover.text());
      const code = (await mailFor(email)).match(/<b>(\d{8})<\/b>/)?.[1];
      assert.ok(code, 'reset mail carries an 8-digit code');
      return code;
    };
    /** The call the frontend makes: verifyOtp({ email, token, type: "recovery" }). */
    const verifyReset = async (email, token) => {
      const response = await fetch(`${authUrl}/verify`, {
        method: 'POST',
        headers: { apikey: key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'recovery', email, token }),
      });
      return { status: response.status, body: await response.json() };
    };

    // Send the "expired" pair first so one wait covers both.
    const lateInvite = await invite(`late-invite-${owner}@biosphere.test`);
    const lateResetEmail = `late-reset-${owner}@biosphere.test`;
    const lateResetCode = await requestReset(lateResetEmail);
    const sentAt = Date.now();

    await t.test('a fresh invite link signs the invitee in, once', async () => {
      const link = await invite(`fresh-invite-${owner}@biosphere.test`);
      const first = await openInvite(link);
      assert.ok(first.location.startsWith(REDIRECT), first.location);
      assert.ok(
        first.hash.get('access_token'),
        `session expected: ${first.location}`,
      );

      const second = await openInvite(link);
      assert.equal(
        second.hash.get('access_token'),
        null,
        `reuse must not sign in: ${second.location}`,
      );
      assert.ok(second.hash.get('error'), second.location);
    });

    await t.test('a fresh reset code works, once', async () => {
      const email = `fresh-reset-${owner}@biosphere.test`;
      const code = await requestReset(email);
      const first = await verifyReset(email, code);
      assert.equal(first.status, 200, JSON.stringify(first.body));
      assert.ok(first.body.access_token);

      const second = await verifyReset(email, code);
      assert.notEqual(second.status, 200, 'reuse must fail');
      assert.equal(second.body.access_token, undefined);
    });

    await sleep(
      Math.max(0, sentAt + (LINK_LIFETIME_SECONDS + 3) * 1000 - Date.now()),
    );

    await t.test(
      `an invite link opened after ${LINK_LIFETIME_SECONDS} s is rejected as expired`,
      async () => {
        const late = await openInvite(lateInvite);
        assert.equal(late.hash.get('access_token'), null, late.location);
        assert.equal(late.hash.get('error_code'), 'otp_expired', late.location);
      },
    );

    await t.test(
      `a reset code used after ${LINK_LIFETIME_SECONDS} s is rejected as expired`,
      async () => {
        const late = await verifyReset(lateResetEmail, lateResetCode);
        assert.equal(late.status, 403, JSON.stringify(late.body));
        assert.equal(
          late.body.error_code,
          'otp_expired',
          JSON.stringify(late.body),
        );
        assert.equal(late.body.access_token, undefined);
      },
    );
  },
);
