/** Prepared operational command. Not scheduled/enabled by application startup. */
import * as dotenv from 'dotenv';
import { Client } from 'pg';

async function main() {
  const args = process.argv.slice(2);
  if (
    args.length > 1 ||
    (args.length === 1 && !['--apply', '--dry-run'].includes(args[0]))
  ) {
    console.error(
      'Invalid cleanup options. Use no options, --dry-run, or --apply; choose only one mode.',
    );
    process.exitCode = 1;
    return;
  }
  // Validate before loading configuration or opening any database connection.
  dotenv.config({ quiet: true });
  const connectionString = process.env.FAQ_REVIEW_CLEANUP_DATABASE_URL;
  if (!connectionString)
    throw new Error('Missing dedicated cleanup connection.');
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 10000,
    statement_timeout: 30000,
  });
  try {
    await client.connect();
    if (args[0] === '--apply') {
      // Receipt rows cascade; never print IDs, hashes, questions or driver errors.
      const result = await client.query(
        'DELETE FROM public.faq_review_item WHERE expires_at <= CURRENT_TIMESTAMP',
      );
      console.log(JSON.stringify({ mode: 'apply', deleted: result.rowCount }));
    } else {
      const result = await client.query<{ count: string }>(
        'SELECT count(*) AS count FROM public.faq_review_item WHERE expires_at <= CURRENT_TIMESTAMP',
      );
      console.log(
        JSON.stringify({ mode: 'dry-run', expired: result.rows[0].count }),
      );
    }
  } finally {
    await client.end();
  }
}

main().catch(() => {
  console.error(
    'FAQ review cleanup failed. Check deployment configuration; no question data is printed.',
  );
  process.exitCode = 1;
});
