/**
 * Real PostgreSQL check of which communication_history entries may have no
 * acting curator (recorded_by IS NULL). Unit tests mock Prisma, so only a real
 * database proves the check constraint; production rejected receipt emails and
 * mailbox-sync pointer notes with 23514 while CI stayed green (PR #325).
 * Applies the real table SQL and migrations; no AppModule, auth or .env.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DisposableFaqPostgres } from './support/disposable-faq-postgres';
import { seedFaqReviewAuthTables } from './support/faq-review-database-app';

const INQUIRY_ID = '55555555-5555-4555-8555-555555555555';
const CURATOR = '11111111-1111-4111-8111-111111111111';
const CONSTRAINT = 'communication_recorded_by_unless_system';

describe('communication_history null-curator check on owned PostgreSQL', () => {
  let database: DisposableFaqPostgres;

  beforeAll(async () => {
    database = await DisposableFaqPostgres.start('communication-history');
    await database.createRole('service_role');
    await seedFaqReviewAuthTables(database.admin);
    for (const file of [
      'database/sql/016_inquiry.sql',
      'database/sql/017_visit_request.sql',
      'database/sql/025_communication_history.sql',
      'prisma/migrations/20261111000000_add_mailbox_reply_sync/migration.sql',
      'prisma/migrations/20261116000000_allow_system_communication_entries/migration.sql',
    ]) {
      await database.admin.query(
        readFileSync(resolve(__dirname, '..', file), 'utf8'),
      );
    }
  });
  afterAll(async () => {
    await database?.close();
  });
  beforeEach(async () => {
    await database.admin.query(
      'TRUNCATE communication_history, inquiry CASCADE',
    );
    await database.admin.query(
      `INSERT INTO inquiry(id,full_name,email_address,inquiry_type,message)
      VALUES ($1,'Synthetic Visitor','visitor@example.invalid','GENERAL','Synthetic question')`,
      [INQUIRY_ID],
    );
  });

  function insert(
    direction: string,
    communicationType: string,
    recordedBy: string | null = null,
  ) {
    return database.admin.query(
      `INSERT INTO communication_history
        (inquiry_id, recorded_by, direction, communication_type, message)
      VALUES ($1, $2, $3, $4, 'Synthetic entry')`,
      [INQUIRY_ID, recordedBy, direction, communicationType],
    );
  }

  it.each([
    // Mailbox sync: an imported visitor reply.
    ['INBOUND', 'VISITOR_REPLY'],
    // Automatic receipt on submission or referral.
    ['OUTBOUND', 'RECEIPT_EMAIL'],
    // Pointer note left when a reply is filed on the referred visit request.
    ['INTERNAL', 'NOTE'],
  ])('accepts %s / %s with no curator', async (direction, type) => {
    await insert(direction, type);
    const { rows } = await database.admin.query<{ recorded_by: null }>(
      'SELECT recorded_by FROM communication_history WHERE communication_type = $1',
      [type],
    );
    expect(rows).toEqual([{ recorded_by: null }]);
  });

  it.each([
    ['OUTBOUND', 'MESSAGE_EMAIL'],
    ['OUTBOUND', 'STATUS_UPDATE_EMAIL'],
    ['INTERNAL', 'STATUS_CHANGE'],
  ])('rejects %s / %s with no curator (23514)', async (direction, type) => {
    await expect(insert(direction, type)).rejects.toMatchObject({
      code: '23514',
      constraint: CONSTRAINT,
    });
    const { rows } = await database.admin.query(
      'SELECT 1 FROM communication_history',
    );
    expect(rows).toHaveLength(0);
  });

  it('still accepts curator-recorded entries of the rejected kinds', async () => {
    await insert('OUTBOUND', 'MESSAGE_EMAIL', CURATOR);
    await insert('INTERNAL', 'STATUS_CHANGE', CURATOR);
    const { rows } = await database.admin.query(
      'SELECT count(*)::int AS count FROM communication_history',
    );
    expect(rows).toEqual([{ count: 2 }]);
  });
});
