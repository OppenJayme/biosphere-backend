# Specimen Duplicate Detection Guide

Implements REQ-4.4-21 and REQ-4.4-22. REQ-4.4-23 / BR-09 is **partially**
covered: only the collector and donor distinctions are applied. Physical
grouping, storage assignment, and other curator-approved distinctions are
deferred (see [Not covered yet](#not-covered-yet)).

Duplicate detection is **warning-only**. It never blocks a save, merges
records, or deletes or archives anything. The curator reviews the warning
and decides what to do (edit, archive, or keep both records).

## Archived-match decision - 2026-11-04

Kyer chose to keep active-only duplicate matching and document that decision.
The lookup now requires both a non-`ARCHIVED` status and `archived_at IS NULL`,
matching Cataloging's treatment of either indicator as archived. The earlier
status-only filter and timestamp-only gap were reproduced and repaired under
DEF-031 below; no existing specimen status or timestamp is rewritten.
REQ-4.4-21 (SRS PDF page 61, printed page 55) requires a warning for a manually
entered/imported record that may duplicate an existing record, without an
explicit archive exclusion. REQ-4.4-22 forbids automatic merge/delete; REQ-4.4-23
covers distinct physical groups and other approved distinctions.

**Curator disposition - 2026-11-05:** John reported that Sir Fidel, the
museum's authorized representative, approved Kyer's active-only scope for
REQ-4.4-21: duplicate warnings compare against active specimens only, and
archived records are excluded. This clears the scope blocker on CAT-014; it
does not by itself accept CAT-014, whose live-result, stale-response and
independent-acceptance limits remain. No matcher change is needed.
The dashboard enhancement below still needs its owners' separate scope decision.

## Archive-indicator consistency repair - 2026-11-04

MarQtie's OBS-006 review finding is reproduced as
[DEF-031](./TEST_DEFECT_LOG.md#def-031---timestamp-only-archived-records-appear-as-duplicate-candidates).
The public duplicate service was called against a fresh owned PostgreSQL
database through real Prisma 7.10.1. Five otherwise matching synthetic records
covered active Uncataloged, active Cataloged, status-only archived,
timestamp-only archived and both archive indicators. Before the change the
timestamp-only row incorrectly appeared beside the two active matches. Adding
`archived_at: null` to the existing non-ARCHIVED query makes that regression
pass while preserving both active controls. No threshold, scoring, public
response or archive state changes.

Run `npm run test:duplicates:db` with the existing pinned local Docker image.
The opt-in helper creates and removes only its owned loopback/tmpfs database,
accepts no supplied database URL, and seeds no shared records. This service/SQL
test is outside default CI discovery and does not prove browser behavior,
live inconsistent data, concurrency or independent acceptance. The existing
23 duplicate unit tests also pass; their query-shape expectation is aligned
with the added filter rather than counted as independent SQL proof.
Supporting checks passed: 41 import unit tests, 72 specimen HTTP tests,
changed-TypeScript lint, backend build and documentation whitespace checks.
The import suite intentionally logs its simulated connection-reset failure;
that expected negative-case log is not a failed test or live outage. Dependencies
and the generated client used the existing 7.10.1 installation in an owned
verification checkout; no production server was rebuilt or restarted.

## Duplicate-warning edit invalidation - 2026-10-27

[DEF-026](./TEST_DEFECT_LOG.md#def-026---duplicate-result-remains-valid-after-typing-new-values)
was reproduced in the real mounted client component: an old response could
appear after typing a new value without leaving the input. The local frontend
repair immediately invalidates prior evidence on edits to accession number,
scientific name and common name. Lookup still starts on focus-out and remains
warning-only. Unrelated remarks edits preserve existing evidence.
Repair source `c55692e` is published for review in
[frontend PR #85](https://github.com/OppenJayme/biosphere-frontend/pull/85);
it is now merged at `b65c9dd` with successful PR CI. The frontend-only production
build and [blocked-request retest](./TEST_DEFECT_LOG.md#merged-production-ui-checkpoint---2026-10-27)
pass on build `-7vcfapNQNgHNQsAN6WHj`; all three synthetic POSTs were aborted
locally and no form was submitted. Independent acceptance and successful real
action/backend-result coverage remain separate.

From the frontend root, `npm run test:duplicates:browser` runs six synthetic
headless Edge scenarios for pending edits, response ordering, all three fields'
edit/failure/retry/clear flows and unrelated edits. Actual React/DOM and client
code run with only the remote Server Action replaced; network requests are
blocked and no app server, credentials or database is used. The first pending-edit
assertion was observed failing before the repair, then all six scenarios pass.
These are local component results, not release-build/backend/provider evidence
or independent acceptance. See the frontend browser-tooling README for setup.

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

The lookup excludes `status = ARCHIVED` or a non-null `archived_at`.
See the November 4 scope/disposition note above. Values are trimmed and
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

The original acceptance wording mentioned archived matches. The November 4
user decision above keeps the current active-only matcher; use the revised
CAT-014 row for acceptance and preserve the older evidence as dated history.

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
No live data was changed and no running servers were stopped. At this dated
checkpoint browser recovery, archived-policy alignment and review/dashboard
follow-ups remained. Later sections record recovery evidence and November 4
user direction; the active-only scope was later approved by Sir Fidel (reported by John on 2026-11-05).
CAT-014 is not fully accepted.

## CAT-014 duplicate-review batch - 2026-10-23

Existing isolated regressions passed on backend `d04ede2` and frontend `d4d216b`:
23 duplicate-service tests, 49 protected Cataloging HTTP tests and 15 frontend
duplicate contracts (**87 total**, including broader HTTP workflows, not 87
separate duplicate acceptance cases). Database/Supabase and frontend API/router
boundaries are mocked; this dated run supplies neither Curator/SRS archive-policy
approval nor live concurrency. November 4 user direction is recorded above.

A signed-in read-only browser check used existing test specimen
`79d5a204-c21d-4df6-b0bb-ebbfe1877975`, with its names copied into an unsaved
new-specimen form. The live warning linked that record and left Save enabled;
unrelated test values cleared the old warning/link. Holding a validated duplicate
read showed pending feedback, but aborting it removed the form instead of offering
unknown/Retry. This reproduced [DEF-020](./TEST_DEFECT_LOG.md#def-020---interrupted-duplicate-check-removes-the-unsaved-core-form),
not an archived-policy or matcher defect. Earlier guard failures were fixture
precondition problems; no form was submitted during any run.

The approved frontend repair and red-to-green test evidence are recorded once
in DEF-020. Its browser retest passed on a separately approved loopback dev
server on port 3002, without replacing the older production build on port 3000.
No specimen, lot, storage, publication or account records were changed.

CAT-014 remains In progress: DEF-020 awaits merged/deployed independent retest;
the REQ-4.4-21 scope question was open at this checkpoint; the active-only
scope was later approved by Sir Fidel (reported by John on 2026-11-05). Discoverable saved-record review remains an
explicit follow-up, while dashboard indication stays with John/Charles. This
batch authorizes no archive-policy or dashboard implementation.

## Merged browser retest checkpoint - 2026-10-24

The [DEF-020 follow-up](./TEST_DEFECT_LOG.md#merged-production-mode-browser-follow-up---2026-10-24)
now records successful warning/clear, interrupted lookup/form preservation and
explicit retry on the rebuilt merged production-mode frontend, not just the
earlier temporary dev server. A delayed lookup also ended with the correct
newer values/result; fully reordered completion was not forced. An initial
diagnostic scheduling assumption timed out and is documented as inconclusive,
not a functional failure. No form was saved or museum data changed.

DEF-020 remains Ready for retest for independent acceptance and complete stale
in-flight coverage. CAT-014 stays In progress for those limits and saved-review
decisions; the active-only scope was approved by Sir Fidel (reported by John on 2026-11-05). Do not repeat the already passing
owner failure/retry sequence merely because the overall row is not yet closed.
