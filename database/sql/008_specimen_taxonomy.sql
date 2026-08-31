BEGIN;

CREATE TABLE public.specimen_taxonomy (
  specimen_id UUID PRIMARY KEY
    REFERENCES public.specimen(id),

  kingdom VARCHAR(100),

  phylum VARCHAR(100),

  class VARCHAR(100),

  order_name VARCHAR(100),

  family VARCHAR(100),

  genus VARCHAR(100),

  species VARCHAR(100),

  habitat VARCHAR(250),

  ecological_role VARCHAR(100),

  conservation_status VARCHAR(100)
);

ALTER TABLE public.specimen_taxonomy
  ENABLE ROW LEVEL SECURITY;

COMMIT;
