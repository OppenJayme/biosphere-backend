BEGIN;

CREATE TABLE public.visit_request_visitor (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  visit_id UUID NOT NULL
    REFERENCES public.visit_request(id),

  visitor_name VARCHAR(100) NOT NULL,

  visitor_type VARCHAR(100)
);

CREATE INDEX idx_visit_request_visitor_visit_id
  ON public.visit_request_visitor(visit_id);

ALTER TABLE public.visit_request_visitor
  ENABLE ROW LEVEL SECURITY;

COMMIT;