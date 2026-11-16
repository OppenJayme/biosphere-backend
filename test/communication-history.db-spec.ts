/**
 * Real PostgreSQL check of which communication_history entries may have no
 * acting curator (recorded_by IS NULL). Unit tests mock Prisma, so only a real
 * database proves the check constraint; production rejected receipt emails and
 * mailbox-sync pointer notes with 23514 while CI stayed green (PR #325).
 * The pointer then got its own SYSTEM_NOTE type so curator notes need a
 * curator again.
 * Applies the real table SQL and migrations; no AppModule, auth or .env.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DisposableFaqPostgres } from './support/disposable-faq-postgres';
import { seedFaqReviewAuthTables } from './support/faq-review-database-app';

const INQUIRY_ID = '55555555-5555-4555-8555-555555555555';
const CURATOR = '11111111-1111-4111-8111-111111111111';
const CONSTRAINT = 'communication_recorded_by_unless_system';
const MIGRATIONS = 'prisma/migrations';

describe('communication_history null-curator check on owned PostgreSQL', () => {
  let database: DisposableFaqPostgres;
  let retyped: Array<{
    communication_type: string;
    recorded_by: string | null;
  }>;

  async function apply(file: string) {
    await database.admin.query(
      readFileSync(resolve(__dirname, '..', file), 'utf8'),
    );
  }

  beforeAll(async () => {
    database = await DisposableFaqPostgres.start('communication-history');
    await database.createRole('service_role');
    await seedFaqReviewAuthTables(database.admin);
    for (const file of [
      'database/sql/016_inquiry.sql',
      'database/sql/017_visit_request.sql',
      'database/sql/025_communication_history.sql',
      `${MIGRATIONS}/20261111000000_add_mailbox_reply_sync/migration.sql`,
      `${MIGRATIONS}/20261116000000_allow_system_communication_entries/migration.sql`,
    ]) {
      await apply(file);
    }
    // Rows written while 20261116000000 was live: a system pointer stored as
    // NOTE and a curator note. Only the pointer may be retyped.
    await insertInquiry();
    await database.admin.query(
      `INSERT INTO communication_history
        (inquiry_id, recorded_by, direction, communication_type, message)
      VALUES ($1, NULL, 'INTERNAL', 'NOTE', 'Pointer'),
             ($1, $2, 'INTERNAL', 'NOTE', 'Curator note')`,
      [INQUIRY_ID, CURATOR],
    );
    await apply(
      `${MIGRATIONS}/20261116120000_separate_system_pointer_notes/migration.sql`,
    );
    retyped = (
      await database.admin.query<{
        communication_type: string;
        recorded_by: string | null;
      }>(
        'SELECT communication_type, recorded_by FROM communication_history ORDER BY message DESC',
      )
    ).rows;
  });
  afterAll(async () => {
    await database?.close();
  });
  beforeEach(async () => {
    await database.admin.query(
      'TRUNCATE communication_history, inquiry CASCADE',
    );
    await insertInquiry();
  });

  function insertInquiry() {
    return database.admin.query(
      `INSERT INTO inquiry(id,full_name,email_address,inquiry_type,message)
      VALUES ($1,'Synthetic Visitor','visitor@example.invalid','GENERAL','Synthetic question')`,
      [INQUIRY_ID],
    );
  }

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
    ['INTERNAL', 'SYSTEM_NOTE'],
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
    // A curator note (POST .../notes) needs a curator again.
    ['INTERNAL', 'NOTE'],
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
    await insert('INTERNAL', 'NOTE', CURATOR);
    const { rows } = await database.admin.query(
      'SELECT count(*)::int AS count FROM communication_history',
    );
    expect(rows).toEqual([{ count: 3 }]);
  });

  it('retyped existing null-curator NOTE pointers and left curator notes alone', () => {
    expect(retyped).toEqual([
      { communication_type: 'SYSTEM_NOTE', recorded_by: null },
      { communication_type: 'NOTE', recorded_by: CURATOR },
    ]);
  });
});
