import { createRequire } from 'node:module';
import {
  createServer,
  request as localRequest,
  type Server,
  type IncomingMessage,
  type RequestOptions,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import { Client } from 'pg';
import { DisposableFaqPostgres } from './support/disposable-faq-postgres';

const { runConfiguredInventory } = createRequire(__filename)(
  '../scripts/recovery/source-inventory-connection.cjs',
) as {
  runConfiguredInventory: (
    args: string[],
    dependencies?: unknown,
  ) => Promise<Record<string, unknown>>;
};
const project = 'abcdefghijklmnopqrst';
const baseArgs = [
  'inspect',
  '--project-ref',
  project,
  '--authorization-ref',
  'synthetic-read-only-approval',
];
const args = [...baseArgs, '--object-source', 'api'];
const buckets = [
  'user-avatars',
  'specimen-media',
  'exhibit-media',
  'inquiry-attachments',
  'ar-assets',
];

describe('Configured inventory with owned PostgreSQL and synthetic Storage HTTP', () => {
  let fixture: DisposableFaqPostgres;
  let server: Server;
  let port: number;
  let ownedUrl: string;
  const connections = new Set<Client>();
  const requests: Array<{ method: string; path: string }> = [];
  let responseMode = 'ok';
  let useLimitedRole = false;
  beforeEach(() => {
    requests.length = 0;
    responseMode = 'ok';
    useLimitedRole = false;
  });
  beforeAll(async () => {
    fixture = await DisposableFaqPostgres.start('recovery-recording');
    ownedUrl = fixture
      .url()
      .replace(/\/biosphere_recovery_recording_disposable$/, '/postgres');
    const seed = new Client({ connectionString: ownedUrl });
    try {
      await seed.connect();
      await seed.query(`CREATE SCHEMA auth; CREATE SCHEMA storage;
        CREATE TABLE public.specimen(id integer); CREATE TABLE public.user_account(id integer);
        CREATE TABLE auth.users(id integer); CREATE TABLE auth.identities(id integer);
        CREATE TABLE storage.buckets(id integer);
        CREATE TABLE storage.objects(id serial, bucket_id text, name text, metadata jsonb);
        INSERT INTO storage.objects(bucket_id,name,metadata) VALUES
          ('user-avatars','owner/root.png','{"size":10}'),
          ('specimen-media','owner/root.png','{"size":10}'),
          ('exhibit-media','owner/root.png','{"size":10}'),
          ('inquiry-attachments','owner/root.png','{"size":10}'),
          ('ar-assets','owner/root.png','{"size":10}'),
          ('user-avatars','owner/nested/extra.png','{"size":20}');`);
    } finally {
      await seed.end();
    }
    server = createServer((req, res) => {
      requests.push({ method: req.method ?? '', path: req.url ?? '' });
      let body = '';
      req.on('data', (chunk: Buffer) => {
        body += chunk.toString('utf8');
      });
      req.on('end', () => {
        res.setHeader('Content-Type', 'application/json');
        if (responseMode === 'stall') return;
        if (responseMode === 'denied') {
          res.statusCode = 403;
          res.end('{"error":"private-denial-canary"}');
          return;
        }
        if (responseMode === 'redirect') {
          res.statusCode = 302;
          res.setHeader('Location', 'https://private-canary.invalid/');
          res.end('{}');
          return;
        }
        if (responseMode === 'malformed') {
          res.end('private-json-canary');
          return;
        }
        if (responseMode === 'oversized') {
          res.end('x'.repeat(2 * 1024 ** 2 + 1));
          return;
        }
        if (
          req.url?.startsWith('/storage/v1/bucket?') &&
          req.method === 'GET'
        ) {
          res.end(JSON.stringify(buckets.map((id) => ({ id }))));
          return;
        }
        if (
          req.method === 'POST' &&
          req.url?.startsWith('/storage/v1/object/list/')
        ) {
          const input = JSON.parse(body) as { prefix: string; offset: number };
          if (responseMode === 'placeholders') {
            res.end(
              JSON.stringify([
                {
                  id: 'marker',
                  name: '.emptyFolderPlaceholder',
                  metadata: { size: 0 },
                },
                { id: 'real', name: 'real.png', metadata: { size: 10 } },
              ]),
            );
            return;
          }
          if (responseMode === 'offset' && req.url.endsWith('/user-avatars')) {
            res.end(
              JSON.stringify(
                input.offset === 0
                  ? Array.from({ length: 1000 }, (_, index) => ({
                      id: `id-${index}`,
                      name: `name-${index}`,
                      metadata: { size: 1 },
                    }))
                  : [{ id: 'last', name: 'last', metadata: { size: 1 } }],
              ),
            );
            return;
          }
          if (responseMode === 'unknown') {
            res.end('[{"id":"unknown","name":"unknown-canary","metadata":{}}]');
            return;
          }
          if (responseMode === 'bad-folder') {
            res.end(
              '[{"id":null,"name":"folder-canary","metadata":{"size":1}}]',
            );
            return;
          }
          if (input.prefix === 'nested')
            res.end(
              JSON.stringify([
                {
                  id: 'synthetic-nested',
                  name: 'private-path-canary.png',
                  metadata: { size: 20 },
                },
              ]),
            );
          else
            res.end(
              JSON.stringify([
                {
                  id: 'synthetic-root',
                  name: 'private-root-canary.png',
                  metadata: { size: 10 },
                },
                ...(req.url.endsWith('/user-avatars')
                  ? [{ id: null, name: 'nested', metadata: null }]
                  : []),
              ]),
            );
          return;
        }
        res.statusCode = 404;
        res.end('{}');
      });
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    port = (server.address() as AddressInfo).port;
  });
  afterAll(async () => {
    for (const client of connections) await client.end();
    if (server)
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    await fixture?.close();
  });
  function dependencies() {
    return {
      environment: {
        BIOSPHERE_INVENTORY_DATABASE_URL: `postgresql://inventory:synthetic-password@db.${project}.supabase.co:5432/postgres`,
        BIOSPHERE_INVENTORY_STORAGE_API_KEY: 'synthetic-api-key-value',
        BIOSPHERE_INVENTORY_STORAGE_BEARER: 'synthetic.synthetic.synthetic',
      },
      createClient: (config: Record<string, unknown>) => {
        expect(config.ssl).toMatchObject({ rejectUnauthorized: true });
        for (const field of [
          'options',
          'statement_timeout',
          'lock_timeout',
          'idle_in_transaction_session_timeout',
        ]) {
          expect(config).not.toHaveProperty(field);
        }
        const client = new Client({
          connectionString: ownedUrl,
          ...(useLimitedRole ? { options: '-c role=inventory_limited' } : {}),
        });
        connections.add(client);
        client.on('end', () => connections.delete(client));
        return client;
      },
      request: (
        options: RequestOptions,
        callback: (response: IncomingMessage) => void,
      ) => {
        expect(options.hostname).toBe(`${project}.supabase.co`);
        expect(options.rejectUnauthorized).toBe(true);
        return localRequest(
          { ...options, protocol: 'http:', hostname: '127.0.0.1', port },
          callback,
        );
      },
    };
  }

  async function queryOwned(sql: string, values?: unknown[]) {
    const client = new Client({ connectionString: ownedUrl });
    try {
      await client.connect();
      return await client.query(sql, values);
    } finally {
      await client.end();
    }
  }

  it('uses database metadata by default for hundreds of folders without object-list requests', async () => {
    await queryOwned(`INSERT INTO storage.objects(bucket_id,name,metadata)
      SELECT 'specimen-media', 'owner-' || n || '/image.png', '{"size":1}'::jsonb
      FROM generate_series(1,500) n`);
    try {
      const result = await runConfiguredInventory(baseArgs, dependencies());
      expect(result).toMatchObject({
        code: 'SOURCE_INVENTORY_RECORDED',
        storageInventoryBasis: 'DATABASE_ROLE_VISIBLE_METADATA',
        storage: {
          objects: 506,
          declaredObjectBytes: 570,
          unknownSizeObjects: 0,
          rowSecurityActive: false,
        },
        completeBackup: false,
      });
      expect(requests.every((request) => request.method === 'GET')).toBe(true);
      expect(connections.size).toBe(0);
    } finally {
      await queryOwned('DELETE FROM storage.objects WHERE id > 6');
    }
  });

  it('excludes only zero-byte dashboard placeholders and reports unknown metadata sizes', async () => {
    await queryOwned(`INSERT INTO storage.objects(bucket_id,name,metadata) VALUES
      ('specimen-media','nested/.emptyFolderPlaceholder','{"size":0}'),
      ('specimen-media','actual/.emptyFolderPlaceholder','{"size":9}'),
      ('specimen-media','unknown/.emptyFolderPlaceholder','{}')`);
    try {
      expect(
        await runConfiguredInventory(baseArgs, dependencies()),
      ).toMatchObject({
        code: 'SOURCE_INVENTORY_RECORDED',
        storage: {
          objects: 8,
          declaredObjectBytes: 79,
          unknownSizeObjects: 1,
          placeholderObjects: 1,
        },
      });
    } finally {
      await queryOwned('DELETE FROM storage.objects WHERE id > 6');
    }
  });

  it('reports active PostgreSQL RLS and visible counts rather than assuming a complete inventory', async () => {
    await queryOwned(`CREATE ROLE inventory_limited;
      GRANT USAGE ON SCHEMA storage TO inventory_limited;
      GRANT SELECT ON storage.objects TO inventory_limited;
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      CREATE POLICY inventory_visible ON storage.objects FOR SELECT TO inventory_limited USING (bucket_id = 'specimen-media');`);
    useLimitedRole = true;
    try {
      expect(
        await runConfiguredInventory(baseArgs, dependencies()),
      ).toMatchObject({
        code: 'SOURCE_INVENTORY_RECORDED',
        storage: {
          objects: 1,
          declaredObjectBytes: 10,
          rowSecurityActive: true,
        },
        sourceIdentityVerified: false,
        completeBackup: false,
      });
    } finally {
      useLimitedRole = false;
      await queryOwned(`DROP POLICY inventory_visible ON storage.objects;
        ALTER TABLE storage.objects DISABLE ROW LEVEL SECURITY;
        DROP OWNED BY inventory_limited; DROP ROLE inventory_limited;`);
    }
  });

  it('uses a new-format secret API key without misrepresenting it as a bearer JWT', async () => {
    const input = dependencies();
    input.environment.BIOSPHERE_INVENTORY_STORAGE_API_KEY =
      'sb_secret_synthetic_fixture_key';
    input.environment.BIOSPHERE_INVENTORY_STORAGE_BEARER = '';
    const request = input.request;
    input.request = (options, callback) => {
      expect(options.headers).not.toHaveProperty('Authorization');
      return request(options, callback);
    };
    expect(await runConfiguredInventory(baseArgs, input)).toMatchObject({
      code: 'SOURCE_INVENTORY_RECORDED',
      storage: { objects: 6, declaredObjectBytes: 70 },
    });
  });

  it('excludes zero-byte folder placeholder objects in explicit API mode', async () => {
    responseMode = 'placeholders';
    expect(await runConfiguredInventory(args, dependencies())).toMatchObject({
      code: 'SOURCE_INVENTORY_RECORDED',
      storageInventoryBasis: 'STORAGE_API_LISTING',
      storage: { objects: 5, declaredObjectBytes: 50, placeholderObjects: 5 },
    });
  });

  it('rejects aggregate totals outside the safe integer range', async () => {
    await queryOwned(`INSERT INTO storage.objects(bucket_id,name,metadata) VALUES
      ('specimen-media','large-a','{"size":9007199254740991}'),
      ('specimen-media','large-b','{"size":9007199254740991}')`);
    try {
      expect(
        await runConfiguredInventory(baseArgs, dependencies()),
      ).toMatchObject({
        code: 'SOURCE_INVENTORY_METADATA_INVALID',
        completeBackup: false,
      });
    } finally {
      await queryOwned('DELETE FROM storage.objects WHERE id > 6');
    }
  });

  it.each([
    '{"size":-1}',
    '{"size":1.5}',
    '{"size":"10"}',
    '{"size":9007199254740992}',
  ])(
    'rejects malformed SQL size metadata %s instead of claiming usable totals',
    async (metadata) => {
      await queryOwned(
        `INSERT INTO storage.objects(bucket_id,name,metadata) VALUES ('specimen-media','invalid-canary/file',$1::jsonb)`,
        [metadata],
      );
      try {
        const result = await runConfiguredInventory(baseArgs, dependencies());
        expect(result).toMatchObject({
          code: 'SOURCE_INVENTORY_METADATA_INVALID',
          completeBackup: false,
        });
        expect(result).not.toHaveProperty('configuredProjectAddressesAgree');
        expect(JSON.stringify(result)).not.toContain('invalid-canary');
      } finally {
        await queryOwned('DELETE FROM storage.objects WHERE id > 6');
      }
    },
  );

  it('reads owned catalogs and recursively lists metadata without downloading bytes or leaking names', async () => {
    const result = await runConfiguredInventory(args, dependencies());
    expect(result).toMatchObject({
      code: 'SOURCE_INVENTORY_RECORDED',
      configuredProjectAddressesAgree: true,
      sourceIdentityVerified: false,
      storage: { buckets: 5, objects: 6, declaredObjectBytes: 70 },
      completeBackup: false,
      deploymentAuthorized: false,
    });
    expect(JSON.stringify(result)).not.toMatch(
      /canary|password|supabase|synthetic-api-key/,
    );
    expect(
      requests.every(
        (req) =>
          req.path.startsWith('/storage/v1/bucket?') ||
          req.path.startsWith('/storage/v1/object/list/'),
      ),
    ).toBe(true);
    expect(connections.size).toBe(0);
  });

  it('accepts a project-bound IPv4 session-pooler configuration with the same read-only behavior', async () => {
    const input = dependencies();
    input.environment.BIOSPHERE_INVENTORY_DATABASE_URL = `postgresql://inventory.${project}:synthetic-password@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`;
    expect(await runConfiguredInventory(args, input)).toMatchObject({
      code: 'SOURCE_INVENTORY_RECORDED',
      storage: { objects: 6, declaredObjectBytes: 70 },
    });
    expect(connections.size).toBe(0);
  });

  it('continues offset pagination after a full provider page', async () => {
    responseMode = 'offset';
    expect(await runConfiguredInventory(args, dependencies())).toMatchObject({
      code: 'SOURCE_INVENTORY_RECORDED',
      storage: { objects: 1005, declaredObjectBytes: 1041 },
    });
    expect(connections.size).toBe(0);
  });

  it('normalizes missing provider sizes as unknown instead of fabricated zero-byte objects', async () => {
    responseMode = 'unknown';
    expect(await runConfiguredInventory(args, dependencies())).toMatchObject({
      code: 'SOURCE_INVENTORY_RECORDED',
      storage: { objects: 5, unknownSizeObjects: 5 },
      objectBytesVerified: false,
      checkpointSizeMeasured: false,
    });
  });

  it.each([
    'denied',
    'redirect',
    'malformed',
    'oversized',
    'bad-folder',
    'stall',
  ])(
    'fails safely and closes the owned database for %s responses',
    async (mode) => {
      responseMode = mode;
      const result = await runConfiguredInventory(args, dependencies());
      expect(result.code).not.toBe('SOURCE_INVENTORY_RECORDED');
      expect(result).toMatchObject({
        completeBackup: false,
        deploymentAuthorized: false,
      });
      expect(JSON.stringify(result)).not.toMatch(
        /canary|password|supabase|synthetic-api-key/,
      );
      expect(connections.size).toBe(0);
      if (mode === 'redirect') expect(requests).toHaveLength(1);
    },
  );

  it('closes the owned connection after an actual PostgreSQL authentication failure without contacting Storage', async () => {
    const input = dependencies();
    input.createClient = () => {
      const url = new URL(ownedUrl);
      url.username = 'synthetic_missing_role';
      const client = new Client({
        connectionString: url.toString(),
        connectionTimeoutMillis: 1000,
      });
      connections.add(client);
      client.on('end', () => connections.delete(client));
      return client;
    };
    const result = await runConfiguredInventory(args, input);
    expect(result).toMatchObject({
      code: 'SOURCE_CONNECTION_FAILED',
      completeBackup: false,
    });
    expect(JSON.stringify(result)).not.toMatch(
      /password|missing_role|postgresql/,
    );
    expect(requests).toHaveLength(0);
    expect(connections.size).toBe(0);
  });
});
