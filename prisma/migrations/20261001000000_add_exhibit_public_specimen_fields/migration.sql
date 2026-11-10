-- Curator-controlled public specimen fields per QR exhibit (REQ-4.12-03).
-- Holds keys from the backend allowlist (src/exhibit/exhibit-public-fields.ts)
-- only; exhibit content and images stay in their own columns and tables.
-- The default is the full set the public page showed before this change, so
-- existing exhibits are backfilled with it and their pages look the same until
-- a curator edits the selection. NOT NULL so a missing selection can never be
-- stored; the backend also treats one as "show nothing" (fail closed).
ALTER TABLE "exhibit" ADD COLUMN     "public_specimen_fields" TEXT[] NOT NULL DEFAULT ARRAY['commonName', 'scientificName', 'collection', 'kingdom', 'phylum', 'class', 'order', 'family', 'genus', 'species', 'habitat', 'ecologicalRole', 'conservationStatus']::TEXT[];
