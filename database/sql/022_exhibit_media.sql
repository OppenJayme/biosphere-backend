BEGIN;

CREATE TABLE public.exhibit_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  exhibit_id UUID NOT NULL
    REFERENCES public.exhibit(id),

  storage_path TEXT NOT NULL,

  display_order INTEGER NOT NULL DEFAULT 0,

  caption VARCHAR(255),

  is_cover BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_exhibit_media_exhibit_id
  ON public.exhibit_media(exhibit_id);

ALTER TABLE public.exhibit_media
  ENABLE ROW LEVEL SECURITY;

COMMIT;