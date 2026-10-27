import type { Client } from 'pg';

/** Only for an owned disposable DB: reproduce the guard's asynchronous audit timing. */
export async function withDelayedDenialAudit<T>(
  admin: Client,
  operation: () => Promise<T>,
): Promise<T> {
  await admin.query(`
    CREATE FUNCTION fixture_delay_denial_audit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.action = 'ACCESS_DENIED' THEN
        PERFORM pg_sleep(0.3);
      END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER fixture_delay_denial_audit BEFORE INSERT ON audit_log
    FOR EACH ROW EXECUTE FUNCTION fixture_delay_denial_audit();
  `);
  try {
    return await operation();
  } finally {
    await admin.query(`
      DROP TRIGGER fixture_delay_denial_audit ON audit_log;
      DROP FUNCTION fixture_delay_denial_audit();
    `);
  }
}
