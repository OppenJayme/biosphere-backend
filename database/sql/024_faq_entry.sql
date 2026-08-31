BEGIN;

CREATE TYPE public.faq_status AS ENUM (
  'ACTIVE',
  'INACTIVE',
  'ARCHIVED'
);

CREATE TABLE public.faq_entry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  question TEXT NOT NULL,

  answer TEXT NOT NULL,

  alternative_wording TEXT[] NOT NULL DEFAULT '{}',

  keywords TEXT[] NOT NULL DEFAULT '{}',

  category VARCHAR(100),

  status public.faq_status NOT NULL DEFAULT 'INACTIVE',

  created_by UUID NOT NULL
    REFERENCES public.user_account(id),

  updated_by UUID
    REFERENCES public.user_account(id),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_faq_entry_status
  ON public.faq_entry(status);

CREATE INDEX idx_faq_entry_category
  ON public.faq_entry(category);

ALTER TABLE public.faq_entry
  ENABLE ROW LEVEL SECURITY;

COMMIT;