-- Prepared only. Enable NOTIFICATION_STATE_ENABLED after deployment verification.
BEGIN;
CREATE TABLE public.user_notification_state (
  user_account_id UUID NOT NULL REFERENCES public.user_account(id) ON DELETE CASCADE,
  notification_id VARCHAR(180) NOT NULL,
  read_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  dismissed_at TIMESTAMPTZ(6),
  PRIMARY KEY (user_account_id, notification_id),
  CONSTRAINT notification_state_key CHECK (
    notification_id ~ '^(NEW_INQUIRY|NEW_VISIT_REQUEST|SUBMISSION_EMAIL_FAILED):[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$'
  ),
  CONSTRAINT notification_state_times CHECK (dismissed_at IS NULL OR dismissed_at >= read_at)
);
ALTER TABLE public.user_notification_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_notification_state FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_notification_state FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.user_notification_state FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.user_notification_state FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT SELECT, INSERT, UPDATE ON public.user_notification_state TO service_role;
  END IF;
END $$;
-- No client policies: authenticated HTTP enforces curator identity/ownership.
-- Service-role access is server-only; no submission/audit record is updated.
COMMIT;
