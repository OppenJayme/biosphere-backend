-- Devices where a curator turned on push alerts (spec 0004). Pushes carry no
-- payload, so only the push service endpoint is stored: no encryption keys,
-- visitor data or message content. Access mirrors user_notification_state:
-- forced RLS, no client roles, backend role only.
BEGIN;
CREATE TABLE public.push_subscription (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_account_id UUID NOT NULL REFERENCES public.user_account(id) ON DELETE CASCADE,
  endpoint VARCHAR(1000) NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_success_at TIMESTAMPTZ(6),
  failure_count INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT push_subscription_endpoint_key UNIQUE (endpoint),
  CONSTRAINT push_subscription_endpoint_https CHECK (endpoint LIKE 'https://%'),
  CONSTRAINT push_subscription_failure_count CHECK (failure_count >= 0)
);
CREATE INDEX idx_push_subscription_user_account_id
  ON public.push_subscription(user_account_id);
ALTER TABLE public.push_subscription ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscription FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_subscription FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.push_subscription FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.push_subscription FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscription TO service_role;
  END IF;
END $$;
-- No client policies: authenticated HTTP enforces curator identity/ownership.
COMMIT;
