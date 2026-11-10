BEGIN;

CREATE TYPE public.backup_status AS ENUM (
  'IN_PROGRESS',
  'COMPLETED',
  'FAILED'
);

CREATE TABLE public.backup_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  created_by UUID NOT NULL
    REFERENCES public.user_account(id),

  backup_type VARCHAR(100) NOT NULL,

  storage_path VARCHAR(255),

  status public.backup_status NOT NULL
    DEFAULT 'IN_PROGRESS',

  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_backup_history_created_by
  ON public.backup_history(created_by);

CREATE INDEX idx_backup_history_started_at
  ON public.backup_history(started_at);

ALTER TABLE public.backup_history
  ENABLE ROW LEVEL SECURITY;

COMMIT;

-- ALter1

BEGIN;

ALTER TABLE public.backup_history
  ALTER COLUMN created_by DROP NOT NULL;

COMMIT;