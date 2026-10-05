-- Collection names compare case-insensitively after surrounding spaces are
-- trimmed. Preserve all existing records; collisions must be reviewed first.
DO $$
DECLARE conflicts TEXT;
BEGIN
    SELECT string_agg(format('%L -> %s', name_key, ids), E'\n' ORDER BY name_key)
    INTO conflicts
    FROM (
        SELECT lower(btrim(collection_name)) AS name_key,
               string_agg(id::TEXT, ', ' ORDER BY id) AS ids
        FROM public.collection
        GROUP BY lower(btrim(collection_name))
        HAVING count(*) > 1
    ) AS duplicates;
    IF conflicts IS NOT NULL THEN
        RAISE EXCEPTION USING
            MESSAGE = 'Cannot enforce collection-name uniqueness: duplicate names exist.',
            DETAIL = conflicts,
            HINT = 'Run npm run db:check-collection-collisions. Review references with the curator; do not delete or merge automatically.';
    END IF;
END
$$;

CREATE UNIQUE INDEX "uq_collection_name"
ON public.collection (lower(btrim(collection_name)));
