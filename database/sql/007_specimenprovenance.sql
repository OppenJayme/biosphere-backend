BEGIN;

CREATE TABLE public.specimen_provenance (
  specimen_id UUID PRIMARY KEY
    REFERENCES public.specimen(id),

  collector VARCHAR(255),

  donor VARCHAR(255),

  collection_date DATE,

  collection_location VARCHAR(255),

  preservation_type VARCHAR(255),

  preservation_method VARCHAR(255),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.specimen_provenance
  ENABLE ROW LEVEL SECURITY;

COMMIT;