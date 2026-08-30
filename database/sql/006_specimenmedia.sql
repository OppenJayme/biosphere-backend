BEGIN;

CREATE TABLE public.specimen_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  specimen_id UUID NOT NULL
    REFERENCES public.specimen(id),

  storage_path VARCHAR(255) NOT NULL,

  display_order INTEGER NOT NULL DEFAULT 0,

  caption VARCHAR(255),

  is_cover BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_specimen_media_specimen_id
  ON public.specimen_media(specimen_id);

ALTER TABLE public.specimen_media
  ENABLE ROW LEVEL SECURITY;

COMMIT;