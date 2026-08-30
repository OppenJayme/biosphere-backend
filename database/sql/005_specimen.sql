BEGIN;

CREATE TYPE public.specimen_status AS ENUM (
  'UNCATALOGED',
  'CATALOGED',
  'ARCHIVED'
);

CREATE TYPE public.specimen_gender AS ENUM (
  'MALE',
  'FEMALE',
  'UNKNOWN',
  'NOT_APPLICABLE'
);

CREATE TABLE public.specimen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  collection_id UUID
    REFERENCES public.collection(id),

  created_by UUID NOT NULL
    REFERENCES public.user_account(id),

  updated_by UUID
    REFERENCES public.user_account(id),

  archived_by UUID
    REFERENCES public.user_account(id),

  accession_number VARCHAR(100),

  specimen_category VARCHAR(100),

  scientific_name VARCHAR(255),

  common_name VARCHAR(255),

  gender public.specimen_gender,

  classification_status TEXT,

  status public.specimen_status NOT NULL
    DEFAULT 'UNCATALOGED',

  public_display_allowed BOOLEAN NOT NULL
    DEFAULT FALSE,

  remarks TEXT,

  created_at TIMESTAMPTZ NOT NULL
    DEFAULT NOW(),

  updated_at TIMESTAMPTZ NOT NULL
    DEFAULT NOW(),

  archived_at TIMESTAMPTZ,

  CONSTRAINT specimen_public_display_requires_cataloged
    CHECK (
      public_display_allowed = FALSE
      OR status = 'CATALOGED'
    )
);

CREATE INDEX idx_specimen_collection_id
  ON public.specimen(collection_id);

CREATE INDEX idx_specimen_status
  ON public.specimen(status);

ALTER TABLE public.specimen
  ENABLE ROW LEVEL SECURITY;

COMMIT;