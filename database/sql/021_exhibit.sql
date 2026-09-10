BEGIN;

CREATE TYPE public.qr_exhibit_status AS ENUM (
  'UNPUBLISHED',
  'PUBLISHED',
  'DISABLED'
);

CREATE TABLE public.exhibit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  specimen_id UUID NOT NULL
    REFERENCES public.specimen(id),

  created_by UUID NOT NULL
    REFERENCES public.user_account(id),

  public_slug VARCHAR(255) NOT NULL UNIQUE,

  interesting_facts TEXT,

  public_description TEXT,

  distribution VARCHAR(255),

  diet VARCHAR(255),

  layout_type TEXT,

  status public.qr_exhibit_status NOT NULL
    DEFAULT 'UNPUBLISHED',

  published_at TIMESTAMPTZ,

  archived_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_exhibit_specimen_id
  ON public.exhibit(specimen_id);

CREATE INDEX idx_exhibit_status
  ON public.exhibit(status);

ALTER TABLE public.exhibit
  ENABLE ROW LEVEL SECURITY;

COMMIT;