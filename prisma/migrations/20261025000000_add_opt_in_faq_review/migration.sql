-- PREPARED ONLY. Do not enable collection before deployment/privacy/cleanup checks.
CREATE TABLE public.faq_review_item (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_hash CHAR(64) NOT NULL UNIQUE,
  question VARCHAR(500) NOT NULL,
  repeat_count INTEGER NOT NULL DEFAULT 1 CHECK (repeat_count > 0),
  status VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'REVIEWED', 'DISMISSED')),
  first_submitted_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_submitted_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ(6) NOT NULL,
  CHECK (length(btrim(question)) > 0),
  CHECK (expires_at > first_submitted_at)
);
CREATE INDEX faq_review_item_expires_at_idx ON public.faq_review_item(expires_at);
CREATE INDEX faq_review_item_status_last_submitted_at_idx ON public.faq_review_item(status, last_submitted_at);
CREATE TABLE public.faq_review_receipt (
  id UUID PRIMARY KEY,
  queue_id UUID NOT NULL REFERENCES public.faq_review_item(id) ON DELETE CASCADE,
  question_hash CHAR(64) NOT NULL
);
CREATE INDEX faq_review_receipt_queue_id_idx ON public.faq_review_receipt(queue_id);
ALTER TABLE public.faq_review_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faq_review_receipt ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.faq_review_item, public.faq_review_receipt FROM PUBLIC;
-- Supabase targets: browsers must never read or write these tables directly.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.faq_review_item, public.faq_review_receipt FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.faq_review_item, public.faq_review_receipt FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.faq_review_item, public.faq_review_receipt TO service_role;
  END IF;
END $$;
