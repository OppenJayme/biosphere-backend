BEGIN;

CREATE TABLE public.preferred_visit_date (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  visit_id UUID NOT NULL
    REFERENCES public.visit_request(id),

  preferred_date DATE NOT NULL,

  preferred_start_time TIME NOT NULL,

  preferred_end_time TIME NOT NULL,

  preference_order SMALLINT NOT NULL,

  CONSTRAINT preferred_visit_time_valid
    CHECK (preferred_end_time > preferred_start_time),

  CONSTRAINT preferred_visit_order_positive
    CHECK (preference_order > 0),

  CONSTRAINT preferred_visit_order_unique
    UNIQUE (visit_id, preference_order)
);

CREATE INDEX idx_preferred_visit_date_visit_id
  ON public.preferred_visit_date(visit_id);

ALTER TABLE public.preferred_visit_date
  ENABLE ROW LEVEL SECURITY;

COMMIT;