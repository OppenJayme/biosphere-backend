BEGIN;

CREATE TABLE public.specimen_tag (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  specimen_id UUID NOT NULL
    REFERENCES public.specimen(id),

  tag_id UUID NOT NULL
    REFERENCES public.tag(id),

  CONSTRAINT specimen_tag_unique
    UNIQUE (specimen_id, tag_id)
);

CREATE INDEX idx_specimen_tag_specimen_id
  ON public.specimen_tag(specimen_id);

CREATE INDEX idx_specimen_tag_tag_id
  ON public.specimen_tag(tag_id);

ALTER TABLE public.specimen_tag
  ENABLE ROW LEVEL SECURITY;

COMMIT;

-- The UNIQUE (specimen_id, tag_id) prevents the same tag from accidentally being attached to the same specimen twice.