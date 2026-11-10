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

-- change reference ID to exhibit not specimen id