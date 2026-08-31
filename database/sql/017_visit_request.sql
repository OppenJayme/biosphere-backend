BEGIN;

CREATE TYPE public.visit_request_status AS ENUM (
  'PENDING',
  'APPROVED_BY_CURATOR',
  'SUBMITTED_FOR_CAMPUS_ENTRY',
  'DECLINED',
  'CANCELLED',
  'COMPLETED'
);

CREATE TABLE public.visit_request (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  reviewed_by UUID
    REFERENCES public.user_account(id),

  source_inquiry_id UUID UNIQUE
    REFERENCES public.inquiry(id),

  contact_person VARCHAR(100) NOT NULL,

  email_address VARCHAR(100) NOT NULL,

  contact_number VARCHAR(20) NOT NULL,

  organization_name VARCHAR(255) NOT NULL,

  address TEXT,

  purpose_of_visit TEXT,

  visitor_count INTEGER NOT NULL,

  miscellaneous_details TEXT,

  additional_notes TEXT,

  consent_accepted_at TIMESTAMPTZ NOT NULL,

  status public.visit_request_status NOT NULL
    DEFAULT 'PENDING',

  approved_date DATE,

  approved_start_time TIME,

  approved_end_time TIME,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT visit_request_visitor_count_positive
    CHECK (visitor_count > 0)
);
a
CREATE INDEX idx_visit_request_status
  ON public.visit_request(status);

CREATE INDEX idx_visit_request_reviewed_by
  ON public.visit_request(reviewed_by);

ALTER TABLE public.visit_request
  ENABLE ROW LEVEL SECURITY;

COMMIT;

/*
I intentionally left out the ERD's visitor_list TEXT because the same ERD already has a separate 
VisitRequestVisitor child table, which is the cleaner design and matches the SRS data model.
*/