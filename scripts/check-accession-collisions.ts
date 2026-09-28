import * as dotenv from 'dotenv';
import { Client } from 'pg';

dotenv.config();

// -----------------------------------------------------------------------
// Read-only preflight for migration
// 20260927000000_enforce_accession_number_uniqueness (REQ-4.4-04, BR-01).
//
// Reports specimen records whose accession numbers collide under the
// approved rule (lower(btrim(...)), Archived records included), so a
// curator can resolve them BEFORE the migration is applied. It never
// modifies data: the query runs inside a READ ONLY transaction.
//
// Connects to ACCESSION_CHECK_DATABASE_URL, falling back to DIRECT_URL
// (the direct connection Prisma migrations use; see .env.example).
//
//   npm run db:check-accession-collisions
//
// Exit code: 0 = no collisions, 1 = collisions found or the check failed.
// -----------------------------------------------------------------------

// Must stay identical to the check in the migration.
const COLLISIONS_SQL = `
  SELECT lower(btrim(accession_number)) AS accession_key,
         array_agg(
           json_build_object(
             'id', id,
             'accessionNumber', accession_number,
             'status', status
           )
           ORDER BY created_at, id
         ) AS records
  FROM specimen
  WHERE accession_number IS NOT NULL
    AND btrim(accession_number) <> ''
  GROUP BY lower(btrim(accession_number))
  HAVING count(*) > 1
  ORDER BY accession_key`;

interface CollisionRow {
  accession_key: string;
  records: { id: string; accessionNumber: string; status: string }[];
}

async function main(): Promise<void> {
  const connectionString =
    process.env.ACCESSION_CHECK_DATABASE_URL ?? process.env.DIRECT_URL;
  if (!connectionString) {
    throw new Error(
      'Set ACCESSION_CHECK_DATABASE_URL (or DIRECT_URL) to the database to check.',
    );
  }

  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query('BEGIN TRANSACTION READ ONLY');
    const index = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM pg_indexes
         WHERE indexname = 'uq_specimen_accession_number'
       ) AS exists`,
    );
    const counts = await client.query<{ total: string; assigned: string }>(
      `SELECT count(*) AS total,
              count(*) FILTER (
                WHERE accession_number IS NOT NULL
                  AND btrim(accession_number) <> ''
              ) AS assigned
       FROM specimen`,
    );
    const collisions = await client.query<CollisionRow>(COLLISIONS_SQL);
    await client.query('ROLLBACK');

    const { total, assigned } = counts.rows[0];
    console.log('--- accession-number collision preflight ---');
    console.log(
      `uniqueness index present: ${index.rows[0].exists ? 'yes' : 'no'}`,
    );
    console.log(`specimen records: ${total} (${assigned} with a number)`);

    if (collisions.rows.length === 0) {
      console.log('collisions: none, so the migration can be applied.');
      return;
    }

    console.log(
      `collisions: ${collisions.rows.length} number(s) shared by more than one record.`,
    );
    for (const row of collisions.rows) {
      console.log(`\n  ${JSON.stringify(row.accession_key)}`);
      for (const record of row.records) {
        console.log(
          `    ${record.id}  ${JSON.stringify(record.accessionNumber)}  ${record.status}`,
        );
      }
    }
    console.log(
      '\nResolve these by hand (correct or clear the numbers) before applying the migration.',
    );
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
