BEGIN;

CREATE TABLE public.visit_request_vehicle (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  visit_id UUID NOT NULL
    REFERENCES public.visit_request(id),

  driver_visitor_id UUID
    REFERENCES public.visit_request_visitor(id),

  plate_number VARCHAR(20),

  vehicle_brand VARCHAR(100),

  vehicle_type VARCHAR(100)
);

CREATE INDEX idx_visit_request_vehicle_visit_id
  ON public.visit_request_vehicle(visit_id);

CREATE INDEX idx_visit_request_vehicle_driver_visitor_id
  ON public.visit_request_vehicle(driver_visitor_id);

ALTER TABLE public.visit_request_vehicle
  ENABLE ROW LEVEL SECURITY;

COMMIT;