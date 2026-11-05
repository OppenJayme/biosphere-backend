/**
 * A throwaway local PostgreSQL container holding the full BioSphere schema
 * from prisma/migrations, for the progress-report live API suite. It never
 * accepts an environment-supplied connection string.
 */
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';
import {
  FAQ_DB_IMAGE,
  isolatedProcessEnvironment,
} from '../disposable-faq-postgres';

const LOCAL_DOCKER = 'npipe:////./pipe/dockerDesktopLinuxEngine';
const DATABASE = 'biosphere_progress_api_disposable';
const ADMIN = 'progress_fixture_admin';

function docker(args: string[]) {
  return execFileSync('docker', ['--host', LOCAL_DOCKER, ...args], {
    env: isolatedProcessEnvironment(),
    encoding: 'utf8',
    timeout: 60000,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

/** Columns of the Supabase-owned auth.users table that Prisma models. */
const AUTH_STUB = `
  DO $$ BEGIN
    CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN
    CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN
    CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users (
    instance_id uuid, id uuid PRIMARY KEY, aud varchar(255), role varchar(255),
    email varchar(255), encrypted_password varchar(255),
    email_confirmed_at timestamptz, invited_at timestamptz,
    confirmation_token varchar(255), confirmation_sent_at timestamptz,
    recovery_token varchar(255), recovery_sent_at timestamptz,
    email_change_token_new varchar(255), email_change varchar(255),
    email_change_sent_at timestamptz, last_sign_in_at timestamptz,
    raw_app_meta_data jsonb, raw_user_meta_data jsonb, is_super_admin boolean,
    created_at timestamptz, updated_at timestamptz, phone text UNIQUE,
    phone_confirmed_at timestamptz, phone_change text DEFAULT '',
    phone_change_token varchar(255) DEFAULT '', phone_change_sent_at timestamptz,
    confirmed_at timestamptz, email_change_token_current varchar(255) DEFAULT '',
    email_change_confirm_status smallint DEFAULT 0, banned_until timestamptz,
    reauthentication_token varchar(255) DEFAULT '', reauthentication_sent_at timestamptz,
    is_sso_user boolean NOT NULL DEFAULT false, deleted_at timestamptz,
    is_anonymous boolean NOT NULL DEFAULT false
  );
`;

export class DisposableAppDatabase {
  private id = '';
  private port = 0;
  private readonly password = randomUUID().replaceAll('-', '');
  admin!: Client;

  static async start() {
    if (
      process.platform !== 'win32' ||
      process.env.RUN_PROGRESS_API_LIVE !== 'true'
    )
      throw new Error(
        'Set RUN_PROGRESS_API_LIVE=true on Windows with local Docker. No external database is accepted.',
      );
    const db = new DisposableAppDatabase();
    try {
      db.id = docker([
        'create',
        '--pull=never',
        '--name',
        `biosphere-progress-api-${randomUUID()}`,
        '--memory',
        '512m',
        '--log-driver',
        'none',
        '--tmpfs',
        '/var/lib/postgresql/data:rw,nosuid,noexec,size=268435456',
        '--publish',
        '127.0.0.1::5432',
        '--env',
        `POSTGRES_DB=${DATABASE}`,
        '--env',
        `POSTGRES_USER=${ADMIN}`,
        '--env',
        `POSTGRES_PASSWORD=${db.password}`,
        FAQ_DB_IMAGE,
      ]);
      if (!/^[a-f0-9]{64}$/.test(db.id))
        throw new Error('Invalid container identity.');
      docker(['start', db.id]);
      const ports = JSON.parse(
        docker(['inspect', '--format', '{{json .NetworkSettings.Ports}}', db.id]),
      ) as Record<string, Array<{ HostIp: string; HostPort: string }>>;
      const binding = ports['5432/tcp'];
      if (binding?.length !== 1 || binding[0].HostIp !== '127.0.0.1')
        throw new Error('Disposable database is not loopback-only.');
      db.port = Number(binding[0].HostPort);
      for (let attempt = 0; attempt < 80; attempt++) {
        try {
          db.admin = new Client({ connectionString: db.url() });
          await db.admin.connect();
          await db.admin.query('SELECT 1');
          break;
        } catch {
          await db.admin?.end().catch(() => undefined);
          await new Promise((r) => setTimeout(r, 250));
        }
      }
      await db.applySchema();
      return db;
    } catch (error) {
      await db.close();
      throw error;
    }
  }

  url() {
    return `postgresql://${ADMIN}:${this.password}@127.0.0.1:${this.port}/${DATABASE}`;
  }

  private async applySchema() {
    await this.admin.query(AUTH_STUB);
    const dir = resolve(__dirname, '../../../prisma/migrations');
    for (const name of readdirSync(dir).filter((n) => !n.endsWith('.toml')).sort())
      await this.admin.query(
        readFileSync(resolve(dir, name, 'migration.sql'), 'utf8'),
      );
  }

  async close() {
    await this.admin?.end().catch(() => undefined);
    if (this.id) {
      try {
        docker(['rm', '--force', '--volumes', this.id]);
      } catch {
        /* container already gone */
      }
    }
  }
}
