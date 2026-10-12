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

## Acceptance observations and ownership handoff - 2026-10-09

**Status:** Open follow-up; no implementation authorized by this documentation.

The tester reports matching-name warnings are visible during the Cataloging
workflow and multiple records can still be saved. The warning is not visible
when reopening the same specimen normally, and the dashboard does not show a
possible-duplicate indication. Exact running commits were not captured.
These observations do not verify provenance distinctions, unavailable-check
fallbacks, or the complete CAT-014 acceptance test.

### CAT-ENH-001 - Discoverable possible-duplicate review

**Owner:** Kyer Jayme / Cataloging Management.
**Classification:** Requested usability enhancement, not proof that matching
or persistence is broken.

Provide a discoverable way to recheck a saved specimen without editing it.
Reuse `GET /specimens/:id/possible-duplicates` and existing result components
where appropriate. A Cataloging review page/filter is a proposed extension,
not an existing capability or a frozen design.

Acceptance checks:

- A curator can find the check again after leaving and reopening the record.
- Results show matching reasons and links to the correct existing records.
- Empty results and an unavailable check are clearly different states.
- Rechecking does not save, merge, archive, or delete records.
- A catalog-wide view/filter must use a defined backend-wide result source,
  bounded pagination and freshness rules, not only matches on the current page.
- Preserve curator authorization and do not add inventory or storage management.

### DASH-GAP-001 - Dashboard duplicate indication

**Owners for coordination:** John Gerozaga and Charles Boquecosa / Curator
Dashboard, with Kyer Jayme supplying the Cataloging duplicate contract.
**Classification:** Dashboard coverage gap requiring owner/SRS review.

Ask the dashboard owners to confirm the SRS requirement and coordinate an API
contract before adding a card/count. The current per-specimen endpoint does
not provide a catalog-wide count or persistent duplicate flag.

Acceptance checks:

- Define whether the count means affected specimens, unique pairs, or groups;
  prevent double counting and label the metric accurately.
- Agree on archived-record inclusion, refresh/invalidation behavior and the
  handling of failed scans before implementation.
- Unknown/unavailable results must not appear as a verified zero count.
- Use the same approved matching rules as Cataloging, with protected access.
- Link the indicator to an agreed review destination; do not auto-merge or
  reimplement matching logic independently in the dashboard.

The acceptance plan asks for archived matches, while the currently documented
matcher excludes archived specimens. Treat that discrepancy as an outstanding
rule/coverage check, not as a passed test or permission to change the policy.

## CAT-014 verification evidence - 2026-10-12

### Tester-reported manual checks

The tester confirmed different collectors/donors suppress the warning for the
tested pair, while matching collectors/donors restore it. Self-exclusion,
case-insensitive names, differing collection dates/locations, correct record
links and Back navigation, and an unrelated record without stale warnings were
also reported working. With blank collector/donor fields and differing date
and location, the screenshot showed Medium confidence with only the two names
counted as matches; differing collection location was subsequently confirmed.
These are manual reports, not independently replayed browser tests; the exact
running commits and full record evidence were not captured.

### Automated failure/retry verification

Executed against backend `fd777d2` and frontend `3e3b4f8`:

- Backend `npm test -- --runInBand specimen-duplicates.service.spec.ts`:
  23/23 passed.
- Backend `npm run test:e2e -- --runInBand specimens.e2e-spec.ts`:
  34/34 passed.
- Frontend `npm test -- src/components/specimens/duplicate-recheck.test.ts
  src/features/specimens/duplicate-api.test.ts
  src/features/specimens/duplicates.test.ts`: 15/15 passed across three files.

The backend HTTP test injects a failed duplicate lookup after creation, checks
HTTP 201 and the saved record ID with `duplicateCheckAvailable: false`, asserts
one create and one audit write, then verifies a successful GET recheck. The
frontend tests distinguish unavailable from clear, offer retry, refresh the
current route, and issue a fresh uncached lookup after failure.

These suites mock Prisma/Supabase or frontend API/router dependencies. They do
not simulate a real Supabase outage or run a browser against the live database.
No live data was changed and no running servers were stopped. Remaining items
include browser pending/error/retry behavior, archived-record policy alignment,
and the review/dashboard follow-ups above. CAT-014 is partially verified, not
fully accepted.
