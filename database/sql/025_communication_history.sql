BEGIN;

CREATE TABLE public.communication_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  inquiry_id UUID
    REFERENCES public.inquiry(id),

  visit_request_id UUID
    REFERENCES public.visit_request(id),

  recorded_by UUID NOT NULL
    REFERENCES public.user_account(id),

  direction VARCHAR(50) NOT NULL,

  communication_type VARCHAR(100) NOT NULL,

  recipient_email VARCHAR(100),

  subject VARCHAR(255),

  message TEXT NOT NULL,

  delivery_result VARCHAR(100),

  sent_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT communication_has_one_parent
    CHECK (
      (inquiry_id IS NOT NULL AND visit_request_id IS NULL)
      OR
      (inquiry_id IS NULL AND visit_request_id IS NOT NULL)
    )
);

CREATE INDEX idx_communication_inquiry_id
  ON public.communication_history(inquiry_id);

CREATE INDEX idx_communication_visit_request_id
  ON public.communication_history(visit_request_id);

ALTER TABLE public.communication_history
  ENABLE ROW LEVEL SECURITY;

COMMIT;