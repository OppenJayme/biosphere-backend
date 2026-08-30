BEGIN;

CREATE TABLE public.storage_unit(
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID 
    REFERENCES public.storage_unit(id),
    unit_type TEXT NOT NULL, -- might be changed 
    label TEXT NOT NULL,
  size TEXT,
  storage_type TEXT NOT NULL, -- might be changed
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT storage_unit_not_own_parent -- Prevent a storage unit from being its own parent.
    CHECK (parent_id IS NULL OR parent_id <> id)
);

CREATE INDEX idx_storage_unit_parent_id -- will help later when BioSphere repeatedly ask things like "Show me everything inside Cabinet A."  Since the storage hierarchy depends heavily on parent_id, indexing that FK is sensible.
  ON public.storage_unit(parent_id);

ALTER TABLE public.storage_unit
  ENABLE ROW LEVEL SECURITY;

COMMIT;