# Specimen Duplicate Detection Guide

Covers REQ-4.4-21, REQ-4.4-22, REQ-4.4-23, and BR-09.

Duplicate detection is **warning-only**. It never blocks a save, merges
records, or deletes or archives anything. The curator reviews the warning
and decides what to do (edit, archive, or keep both records).

## Endpoints

All routes are curator-only.

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/specimens/duplicate-check` | Check unsaved values before saving. Nothing is written or audited. |
| `POST` | `/specimens` | Creates the record as before and adds `possibleDuplicates` to the response. |
| `GET` | `/specimens/:id/possible-duplicates` | Re-check a saved record, including its provenance, against all other records. |
| `POST` | `/specimens/import/preview` | Each row now carries `possibleDuplicates` alongside `duplicateWarnings`. |

`POST /specimens/duplicate-check` accepts the core fields (`accessionNumber`,
`scientificName`, `commonName`, `gender`) plus the provenance fields
(`collector`, `donor`, `collectionLocation`, `collectionDate`), all optional,
so a multi-section entry form can check before any section is saved. Pass
`excludeSpecimenId` when checking an edit, so the record is not reported as a
duplicate of itself. It is a `POST` so specimen details stay out of URLs and
access logs.

Each `PossibleDuplicate` contains the existing record's `specimenId`,
`accessionNumber`, names, and `status`, plus `confidence`, `matchedFields`,
`differingFields`, and a ready-to-display `message`. Results are sorted with
`HIGH` first and capped at 20 per checked record.

## Matching rules

Only active (non-archived) specimens are compared. Values are compared
case-insensitively after trimming and collapsing whitespace. A field only
counts as matching or differing when **both** records have a value.

1. **Same accession number → `HIGH`**, whatever else differs. Any differing
   distinguishing fields are listed in `differingFields` for context.
2. Otherwise the records must name the **same species**: equal scientific
   names, or equal common names when either record has no scientific name.
3. **Same species alone is not a duplicate (BR-09).** If any distinguishing
   field (collector, donor, collection location, collection date, or
   gender, where only `MALE`/`FEMALE` count) is filled on both records and
   differs, they are treated as separate records and nothing is reported.
4. With no difference:
   - matching provenance (collector, donor, location, or date) → `HIGH`;
   - no provenance to compare, but both scientific **and** common names match
     → `MEDIUM` (this is the rule bulk import has always used);
   - otherwise → nothing is reported.

`POST /specimens` can only compare core fields, because provenance is saved
through its own nested resource afterwards. Clients should call
`GET /specimens/:id/possible-duplicates` after provenance is saved to get the
provenance-aware result.

## Not covered yet

- No stored "possible duplicate" flag or dashboard count. The SRS dashboard
  "Duplicates" card would need either a background scan or a persisted flag.
  Both are follow-up work.
- Taxonomy (genus/species) and storage assignment are not compared yet.
  Storage lives on specimen lots, so a lot-aware comparison is a separate
  change.
- Name lookups use exact, case-insensitive equality in the database, so
  spelling variants (for example "Passer domesticus" vs "Passer domesticus
  L.") are not matched.
