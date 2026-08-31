BEGIN;

CREATE TYPE public.audit_result AS ENUM (
  'SUCCESS',
  'FAILED',
  'DENIED'
);

CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID
    REFERENCES public.user_account(id),

  affected_record_id UUID,

  affected_record_type VARCHAR(100),

  action VARCHAR(100) NOT NULL,

  module VARCHAR(100) NOT NULL,

  details JSONB,

  status public.audit_result NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_log_user_id
  ON public.audit_log(user_id);

CREATE INDEX idx_audit_log_created_at
  ON public.audit_log(created_at);

CREATE INDEX idx_audit_log_affected_record
  ON public.audit_log(affected_record_type, affected_record_id);

ALTER TABLE public.audit_log
  ENABLE ROW LEVEL SECURITY;

COMMIT;