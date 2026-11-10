BEGIN;

CREATE TABLE public.storage_movement_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  storage_unit_id UUID NOT NULL
    REFERENCES public.storage_unit(id),

  from_storage_unit_id UUID
    REFERENCES public.storage_unit(id),

  to_storage_unit_id UUID
    REFERENCES public.storage_unit(id),

  moved_by UUID NOT NULL
    REFERENCES public.user_account(id),

  moved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  reason TEXT,

  CONSTRAINT storage_movement_different_parent
    CHECK (
      from_storage_unit_id IS DISTINCT FROM to_storage_unit_id
    )
);

CREATE INDEX idx_storage_movement_storage_unit
  ON public.storage_movement_history(storage_unit_id);

CREATE INDEX idx_storage_movement_moved_at
  ON public.storage_movement_history(moved_at);

ALTER TABLE public.storage_movement_history
  ENABLE ROW LEVEL SECURITY;

COMMIT;