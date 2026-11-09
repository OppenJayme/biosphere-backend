import { DisposableFaqPostgres } from './support/disposable-faq-postgres';
import { createRequire } from 'node:module';

// Public command boundary with explicit trusted adapters; no environment credentials.
const { runInventory } = createRequire(__filename)(
  '../scripts/recovery/source-inventory.cjs',
) as {
  runInventory: (
    argv: string[],
    adapters?: unknown,
  ) => Promise<Record<string, unknown>>;
};

const buckets = [
  'user-avatars',
  'specimen-media',
  'exhibit-media',
  'inquiry-attachments',
  'ar-assets',
];

describe('Read-only source inventory against owned PostgreSQL', () => {
  let database: DisposableFaqPostgres;
  beforeAll(async () => {
    database = await DisposableFaqPostgres.start('recovery-recording');
    await database.admin.query(`
      CREATE SCHEMA auth; CREATE SCHEMA storage;
      CREATE TABLE public.specimen (id integer PRIMARY KEY);
      CREATE TABLE public.user_account (id integer PRIMARY KEY);
      CREATE TABLE auth.users (id integer PRIMARY KEY);
      CREATE TABLE auth.identities (id integer PRIMARY KEY);
      CREATE TABLE storage.objects (id integer PRIMARY KEY);
      CREATE TABLE storage.buckets (id integer PRIMARY KEY);
      INSERT INTO public.specimen VALUES (7);
    `);
  });
  afterAll(async () => {
    await database?.close();
  });

  function adapters() {
    return {
      database: database.admin,
      expectedDatabase: 'biosphere_recovery_recording_disposable',
      storage: {
        listBuckets: () => Promise.resolve(buckets.map((id) => ({ id }))),
        listObjects: () =>
          Promise.resolve({
            objects: [{ key: 'synthetic-private-object', sizeBytes: 10 }],
            nextCursor: null,
          }),
      },
    };
  }

  it('reports aggregate database/bucket coverage and declared object sizes without exposing object keys', async () => {
    const result = await runInventory(['inspect'], adapters());
    expect(result).toMatchObject({
      code: 'SOURCE_INVENTORY_RECORDED',
      databaseNameMatched: true,
      sourceIdentityVerified: false,
      database: { requiredTablesPresent: 6, extraSchemas: 0 },
      storage: {
        buckets: 5,
        objects: 5,
        declaredObjectBytes: 50,
        unknownSizeObjects: 0,
      },
      completeBackup: false,
      deploymentAuthorized: false,
    });
    expect(JSON.stringify(result)).not.toContain('synthetic-private-object');
    expect(JSON.stringify(result)).not.toContain(
      'biosphere_recovery_recording_disposable',
    );
    expect(
      (await database.admin.query('SELECT id FROM public.specimen')).rows,
    ).toEqual([{ id: 7 }]);
  });

  it('rejects a different database name before consulting Storage', async () => {
    let storageCalls = 0;
    const config = adapters();
    config.expectedDatabase = 'wrong_source';
    config.storage.listBuckets = () => {
      storageCalls++;
      return Promise.resolve([]);
    };
    expect(await runInventory(['inspect'], config)).toMatchObject({
      code: 'SOURCE_INVENTORY_SOURCE_MISMATCH',
      completeBackup: false,
    });
    expect(storageCalls).toBe(0);
    expect((await database.admin.query('SELECT 1 AS usable')).rows).toEqual([
      { usable: 1 },
    ]);
  });

  it('rejects missing required tables and leaves the database usable', async () => {
    await database.admin.query(
      'ALTER TABLE auth.identities RENAME TO identities_unavailable',
    );
    try {
      expect(await runInventory(['inspect'], adapters())).toMatchObject({
        code: 'SOURCE_INVENTORY_SCOPE_MISMATCH',
      });
    } finally {
      await database.admin.query(
        'ALTER TABLE auth.identities_unavailable RENAME TO identities',
      );
    }
  });

  it('reports additional schemas and buckets without claiming complete scope', async () => {
    await database.admin.query('CREATE SCHEMA additional_scope');
    try {
      const config = adapters();
      config.storage.listBuckets = () =>
        Promise.resolve(
          [...buckets, 'additional-bucket'].map((id) => ({ id })),
        );
      expect(await runInventory(['inspect'], config)).toMatchObject({
        database: { extraSchemas: 1 },
        storage: { extraBuckets: 1 },
        scopeComplete: false,
      });
    } finally {
      await database.admin.query('DROP SCHEMA additional_scope');
    }
  });

  it('counts unknown sizes separately instead of silently treating them as zero', async () => {
    const config = adapters();
    const unknown = () =>
      Promise.resolve({
        objects: [{ key: 'unknown', sizeBytes: null }],
        nextCursor: null,
      });
    expect(
      await runInventory(['inspect'], {
        ...config,
        storage: { ...config.storage, listObjects: unknown },
      }),
    ).toMatchObject({
      storage: { objects: 5, declaredObjectBytes: 0, unknownSizeObjects: 5 },
      checkpointSizeMeasured: false,
    });
  });

  it('follows every page and totals distinct objects across all required buckets', async () => {
    const config = adapters();
    const paged = ({ cursor }: { cursor: string | null }) =>
      Promise.resolve(
        cursor === null
          ? {
              objects: [{ key: 'first-private', sizeBytes: 2 }],
              nextCursor: 'next-private',
            }
          : {
              objects: [{ key: 'second-private', sizeBytes: 3 }],
              nextCursor: null,
            },
      );
    const result = await runInventory(['inspect'], {
      ...config,
      storage: { ...config.storage, listObjects: paged },
    });
    expect(result).toMatchObject({
      storage: { objects: 10, declaredObjectBytes: 25 },
    });
    expect(JSON.stringify(result)).not.toMatch(
      /first-private|second-private|next-private/,
    );
  });

  it('rejects missing buckets', async () => {
    const config = adapters();
    config.storage.listBuckets = () =>
      Promise.resolve([{ id: 'specimen-media' }]);
    expect(await runInventory(['inspect'], config)).toMatchObject({
      code: 'SOURCE_INVENTORY_SCOPE_MISMATCH',
    });
  });

  it('rejects repeated pagination cursors without returning partial sizing as success', async () => {
    const config = adapters();
    const looping = () =>
      Promise.resolve({ objects: [], nextCursor: 'private-loop' });
    expect(
      await runInventory(['inspect'], {
        ...config,
        storage: { ...config.storage, listObjects: looping },
      }),
    ).toMatchObject({
      code: 'SOURCE_INVENTORY_PAGINATION_INVALID',
      completeBackup: false,
    });
  });

  it('rejects duplicate object entries and invalid sizes', async () => {
    const config = adapters();
    for (const objects of [
      [
        { key: 'same', sizeBytes: 1 },
        { key: 'same', sizeBytes: 1 },
      ],
      [{ key: 'negative', sizeBytes: -1 }],
      [{ key: 'unsafe', sizeBytes: Number.MAX_SAFE_INTEGER + 1 }],
    ]) {
      expect(
        await runInventory(['inspect'], {
          ...config,
          storage: {
            ...config.storage,
            listObjects: () => Promise.resolve({ objects, nextCursor: null }),
          },
        }),
      ).toMatchObject({
        code: 'SOURCE_INVENTORY_METADATA_INVALID',
        completeBackup: false,
      });
    }
  });

  it('sanitizes provider errors while preserving the read-only source contents', async () => {
    const config = adapters();
    const result = await runInventory(['inspect'], {
      ...config,
      storage: {
        ...config.storage,
        listObjects: () =>
          Promise.reject(new Error('private-key-and-path-canary')),
      },
    });
    expect(result).toMatchObject({
      code: 'SOURCE_INVENTORY_FAILED',
      completeBackup: false,
    });
    expect(JSON.stringify(result)).not.toContain('canary');
    expect(
      (await database.admin.query('SELECT id FROM public.specimen')).rows,
    ).toEqual([{ id: 7 }]);
  });
});
