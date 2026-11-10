BEGIN;

CREATE TABLE public.ar_asset (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  specimen_id UUID NOT NULL
    REFERENCES public.specimen(id),

  model_url VARCHAR(255) NOT NULL,

  model_format VARCHAR(255) NOT NULL,

  is_enabled BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_ar_asset_specimen_id
  ON public.ar_asset(specimen_id);

ALTER TABLE public.ar_asset
  ENABLE ROW LEVEL SECURITY;

COMMIT;