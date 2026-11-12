-- Imports visitor replies from the museum mailbox (SRS change approved
-- 2026-11-11; replaces the outbound-only rule in BR-22 / REQ-4.9-14).
-- Prepared only. Enable GMAIL_SYNC_ENABLED after deployment verification.
BEGIN;

-- Imported replies have no acting curator. Every other entry still must.
ALTER TABLE public.communication_history
  ALTER COLUMN recorded_by DROP NOT NULL;
ALTER TABLE public.communication_history
  ADD CONSTRAINT communication_recorded_by_unless_inbound
  CHECK (direction = 'INBOUND' OR recorded_by IS NOT NULL);

-- Outbound provider Message-ID or inbound reply Message-ID.
ALTER TABLE public.communication_history
  ADD COLUMN external_message_id VARCHAR(255);
CREATE UNIQUE INDEX communication_history_external_message_id_key
  ON public.communication_history (external_message_id);

CREATE TABLE public.gmail_sync_state (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  mailbox VARCHAR(255) NOT NULL,
  last_message_at TIMESTAMPTZ(6),
  last_checked_at TIMESTAMPTZ(6),
  last_success_at TIMESTAMPTZ(6),
  last_error VARCHAR(500),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT gmail_sync_state_pkey PRIMARY KEY (id)
);
CREATE UNIQUE INDEX gmail_sync_state_mailbox_key
  ON public.gmail_sync_state (mailbox);

ALTER TABLE public.gmail_sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gmail_sync_state FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.gmail_sync_state FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.gmail_sync_state FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.gmail_sync_state FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT SELECT, INSERT, UPDATE ON public.gmail_sync_state TO service_role;
  END IF;
END $$;
-- No client policies: only the server reads or writes sync progress. No
-- OAuth token is stored here; the refresh token stays in server env vars.
COMMIT;
