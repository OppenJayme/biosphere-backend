-- Lets curators mark the operational alerts (REQ-4.3-05, REQ-4.3-10) read or
-- dismissed (REQ-4.3-07). Only the accepted key prefixes change; existing
-- rows already satisfy the wider rule. No table, column or RLS change.
BEGIN;
ALTER TABLE public.user_notification_state
  DROP CONSTRAINT notification_state_key;
ALTER TABLE public.user_notification_state
  ADD CONSTRAINT notification_state_key CHECK (
    notification_id ~ '^(NEW_INQUIRY|NEW_VISIT_REQUEST|SUBMISSION_EMAIL_FAILED|SYNC_FAILED|BACKUP_FAILED|REPORT_FAILED):[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$'
  );
COMMIT;
