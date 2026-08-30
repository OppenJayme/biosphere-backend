BEGIN;

CREATE TYPE public.user_role AS ENUM (
  'CURATOR',
  'DEVELOPER'
);

CREATE TYPE public.account_status AS ENUM(
  'ACTIVE',
  'INACTIVE'
);

CREATE TABLE public.user_account(
  id UUID PRIMARY KEY default gen_random_uuid(),
  auth_user_id UUID NOT NULL UNIQUE 
    REFERENCES auth.users(id),
  full_name TEXT NOT NULL,
  role public.user_role NOT NULL,
  status public.account_status NOT NULL,
  avatar_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_account
    ENABLE ROW LEVEL SECURITY;

COMMIT;