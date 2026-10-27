/** Owns a fresh container, not an environment-supplied connection or an existing database. */
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';

export const FAQ_DB_IMAGE =
  'postgres@sha256:eee6c6e1b0894fa4fe0075eb054af9fd1cf39a35321c2d4110626cfe506411fb';
const LOCAL_DOCKER = 'npipe:////./pipe/dockerDesktopLinuxEngine';
// Historical class/file name retained for the existing FAQ suite.
const DATABASE_PROFILES = {
  'faq-review': {
    database: 'biosphere_faq_review_disposable',
    optIn: 'RUN_FAQ_REVIEW_DISPOSABLE_DB',
  },
  collections: {
    database: 'biosphere_collections_disposable',
    optIn: 'RUN_COLLECTIONS_DISPOSABLE_DB',
  },
} as const;
type DatabaseScope = keyof typeof DATABASE_PROFILES;

/** No inherited database, Supabase, Docker-host, proxy or application secrets. */
export function isolatedProcessEnvironment(): NodeJS.ProcessEnv {
  const allowed = new Set([
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
  ]);
  return Object.fromEntries(
    Object.entries(process.env).filter(([name]) =>
      allowed.has(name.toLowerCase()),
    ),
  );
}

function docker(args: string[]) {
  try {
    return execFileSync('docker', ['--host', LOCAL_DOCKER, ...args], {
      env: isolatedProcessEnvironment(),
      encoding: 'utf8',
      timeout: 30000,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    throw new Error(
      'Disposable FAQ Docker operation failed. Check local Docker/image readiness; private command output is suppressed.',
    );
  }
}

export class DisposableFaqPostgres {
  private readonly owner = randomUUID();
  private readonly password = randomUUID().replaceAll('-', '');
  private id = '';
  private port = 0;
  private clients: Client[] = [];
  admin!: Client;

  private constructor(private readonly scope: DatabaseScope) {}

  static async start(scope: DatabaseScope = 'faq-review') {
    const profile = DATABASE_PROFILES[scope];
    if (
      process.platform !== 'win32' ||
      !profile ||
      process.env[profile.optIn] !== 'true'
    )
      throw new Error(
        'Use the explicit Windows local-Docker database test command. No external connection is accepted.',
      );
    const database = new DisposableFaqPostgres(scope);
    try {
      database.id = docker([
        'create',
        '--pull=never',
        '--name',
        `biosphere-${scope}-${database.owner}`,
        '--label',
        `biosphere.${scope}.owner=${database.owner}`,
        '--memory',
        '384m',
        '--cpus',
        '1',
        '--log-driver',
        'none',
        '--tmpfs',
        '/var/lib/postgresql/data:rw,nosuid,noexec,size=134217728',
        '--publish',
        '127.0.0.1::5432',
        '--env',
        `POSTGRES_DB=${profile.database}`,
        '--env',
        'POSTGRES_USER=faq_fixture_admin',
        '--env',
        `POSTGRES_PASSWORD=${database.password}`,
        FAQ_DB_IMAGE,
      ]);
      if (!/^[a-f0-9]{64}$/.test(database.id))
        throw new Error('Invalid owned container identity.');
      docker(['start', database.id]);
      const ports = JSON.parse(
        docker([
          'inspect',
          '--format',
          '{{json .NetworkSettings.Ports}}',
          database.id,
        ]),
      ) as Record<string, Array<{ HostIp: string; HostPort: string }>>;
      const binding = ports['5432/tcp'];
      if (
        binding?.length !== 1 ||
        binding[0].HostIp !== '127.0.0.1' ||
        !/^\d+$/.test(binding[0].HostPort)
      )
        throw new Error('Disposable database is not loopback-only.');
      database.port = Number(binding[0].HostPort);
      const mounts = JSON.parse(
        docker(['inspect', '--format', '{{json .Mounts}}', database.id]),
      ) as Array<{ Type: string; Destination: string }>;
      // Docker's legacy --tmpfs configuration is in HostConfig.Tmpfs, not necessarily Mounts.
      const tmpfs = JSON.parse(
        docker([
          'inspect',
          '--format',
          '{{json .HostConfig.Tmpfs}}',
          database.id,
        ]),
      ) as Record<string, string>;
      if (
        mounts.some((mount) => mount.Type !== 'tmpfs') ||
        typeof tmpfs['/var/lib/postgresql/data'] !== 'string' ||
        docker([
          'exec',
          database.id,
          'stat',
          '-f',
          '-c',
          '%T',
          '/var/lib/postgresql/data',
        ]) !== 'tmpfs'
      )
        throw new Error(
          'Persistent or host-mounted database storage is forbidden.',
        );
      for (let attempt = 0; attempt < 60; attempt++) {
        try {
          database.admin = await database.connect('faq_fixture_admin');
          return database;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      }
      throw new Error('Disposable PostgreSQL did not become ready.');
    } catch (error) {
      await database.close();
      throw error;
    }
  }

  /** Constructed only from this process's inspected container binding and generated secret. */
  url(role = 'faq_fixture_admin') {
    if (!this.id || this.port < 1 || !/^[a-z_]+$/.test(role))
      throw new Error('Disposable connection is unavailable.');
    return `postgresql://${role}:${this.password}@127.0.0.1:${this.port}/${DATABASE_PROFILES[this.scope].database}`;
  }

  async connect(role = 'faq_fixture_admin') {
    const client = new Client({
      connectionString: this.url(role),
      connectionTimeoutMillis: 1000,
      statement_timeout: 5000,
    });
    try {
      await client.connect();
    } catch {
      await client.end();
      throw new Error('Disposable PostgreSQL connection unavailable.');
    }
    this.clients.push(client);
    return client;
  }

  async createRole(name: 'service_role' | 'faq_cleanup') {
    // Only fixed test roles, generated password; never copied deployment credentials.
    const bypass = name === 'service_role' ? 'BYPASSRLS' : 'NOBYPASSRLS';
    await this.admin.query(
      `CREATE ROLE ${name} LOGIN ${bypass} PASSWORD '${this.password}'`,
    );
  }

  async close() {
    const closed = await Promise.allSettled(
      this.clients.map((client) => client.end()),
    );
    this.clients = [];
    if (!this.id) return;
    const labels = JSON.parse(
      docker(['inspect', '--format', '{{json .Config.Labels}}', this.id]),
    ) as Record<string, string>;
    if (labels[`biosphere.${this.scope}.owner`] !== this.owner)
      throw new Error('Refusing to remove a container not owned by this run.');
    docker(['rm', '--force', this.id]);
    this.id = '';
    if (closed.some((result) => result.status === 'rejected'))
      throw new Error(
        'Disposable database clients reported a shutdown error; the owned container was still removed.',
      );
  }
}
