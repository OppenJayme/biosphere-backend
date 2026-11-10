-- Curator-approved accession-number rule (REQ-4.4-04, BR-01):
--   * scope: every specimen record, including Archived ones, so a number is
--     never reused once assigned;
--   * comparison: surrounding whitespace ignored, case-insensitive;
--   * format: free text for now (no pattern enforced);
--   * NULL (and legacy blank) values stay allowed and never collide
--     (REQ-4.4-03).
--
-- Existing data is never modified here. If any records already collide the
-- migration aborts and lists them so a curator can resolve them by hand.
DO $$
DECLARE
    conflicts TEXT;
BEGIN
    SELECT string_agg(
               format('%L -> %s', grouped.accession_key, grouped.specimen_ids),
               E'\n'
               ORDER BY grouped.accession_key
           )
    INTO conflicts
    FROM (
        SELECT lower(btrim("accession_number")) AS accession_key,
               string_agg("id"::TEXT, ', ' ORDER BY "created_at", "id") AS specimen_ids
        FROM "specimen"
        WHERE "accession_number" IS NOT NULL
          AND btrim("accession_number") <> ''
        GROUP BY lower(btrim("accession_number"))
        HAVING count(*) > 1
    ) AS grouped;

    IF conflicts IS NOT NULL THEN
        RAISE EXCEPTION USING
            MESSAGE = 'Cannot enforce accession-number uniqueness: some specimen records share an accession number.',
            DETAIL = conflicts,
            HINT = 'Correct or clear the listed accession numbers (compared trimmed and case-insensitively, archived records included), then re-run the migration.';
    END IF;
END
$$;

-- Expression index: Prisma cannot model it in schema.prisma, so it lives only
-- in migrations. Do not drop it when reviewing a generated migration.
CREATE UNIQUE INDEX "uq_specimen_accession_number"
ON "specimen" (lower(btrim("accession_number")))
WHERE "accession_number" IS NOT NULL
  AND btrim("accession_number") <> '';
