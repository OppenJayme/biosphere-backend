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

/*
A couple of intentional choices:

- user_id is nullable because some events like failed/denied authentication may occur before a valid BioSphere user is resolved.
- affected_record_id has no FK because it can refer to different tables depending on affected_record_type.
- details is JSONB because audit events may need different supporting metadata.
- Audit records should later be append-only; normal users should not edit/delete them.
*/
