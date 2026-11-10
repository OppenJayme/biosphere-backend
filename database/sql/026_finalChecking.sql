-- Inquiry

BEGIN;

ALTER TABLE public.inquiry
  ADD COLUMN consent_accepted_at TIMESTAMPTZ;

COMMIT;

-- AR asset
BEGIN;

DROP INDEX IF EXISTS public.idx_ar_asset_specimen_id;

ALTER TABLE public.ar_asset
  DROP COLUMN specimen_id;

ALTER TABLE public.ar_asset
  ADD COLUMN exhibit_id UUID NOT NULL
    REFERENCES public.exhibit(id);

CREATE INDEX idx_ar_asset_exhibit_id
  ON public.ar_asset(exhibit_id);

COMMIT;

-- Storage Unit

BEGIN;

ALTER TABLE public.storage_unit
  ADD COLUMN archived_at TIMESTAMPTZ;

COMMIT;
