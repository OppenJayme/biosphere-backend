# Specimen Duplicate Detection Guide

Implements REQ-4.4-21 and REQ-4.4-22. REQ-4.4-23 / BR-09 is **partially**
covered: only the collector and donor distinctions are applied. Physical
grouping, storage assignment, and other curator-approved distinctions are
deferred (see [Not covered yet](#not-covered-yet)).

Duplicate detection is **warning-only**. It never blocks a save, merges
records, or deletes or archives anything. The curator reviews the warning
and decides what to do (edit, archive, or keep both records).

## Endpoints

All routes are curator-only (unauthenticated → 401, Developer → 403).

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/specimens/duplicate-check` | Check unsaved values before saving. Nothing is written or audited. |
| `POST` | `/specimens` | Creates the record as before and adds `possibleDuplicates` and `duplicateCheckAvailable` to the response. |
| `GET` | `/specimens/:id/possible-duplicates` | Re-check a saved record, including its provenance, against all other records. |
| `POST` | `/specimens/import/preview` | Each row now carries `possibleDuplicates` alongside `duplicateWarnings`. |

`POST /specimens/duplicate-check` accepts `accessionNumber`, `scientificName`,
`commonName`, and the provenance fields `collector`, `donor`,
`collectionLocation`, and `collectionDate`, all optional, so a multi-section
entry form can check before any section is saved. Pass `excludeSpecimenId`
when checking an edit, so the record is not reported as a duplicate of itself.
It is a `POST` so specimen details stay out of URLs and access logs.

Each `PossibleDuplicate` contains the existing record's `specimenId`,
`accessionNumber`, names, and `status`, plus `confidence`, `matchedFields`,
`differingFields`, and a ready-to-display `message`. Results are sorted with
`HIGH` first and capped at 20 per checked record.

### Create never fails because of the duplicate check

`POST /specimens` runs the duplicate lookup only after the record has been
committed. If that lookup fails, the error is logged and the response is
still `201` with the created record, `possibleDuplicates: []`, and
`duplicateCheckAvailable: false`. A failed warning lookup therefore never
turns a successful write into an ambiguous error that a client might retry
(creating a second record). When `duplicateCheckAvailable` is `false`, clients
should **not** resubmit. They should re-check with
`GET /specimens/:id/possible-duplicates`.

## Matching rules

Only active (non-archived) specimens are compared. Values are trimmed and
compared case-insensitively. This is exactly the database lookup (trimmed
value, case-insensitive equality), so the in-memory comparison never claims
a match the lookup could not fetch. Inner whitespace is **not** collapsed, so
`Passer  domesticus` and `Passer domesticus` are different values. A field
only counts as matching or differing when **both** records have a value.

1. **Same accession number → `HIGH`**, whatever else differs. Differing
   fields are listed in `differingFields` for context.
2. Otherwise the records must name the **same species**: equal scientific
   names, or equal common names when either record has no scientific name.
3. **Separate records per BR-09.** If the collector or donor is filled on
   both records and differs, the records are allowed to coexist and nothing
   is reported. These are the only distinctions applied automatically,
   because they are the ones BR-09 names that the schema can compare.
4. Otherwise:
   - a matching collector, donor, collection location, or collection date →
     `HIGH`;
   - none of those matching, but both scientific **and** common names match →
     `MEDIUM` (the rule bulk import has always used);
   - otherwise → nothing is reported.

A differing collection location or collection date never suppresses a
warning. It only appears in `differingFields` so the curator can judge.
Gender is not compared at all. Neither is an approved distinction, so
suppressing warnings on them would be an unapproved business rule.

`POST /specimens` can only compare core fields, because provenance is saved
through its own nested resource afterwards. Clients should call
`GET /specimens/:id/possible-duplicates` after provenance is saved to get the
provenance-aware result.

## Not covered yet

- **Deferred BR-09 distinctions.** Physical grouping, storage assignment,
  and any other curator-approved distinction are not applied. Storage lives
  on specimen lots, so a lot-aware comparison is a separate change. Adding a
  distinction (including location, date, or gender) needs curator approval
  first.
- No stored "possible duplicate" flag or dashboard count. The SRS dashboard
  "Duplicates" card would need either a background scan or a persisted flag.
- Taxonomy (genus/species) is not compared.
- Spelling and whitespace variants are not matched. Name lookups use exact,
  trimmed, case-insensitive equality in the database.
