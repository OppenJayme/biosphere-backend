BEGIN;

ALTER TABLE public.storage_unit
  ADD COLUMN holds_specimens BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN capacity INTEGER,
  ADD CONSTRAINT storage_unit_capacity_positive
    CHECK (capacity IS NULL OR capacity > 0);

COMMIT;