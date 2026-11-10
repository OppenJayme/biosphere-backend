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
const args = [
  'inspect',
  '--project-ref',
  project,
  '--authorization-ref',
  'synthetic-read-only-approval',
];
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
  beforeEach(() => {
    requests.length = 0;
    responseMode = 'ok';
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
        CREATE TABLE storage.buckets(id integer); CREATE TABLE storage.objects(id integer);`);
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
        const client = new Client({ connectionString: ownedUrl });
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
