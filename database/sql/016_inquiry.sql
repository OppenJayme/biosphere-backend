BEGIN;

CREATE TYPE public.general_inquiry_status AS ENUM (
  'PENDING',
  'REVIEWED',
  'TURNED_TO_VISIT_REQUEST',
  'CLOSED'
);

CREATE TABLE public.inquiry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  reviewed_by UUID
    REFERENCES public.user_account(id),

  full_name VARCHAR(100) NOT NULL,

  email_address VARCHAR(100) NOT NULL,

  contact_number VARCHAR(20),

  organization_name VARCHAR(100),

  inquiry_type VARCHAR(100) NOT NULL,

  message TEXT NOT NULL,

  attachment_path TEXT,

  status public.general_inquiry_status NOT NULL
    DEFAULT 'PENDING',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_inquiry_status
  ON public.inquiry(status);

CREATE INDEX idx_inquiry_reviewed_by
  ON public.inquiry(reviewed_by);

ALTER TABLE public.inquiry
  ENABLE ROW LEVEL SECURITY;

COMMIT;

--Keep inquiry_type as text for now because we never froze inquiry types as an enum.

-- Alter 1

BEGIN;

ALTER TABLE public.inquiry
  ADD COLUMN consent_accepted_at TIMESTAMPTZ;

COMMIT;