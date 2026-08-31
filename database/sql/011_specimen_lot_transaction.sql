BEGIN;

CREATE TYPE public.lot_transaction_type AS ENUM (
  'MOVEMENT',
  'CONDITION_CHANGE',
  'SPLIT',
  'MERGE',
  'QUANTITY_ADJUSTMENT'
);

CREATE TYPE public.quantity_adjustment_type AS ENUM (
  'ADDITION',
  'REMOVAL',
  'TRANSFER_OUT',
  'DEACCESSION',
  'MISSING_LOSS',
  'DESTRUCTION',
  'DATA_CORRECTION'
);

CREATE TABLE public.specimen_lot_transaction (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  source_lot_id UUID
    REFERENCES public.specimen_lot(id),

  target_lot_id UUID
    REFERENCES public.specimen_lot(id),

  transaction_type public.lot_transaction_type NOT NULL,

  quantity_affected INTEGER,

  adjustment_type public.quantity_adjustment_type,

  reason TEXT,

  performed_by UUID NOT NULL
    REFERENCES public.user_account(id),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT specimen_lot_transaction_quantity_positive
    CHECK (quantity_affected IS NULL OR quantity_affected > 0)
);

CREATE INDEX idx_lot_transaction_source_lot
  ON public.specimen_lot_transaction(source_lot_id);

CREATE INDEX idx_lot_transaction_target_lot
  ON public.specimen_lot_transaction(target_lot_id);

ALTER TABLE public.specimen_lot_transaction
  ENABLE ROW LEVEL SECURITY;

COMMIT;