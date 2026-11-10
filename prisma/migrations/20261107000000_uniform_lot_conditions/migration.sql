-- Active lots are unique per specimen, storage unit and condition, with the
-- condition compared without regard to letter case ("Good" and "good" are
-- the same lot). Replaces the exact-case index from 0_init. Existing records
-- are preserved; clashes must be reviewed first, never merged automatically.
DO $$
DECLARE conflicts TEXT;
BEGIN
    SELECT string_agg(format('%s / %s / %L -> %s', specimen_id, storage_unit_id, condition_key, ids), E'\n' ORDER BY specimen_id, storage_unit_id, condition_key)
    INTO conflicts
    FROM (
        SELECT specimen_id,
               storage_unit_id,
               lower(condition_class) AS condition_key,
               string_agg(id::TEXT, ', ' ORDER BY id) AS ids
        FROM public.specimen_lot
        WHERE is_active = true
        GROUP BY specimen_id, storage_unit_id, lower(condition_class)
        HAVING count(*) > 1
    ) AS duplicates;
    IF conflicts IS NOT NULL THEN
        RAISE EXCEPTION USING
            MESSAGE = 'Cannot make lot conditions case-insensitive: active lots differ only by case.',
            DETAIL = conflicts,
            HINT = 'Merge or correct those lots through the app with a curator first; do not merge them in SQL.';
    END IF;
END
$$;

DROP INDEX IF EXISTS public."uq_active_specimen_lot";

CREATE UNIQUE INDEX "uq_active_specimen_lot"
ON public.specimen_lot (specimen_id, storage_unit_id, lower(condition_class))
WHERE (is_active = true);
