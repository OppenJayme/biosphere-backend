BEGIN;

CREATE TABLE public.specimen_lot (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  specimen_id UUID NOT NULL
    REFERENCES public.specimen(id),

  storage_unit_id UUID NOT NULL
    REFERENCES public.storage_unit(id),

  condition_class TEXT NOT NULL,

  quantity INTEGER NOT NULL,

  storage_notes TEXT,

  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  created_by UUID NOT NULL
    REFERENCES public.user_account(id),

  updated_by UUID
    REFERENCES public.user_account(id),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT specimen_lot_quantity_positive
    CHECK (quantity > 0)
);

CREATE INDEX idx_specimen_lot_specimen_id
  ON public.specimen_lot(specimen_id);

CREATE INDEX idx_specimen_lot_storage_unit_id
  ON public.specimen_lot(storage_unit_id);

CREATE UNIQUE INDEX uq_active_specimen_lot
  ON public.specimen_lot (
    specimen_id,
    storage_unit_id,
    condition_class
  )
  WHERE is_active = TRUE;

ALTER TABLE public.specimen_lot
  ENABLE ROW LEVEL SECURITY;

COMMIT;