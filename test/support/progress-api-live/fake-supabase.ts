/**
 * Loopback stand-in for the Supabase Auth and Storage HTTP APIs used by the
 * progress-report live API suite. The real AppModule talks to it through
 * SUPABASE_URL, so guards, services and Prisma run unmodified while no
 * request can reach the team's hosted Supabase project.
 */
import {
  createServer,
  IncomingMessage,
  Server,
  ServerResponse,
} from 'node:http';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Client } from 'pg';

export interface FakeUser {
  id: string;
  email: string;
  password?: string;
  app_metadata: Record<string, unknown>;
  user_metadata: Record<string, unknown>;
}

export interface RecordedCall {
  method: string;
  path: string;
  body: unknown;
}

function base64url(value: string) {
  return Buffer.from(value).toString('base64url');
}

/** JWT-shaped but unsigned; only this fake ever reads it. */
export function fakeAccessToken(userId: string) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(
    JSON.stringify({
      sub: userId,
      role: 'authenticated',
      aud: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 3600,
      jti: randomUUID(),
    }),
  );
  return `${header}.${payload}.fake-signature`;
}

export class FakeSupabase {
  private server!: Server;
  readonly users = new Map<string, FakeUser>();
  readonly tokens = new Map<string, string>();
  readonly calls: RecordedCall[] = [];
  readonly storedObjects = new Map<string, number>();
  baseUrl = '';

  constructor(private readonly db: Client) {}

  addUser(user: FakeUser) {
    this.users.set(user.id, user);
    const token = fakeAccessToken(user.id);
    this.tokens.set(token, user.id);
    return token;
  }

  async start() {
    this.server = createServer((req, res) => {
      void this.handle(req, res).catch((error: unknown) => {
        this.json(res, 500, { msg: String(error) });
      });
    });
    await new Promise<void>((resolve) =>
      this.server.listen(0, '127.0.0.1', () => resolve()),
    );
    const { port } = this.server.address() as AddressInfo;
    this.baseUrl = `http://127.0.0.1:${port}`;
  }

  async stop() {
    await new Promise<void>((resolve) => this.server?.close(() => resolve()));
  }

  private json(res: ServerResponse, status: number, body: unknown) {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  }

  private async readBody(req: IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const raw = Buffer.concat(chunks);
    const type = req.headers['content-type'] ?? '';
    if (type.includes('application/json') && raw.length > 0)
      return JSON.parse(raw.toString('utf8'));
    return { bytes: raw.length };
  }

  private userJson(user: FakeUser) {
    return {
      id: user.id,
      aud: 'authenticated',
      role: 'authenticated',
      email: user.email,
      app_metadata: user.app_metadata,
      user_metadata: user.user_metadata,
      created_at: new Date().toISOString(),
    };
  }

  private async handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', this.baseUrl);
    const body = await this.readBody(req);
    this.calls.push({ method: req.method ?? '', path: url.pathname, body });
    const bearer = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');

    // auth.getUser(token)
    if (req.method === 'GET' && url.pathname === '/auth/v1/user') {
      const id = this.tokens.get(bearer);
      const user = id ? this.users.get(id) : undefined;
      if (!user)
        return this.json(res, 401, {
          code: 401,
          error_code: 'bad_jwt',
          msg: 'invalid JWT',
        });
      return this.json(res, 200, this.userJson(user));
    }

    // signInWithPassword
    if (req.method === 'POST' && url.pathname === '/auth/v1/token') {
      const { email, password } = body as { email: string; password: string };
      const user = [...this.users.values()].find(
        (candidate) =>
          candidate.email === email && candidate.password === password,
      );
      if (!user)
        return this.json(res, 400, {
          code: 400,
          error_code: 'invalid_credentials',
          msg: 'Invalid login credentials',
        });
      const token = fakeAccessToken(user.id);
      this.tokens.set(token, user.id);
      return this.json(res, 200, {
        access_token: token,
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: randomUUID(),
        user: this.userJson(user),
      });
    }

    // auth.admin.inviteUserByEmail
    if (req.method === 'POST' && url.pathname === '/auth/v1/invite') {
      const { email, data } = body as {
        email: string;
        data?: Record<string, unknown>;
      };
      if ([...this.users.values()].some((u) => u.email === email))
        return this.json(res, 422, {
          code: 422,
          error_code: 'email_exists',
          msg: 'A user with this email address has already been registered',
        });
      const user: FakeUser = {
        id: randomUUID(),
        email,
        app_metadata: {},
        user_metadata: data ?? {},
      };
      this.users.set(user.id, user);
      await this.db.query(
        `INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data, invited_at, created_at, updated_at)
         VALUES ($1, $2, '{}'::jsonb, $3::jsonb, now(), now(), now())`,
        [user.id, email, JSON.stringify(user.user_metadata)],
      );
      return this.json(res, 200, this.userJson(user));
    }

    const adminUser = url.pathname.match(
      /^\/auth\/v1\/admin\/users\/([\w-]+)$/,
    );
    if (adminUser && req.method === 'PUT') {
      const user = this.users.get(adminUser[1]);
      if (!user) return this.json(res, 404, { msg: 'User not found' });
      const attrs = body as { app_metadata?: Record<string, unknown> };
      if (attrs.app_metadata) {
        // GoTrue merges app_metadata keys; a null value removes one.
        for (const [key, value] of Object.entries(attrs.app_metadata)) {
          if (value === null) delete user.app_metadata[key];
          else user.app_metadata[key] = value;
        }
        await this.db.query(
          'UPDATE auth.users SET raw_app_meta_data = $2::jsonb, updated_at = now() WHERE id = $1',
          [user.id, JSON.stringify(user.app_metadata)],
        );
      }
      return this.json(res, 200, this.userJson(user));
    }
    if (adminUser && req.method === 'DELETE') {
      this.users.delete(adminUser[1]);
      await this.db.query('DELETE FROM auth.users WHERE id = $1', [
        adminUser[1],
      ]);
      return this.json(res, 200, {});
    }

    // Storage: signed URL, upload, remove
    const sign = url.pathname.match(
      /^\/storage\/v1\/object\/sign\/([^/]+)\/(.+)$/,
    );
    if (sign && req.method === 'POST')
      return this.json(res, 200, {
        signedURL: `/object/sign/${sign[1]}/${sign[2]}?token=fake`,
      });
    const object = url.pathname.match(/^\/storage\/v1\/object\/([^/]+)\/(.+)$/);
    if (object && (req.method === 'POST' || req.method === 'PUT')) {
      this.storedObjects.set(
        `${object[1]}/${object[2]}`,
        (body as { bytes?: number }).bytes ?? 0,
      );
      return this.json(res, 200, {
        Key: `${object[1]}/${object[2]}`,
        Id: randomUUID(),
      });
    }
    const bucket = url.pathname.match(/^\/storage\/v1\/object\/([^/]+)$/);
    if (bucket && req.method === 'DELETE') {
      const prefixes = (body as { prefixes?: string[] }).prefixes ?? [];
      for (const prefix of prefixes)
        this.storedObjects.delete(`${bucket[1]}/${prefix}`);
      return this.json(
        res,
        200,
        prefixes.map((name) => ({ name })),
      );
    }

    return this.json(res, 404, {
      msg: `fake supabase: no route ${url.pathname}`,
    });
  }
}

export interface CapturedEmail {
  to: string[];
  subject: string;
  html: string;
}

/**
 * Replaces global fetch for the test process: the fake Supabase and other
 * loopback hosts pass through, Brevo sends are captured, and every other
 * host is refused and recorded.
 */
export function installOutboundGuard() {
  const original = globalThis.fetch;
  const emails: CapturedEmail[] = [];
  const blocked: string[] = [];
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    );
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost')
      return original(input, init);
    if (url.hostname === 'api.brevo.com') {
      const payload = JSON.parse(
        typeof init?.body === 'string' ? init.body : '{}',
      ) as {
        to?: Array<{ email: string }>;
        subject?: string;
        htmlContent?: string;
      };
      emails.push({
        to: (payload.to ?? []).map((recipient) => recipient.email),
        subject: payload.subject ?? '',
        html: payload.htmlContent ?? '',
      });
      return new Response(
        JSON.stringify({ messageId: `<fake-${randomUUID()}>` }),
        {
          status: 201,
          headers: { 'content-type': 'application/json' },
        },
      );
    }
    blocked.push(url.href);
    throw new TypeError(
      `Outbound request to ${url.hostname} blocked by the live API harness`,
    );
  };
  return {
    emails,
    blocked,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}
