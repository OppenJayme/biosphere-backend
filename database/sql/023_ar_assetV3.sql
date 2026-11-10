BEGIN;

ALTER TABLE public.ar_asset
  RENAME COLUMN model_url TO storage_path;

COMMIT;