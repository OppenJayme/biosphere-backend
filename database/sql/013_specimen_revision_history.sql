BEGIN;

CREATE TABLE public.specimen_revision_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  specimen_id UUID NOT NULL
    REFERENCES public.specimen(id),

  changed_by UUID NOT NULL
    REFERENCES public.user_account(id),

  field_changed VARCHAR(100) NOT NULL,

  old_value TEXT,

  new_value TEXT,

  reason TEXT,

  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  source_section TEXT NOT NULL
);

CREATE INDEX idx_specimen_revision_specimen_id
  ON public.specimen_revision_history(specimen_id);

CREATE INDEX idx_specimen_revision_changed_at
  ON public.specimen_revision_history(changed_at);

ALTER TABLE public.specimen_revision_history
  ENABLE ROW LEVEL SECURITY;

COMMIT;