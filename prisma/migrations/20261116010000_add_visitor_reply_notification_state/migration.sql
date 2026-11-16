-- Lets curators mark visitor-reply alerts read or dismissed (REQ-4.3-07).
-- VISITOR_REPLY:<entry id> keys were added to the feed and the API validation
-- (team decision 2026-11-14) but not to this constraint, so every read,
-- dismiss and "Clear all" of a reply alert failed with a check violation and
-- the alerts could not be cleared. Only the accepted key prefixes change;
-- existing rows already satisfy the wider rule. No table, column or RLS change.
BEGIN;
ALTER TABLE public.user_notification_state
  DROP CONSTRAINT notification_state_key;
ALTER TABLE public.user_notification_state
  ADD CONSTRAINT notification_state_key CHECK (
    notification_id ~ '^(NEW_INQUIRY|NEW_VISIT_REQUEST|SUBMISSION_EMAIL_FAILED|VISITOR_REPLY|SYNC_FAILED|BACKUP_FAILED|REPORT_FAILED|SPECIMEN_ARCHIVED|SPECIMEN_RESTORED|LOT_MOVED|LOT_DEACCESSIONED|LOT_MISSING_LOSS|RECORD_INCOMPLETE):[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$'
  );
COMMIT;
