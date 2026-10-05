/** Read-only migration preflight; reports duplicate UUIDs and specimen references. */
import * as dotenv from 'dotenv';
import { Client } from 'pg';

dotenv.config({ quiet: true });

async function main(): Promise<void> {
  const connectionString =
    process.env.COLLECTION_CHECK_DATABASE_URL ?? process.env.DIRECT_URL;
  if (!connectionString)
    throw new Error('Set COLLECTION_CHECK_DATABASE_URL or DIRECT_URL.');
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 10000,
    statement_timeout: 10000,
  });
  try {
    await client.connect();
    await client.query('BEGIN TRANSACTION READ ONLY');
    const result = await client.query<{
      name_key: string;
      records: unknown[];
    }>(`
      SELECT lower(btrim(c.collection_name)) AS name_key,
             json_agg(json_build_object(
               'id', c.id, 'name', c.collection_name,
               'specimenCount', (SELECT count(*) FROM public.specimen s WHERE s.collection_id = c.id)
             ) ORDER BY c.id) AS records
      FROM public.collection c
      GROUP BY lower(btrim(c.collection_name))
      HAVING count(*) > 1 ORDER BY name_key
    `);
    await client.query('ROLLBACK');
    if (result.rows.length === 0) {
      console.log(
        'No collection-name collisions. Preflight passed. No data was changed.',
      );
      return;
    }
    console.log(JSON.stringify(result.rows, null, 2));
    console.log('Review these records before migration. No data was changed.');
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch(() => {
  // Do not print connection strings or driver errors that might contain credentials.
  console.error(
    'Collection preflight failed. Check the connection and database availability.',
  );
  process.exitCode = 1;
});
