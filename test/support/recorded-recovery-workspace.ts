/** Owns two network-disabled synthetic CLI databases, separate from history storage. */
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  FAQ_DB_IMAGE,
  isolatedProcessEnvironment,
} from './disposable-faq-postgres';

export class RecordedRecoveryWorkspace {
  readonly owner = randomUUID();
  readonly root = mkdtempSync(join(tmpdir(), 'biosphere-recorded-recovery-'));
  readonly profileFile = join(this.root, 'profile.json');
  private readonly containers: string[] = [];
  source = '';
  target = '';

  docker(args: string[], input?: string): string {
    return execFileSync(
      'docker',
      ['--host', 'npipe:////./pipe/dockerDesktopLinuxEngine', ...args],
      {
        env: isolatedProcessEnvironment(),
        input,
        encoding: 'utf8',
        timeout: 30000,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    ).trim();
  }
  sql(id: string, query: string): string {
    return this.docker(
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
        'biosphere_recovery_fixture',
      ],
      query,
    );
  }
  async start() {
    if (
      process.env.RUN_RECOVERY_RECORDING_DISPOSABLE_DB !== 'true' ||
      process.platform !== 'win32'
    ) {
      throw new Error(
        'Explicit owned Windows Docker fixture opt-in is required.',
      );
    }
    try {
      for (let index = 0; index < 2; index++) {
        const id = this.docker([
          'create',
          '--pull=never',
          '--network',
          'none',
          '--label',
          `biosphere.recovery.owner=${this.owner}`,
          '--memory',
          '384m',
          '--cpus',
          '1',
          '--log-driver',
          'none',
          '--tmpfs',
          '/var/lib/postgresql/data:rw,nosuid,noexec,size=268435456',
          '-e',
          'POSTGRES_HOST_AUTH_METHOD=trust',
          '-e',
          'POSTGRES_DB=biosphere_recovery_fixture',
          FAQ_DB_IMAGE,
        ]);
        if (!/^[a-f0-9]{64}$/.test(id))
          throw new Error('Invalid owned container identity.');
        this.containers.push(id);
        this.docker(['start', id]);
        let ready = false;
        for (let attempt = 0; attempt < 60; attempt++) {
          try {
            this.sql(id, 'SELECT 1');
            ready = true;
            break;
          } catch {
            await new Promise((resolve) => setTimeout(resolve, 250));
          }
        }
        if (!ready)
          throw new Error('Owned recovery fixture did not become ready.');
      }
      [this.source, this.target] = this.containers;
      this.sql(
        this.source,
        `CREATE SCHEMA storage;
        CREATE SCHEMA auth;
        CREATE TABLE auth.users(id integer PRIMARY KEY);
        CREATE TABLE auth.identities(id integer PRIMARY KEY);
        CREATE TABLE public.specimen(id integer PRIMARY KEY);
        CREATE TABLE public.audit_log(id integer PRIMARY KEY);
        CREATE TABLE public._prisma_migrations(id integer PRIMARY KEY);
        CREATE TABLE storage.buckets(id text PRIMARY KEY, public boolean NOT NULL);
        CREATE TABLE storage.objects(bucket_id text REFERENCES storage.buckets(id), name text, PRIMARY KEY(bucket_id,name));
        INSERT INTO storage.buckets VALUES ('ar-assets',false),('exhibit-media',false),('inquiry-attachments',false),('specimen-media',false),('user-avatars',false);
        CREATE TABLE public.synthetic_inventory(id integer PRIMARY KEY, quantity integer NOT NULL);
        INSERT INTO public.synthetic_inventory VALUES (1,7);`,
      );
      writeFileSync(join(this.root, '.recovery-owner'), this.owner, {
        mode: 0o600,
      });
      writeFileSync(join(this.root, 'recovery.key'), randomBytes(32), {
        mode: 0o600,
      });
      writeFileSync(
        join(this.root, 'configuration.json'),
        JSON.stringify({ mode: 'synthetic' }),
        { mode: 0o600 },
      );
      for (const bucket of [
        'ar-assets',
        'exhibit-media',
        'inquiry-attachments',
        'specimen-media',
        'user-avatars',
      ]) {
        mkdirSync(join(this.root, 'objects', bucket), {
          recursive: true,
          mode: 0o700,
        });
      }
      writeFileSync(
        this.profileFile,
        JSON.stringify({
          format: 'biosphere-synthetic-recovery-v1',
          owner: this.owner,
          sourceContainer: this.source,
          targetContainer: this.target,
          image: FAQ_DB_IMAGE,
          operator: 'synthetic-rehearsal',
        }),
        { mode: 0o600 },
      );
      return this;
    } catch (error) {
      this.close();
      throw error;
    }
  }
  close() {
    for (const id of this.containers) {
      const info = JSON.parse(this.docker(['inspect', id])) as Array<{
        Id: string;
        Config: { Labels: Record<string, string> };
      }>;
      if (
        info[0].Id !== id ||
        info[0].Config.Labels['biosphere.recovery.owner'] !== this.owner
      ) {
        throw new Error(
          'Refusing cleanup of a recovery container not owned by this fixture.',
        );
      }
      this.docker(['rm', '--force', id]);
    }
    this.containers.length = 0;
    // Retain this owned synthetic workspace, fake key and receipts for diagnosis.
  }
}
