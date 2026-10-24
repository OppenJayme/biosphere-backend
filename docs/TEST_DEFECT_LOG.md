# BioSphere Test Defect Log

**Test plan:** [ACCEPTANCE_TEST_PLAN.md](./ACCEPTANCE_TEST_PLAN.md)  
**Rule:** Never place secrets, access tokens, passwords, or personal data in a
defect entry.

## Start here

- [Summary](#2-summary): current status and owner; select a linked defect ID
  to jump to its evidence instead of reading the full history.
- [Repair order](#when-to-fix-a-discovered-defect): fix or contain blockers
  before dependent tests; unrelated safe checks may continue.
- [DEF-019 safety gate](#def-019---tab-interruption-diagnostic-failed-its-no-backend-write-guard):
  shared-backend tab-interruption diagnostics remain stopped pending isolation.
- [New defect template](#4-new-defect-template) for reproducible issues;
  [observations](#5-observations-awaiting-reproduction) for symptoms not yet
  established as defects.
- [Testing checkpoint and finish line](./ACCEPTANCE_TEST_PLAN.md#start-here)
  for coverage, remaining work, ownership dependencies and sign-off.

The summary status describes the current disposition; dated details preserve
what happened at each run. `Ready for retest` means a repair awaits the remaining
verification, not that the historical failure was just reproduced. Append new
evidence to the existing ID; do not file a second defect for the same issue or
remove earlier results to make the log shorter.

## 1. Severity and priority

Severity describes impact; priority describes repair order.

| Severity    | Meaning                                                                         |
| ----------- | ------------------------------------------------------------------------------- |
| S1 Critical | Security compromise, irreversible data loss, or core system unavailable         |
| S2 Major    | Data-integrity or authorization failure, or a critical workflow cannot complete |
| S3 Moderate | Incorrect behavior with a safe workaround                                       |
| S4 Minor    | Cosmetic, wording, or low-impact usability issue                                |

| Priority | Meaning                                          |
| -------- | ------------------------------------------------ |
| P0       | Stop other work and repair immediately           |
| P1       | Repair before module acceptance                  |
| P2       | Schedule in the current testing/refinement phase |
| P3       | Backlog improvement                              |

Valid statuses: `Open`, `In progress`, `Ready for retest`, `Verified`,
`Deferred`, `Rejected`, and `Duplicate`.

### When to fix a discovered defect

Log every reproducible defect immediately, even if the affected code is old or
its author is unknown. Discovery date and affected commits are evidence; do not
guess when or by whom the defect was introduced.

Pause dependent testing and fix or contain a defect immediately when it:

- is S1/P0, creates a security or authorization exposure, or risks data loss;
- permits invalid persistent data that later tests would treat as valid;
- blocks the workflow needed by the next dependent test; or
- makes the test environment unreliable enough to invalidate results.

An isolated S3/S4 defect with a safe workaround may remain open while unrelated
tests continue. It must still be assigned, retested, and resolved or explicitly
accepted before the affected module is signed off. Testing the rest of the
system is not a reason to postpone all fixes until the end.

## 2. Summary

| ID      | Date       | Module                     | Summary                                                                 | Severity    | Priority | Status | Owner                   |
| ------- | ---------- | -------------------------- | ----------------------------------------------------------------------- | ----------- | -------- | ------ | ----------------------- |
| [DEF-020](#def-020---interrupted-duplicate-check-removes-the-unsaved-core-form) | 2026-10-23 | Cataloging / Duplicate warning | Rejected client request escapes the warning check and removes the unsaved form | S3 Moderate | P1 | Ready for retest | Kyer / Cataloging frontend |
| [DEF-016](#def-016---backup-http-fixture-omits-the-security-audit-delegate) | 2026-10-19 | Backup / HTTP test fixture | Missing audit delegate logs an error despite green denial test | S3 Moderate | P2 | Ready for retest | Backup tests / coordinate with Auth |
| [DEF-017](#def-017---storage-inventory-denial-fixture-omits-security-audit-persistence) | 2026-10-21 | Inventory / HTTP test fixture | Storage-inventory denial passes despite missing security-audit delegate | S3 Moderate | P2 | Open | John / coordinate with Voltaire |
| [DEF-018](#def-018---csv-commit-success-status-differs-from-swagger-declaration) | 2026-10-22 | Cataloging / Import API docs | Commit Swagger success status differs from actual POST response | S4 Minor | P3 | Ready for retest | Kyer / Cataloging |
| [DEF-019](#def-019---tab-interruption-diagnostic-failed-its-no-backend-write-guard) | 2026-10-22 | Offline / Browser diagnostic | Tab-interruption pilot created a server fixture despite its intended interception | S3 Moderate | P1 | Open | Kyer / test isolation |
| [DEF-001](#def-001---duplicate-normalized-collection-names-are-accepted) | 2026-09-29 | Cataloging / Collections   | Duplicate normalized collection names are accepted                      | S2 Major    | P1       | Ready for retest | Cataloging / Backend    |
| [DEF-002](#def-002---future-provenance-collection-dates-are-accepted) | 2026-10-03 | Cataloging / Provenance    | Future collection dates are accepted and satisfy presence validation    | S2 Major    | P1       | Verified | Cataloging / Full stack |
| [DEF-003](#def-003---client-side-specimen-selection-does-not-hydrate-on-a-remote-lan-browser) | 2026-10-03 | Cataloging / Specimen list | Client-side specimen selection does not hydrate on a remote LAN browser | S2 Major    | P1       | Ready for retest | Cataloging / Frontend   |
| [DEF-004](#def-004---choose-file-controls-have-no-visible-hover-feedback) | 2026-10-03 | Cataloging / Media UI      | Choose-file controls have no visible hover feedback                     | S4 Minor    | P2       | Ready for retest | Cataloging / Frontend   |
| [DEF-005](#def-005---vocabulary-search-hides-the-matching-tag-names) | 2026-10-03 | Cataloging / Tags UI       | Vocabulary search hides the matching tag names                          | S4 Minor    | P2       | Ready for retest | Cataloging / Frontend   |
| [DEF-006](#def-006---media-history-exposes-raw-identifiers-and-storage-paths) | 2026-10-03 | Cataloging / Revision UI   | Media history exposes raw identifiers and storage paths                 | S4 Minor    | P2       | Ready for retest | Cataloging / Frontend   |
| [DEF-007](#def-007---selected-specimen-preview-never-displays-its-cover-image) | 2026-10-03 | Cataloging / Specimen list | Selected-specimen preview never displays its cover image                | S3 Moderate | P2       | Ready for retest | Cataloging / Full stack |
| [DEF-008](#def-008---clear-all-leaves-stale-filter-values-visible) | 2026-10-03 | Cataloging / Filters       | Clear all resets results but leaves stale filter values visible         | S3 Moderate | P2       | Ready for retest | Cataloging / Frontend   |
| [DEF-009](#def-009---invalid-row-values-make-the-entire-csv-preview-fail) | 2026-10-03 | Cataloging / CSV import    | Invalid row values make the entire preview return a generic 502         | S2 Major    | P1       | Verified | Cataloging / Frontend   |
| [DEF-010](#def-010---archived-locations-still-look-active-in-the-live-hierarchy) | 2026-10-04 | Storage / Hierarchy UI     | Archived locations still look active in the live hierarchy              | S3 Moderate | P2       | Ready for retest | Storage / Frontend      |
| [DEF-011](#def-011---clear-all-feels-slow-and-has-no-appropriate-pending-feedback) | 2026-10-07 | Cataloging / Filters UI    | Clear all feels slow and has no appropriate pending feedback            | S4 Minor    | P2       | In progress | Cataloging / Frontend   |
| [DEF-012](#def-012---save-metadata-and-set-as-cover-lack-visible-hover-feedback) | 2026-10-07 | Cataloging / Media UI      | Save metadata and Set as cover lack visible hover feedback              | S4 Minor    | P2       | Ready for retest | Cataloging / Frontend   |
| [DEF-013](#def-013---csv-choose-file-control-lacks-visible-hover-feedback) | 2026-10-07 | Cataloging / Import UI     | CSV Choose file control lacks visible hover feedback                    | S4 Minor    | P2       | Ready for retest | Cataloging / Frontend   |
| [DEF-014](#def-014---already-attached-tag-notice-resembles-successful-new-attachment) | 2026-10-07 | Cataloging / Tags UI       | Already-attached tag notice resembles successful new attachment         | S4 Minor    | P2       | Ready for retest | Cataloging / Frontend   |
| [DEF-015](#def-015---audit-http-fixture-omits-the-security-audit-create-method) | 2026-10-19 | Audit / HTTP test fixture | Missing security-audit create mock logs an error despite green denial test | S3 Moderate | P2 | Ready for retest | Audit tests / coordinate with Auth |

## 3. Defect details

### DEF-020 - Interrupted duplicate check removes the unsaved core form

**Related test:** CAT-014

**Environment:** Local signed-in Edge; running frontend/backend, simulated read-request interruption

**Found on:** frontend `d4d216b`, backend base `d04ede2`; actual served hashes unverified

**Severity:** S3 Moderate; unsaved input becomes unavailable, no persistent data loss established

**Priority:** P1 before Cataloging acceptance

**Status:** Ready for retest

**Owner:** Kyer / Cataloging frontend

#### Reproduction and evidence - 2026-10-23

1. Read the two populated names from existing Cataloging test specimen
   `79d5a204-c21d-4df6-b0bb-ebbfe1877975` (`TEST Offline Draft 20261017 A`).
2. Open an unsaved new-specimen form, enter those names and blur the field.
   A live warning links the matching test record and Save remains enabled.
3. Enter unrelated test names; the clear result replaces the warning and its
   old link disappears.
4. Change a checked name again. Hold only its validated duplicate-check Server
   Action request, verify the checking message, then abort that read request.

Expected: preserve the form/entered values, show that duplicates are unknown,
and allow an explicit retry. Actual: the unknown/Check again state was absent,
the Save form was no longer rendered and one browser page error was observed.
The client transition awaited the Server Action without catching transport
rejection; the server-side action's backend-error catch cannot handle a request
that fails before its result reaches the browser.

The diagnostic observed five duplicate read attempts (one deliberately aborted),
with no other non-read requests. No save was submitted, specimen created/edited,
merge/archive performed or Inventory touched. The probe closed and the original
signed-in Audit tab/URL remained unchanged. This is a simulated browser transport
failure, not evidence of a live backend outage or an authorization defect.

Earlier fixture guards stopped before any check because those fixtures did not
satisfy the expected name pair. They are test precondition failures, not failed
application acceptance results. The resumed run used the fixture above.

#### Repair and scoped verification - 2026-10-23

The user approved client-request tests with a mocked remote Server Action and
a repeated read-only browser check. A client-side request boundary now resolves
transport rejection to `unavailable` without exposing error details. The existing
component uses it inside its original transition/request-ID guard. Backend
authentication/validation, matcher, archived exclusion and Inventory are unchanged.
Repair: [frontend PR #78](https://github.com/OppenJayme/biosphere-frontend/pull/78),
commit `417b0c6`, based on frontend develop `99a9252`.

The first behavioral regression failed because the request rejected with
`Failed to fetch` instead of resolving unavailable; it passed after the fallback.
Five request tests and the existing duplicate contracts passed (20 focused tests).
Full frontend suite: **366/366 in 62 files**; lint, TypeScript and diff checks
passed. See frontend `docs/cataloging-defect-retest.md#def-020---interrupted-duplicate-warning-request`.

Port 3000 was confirmed to run `next start` against an existing production build.
A retry there still showed the original failure, but was not a verification of
changed source. With user approval, started a temporary dev server bound only
to `127.0.0.1:3002`; no production process or build was replaced.

The same browser diagnostic on port 3002 passed: live matching warning and
correct link, Save enabled, unrelated values clearing stale results, pending
feedback, interrupted lookup -> unknown/Check again, both entered names retained,
form/Save available and successful explicit retry with zero page errors. Six
validated duplicate read attempts included one aborted transport; no form was
submitted and no other non-read request occurred. The temporary tab closed and
the original signed-in Audit tab/URL remained unchanged. This does not prove
production deployment, true provider outage or independent module acceptance.
The task-owned dev server was stopped after retest; the original port-3000
frontend still returned HTTP 200. No shared server was killed or rebuilt.

#### Retest

- [x] Rejected client transport resolves to an unavailable warning, never clear.
- [x] Form and entered values remain available; explicit retry recovers.
- [ ] Normal matching/clear behavior and stale-response guards remain intact.
- [x] Full frontend regression/lint/type checks pass.
- [ ] Independent merged/deployed retest, including stale in-flight results.

### DEF-019 - Tab-interruption diagnostic failed its no-backend-write guard

**Related test:** OFF-003; ignored browser diagnostic, not application runtime code
**Environment:** Local signed-in Edge `biosphere-aud002`, shared running frontend/backend
**Found on:** frontend checkout `bc55ce7`, backend base `27520e1`; served hashes unverified
**Severity:** S3 Moderate (test isolation failed; one disposable server fixture created)
**Priority:** P1 before repeating dependent interruption diagnostics
**Status:** Open
**Owner:** Kyer / browser diagnostic isolation; no Inventory or Auth fix authorized

#### Intended check and actual result

After a clean eligible-draft preflight, a temporary tab created one labelled
local draft and held its matching POST in a page-scoped route handler without
calling `route.fetch` or `route.continue`. IndexedDB and UI showed
`SYNCHRONIZING`; Remove locally was disabled. The temporary tab was closed,
then the held handler was released and attempted `route.abort` (a closed-page
abort error was caught). The persisted local state was still `SYNCHRONIZING`.

A second temporary tab opened the workspace. The UI showed the explicit
interrupted-sync message and local state became retryable `SYNC_FAILED` /
`NETWORK`, with the same ID and text payload. Its retry received a synthetic
503 and retained the local draft. The local fixture was then removed through
the confirmed UI discard action, with IndexedDB absence verified.

**The final protected server read nevertheless found a matching specimen.**
The diagnostic failed with `Server-absence read failed`; a separate read
confirmed HTTP 200 and the same record. Therefore the overall pilot failed
test isolation and is **not an acceptance pass**, despite its earlier local
recovery assertions. No further interruption attempts or sync writes were made.

Retained disposable server fixture (not automatically deleted or archived):

- Name: `TEST Offline TAB 20261022 1a163ce65a9`
- Specimen UUID: `99782144-b9cf-4dd0-ad7b-1d5ec0f18f17`
- Created: `2026-10-22T13:30:38.440Z`
- Protected readback: `UNCATALOGED`, `publicDisplay: false`, `collectionId: null`
- Fixture-scoped audit: one `SYNC_OFFLINE_SPECIMEN_DRAFT` / `SUCCESS` entry

The exact request path/timing that reached the backend was not established.
Page-route teardown while a request is held is a hypothesis, not a demonstrated
root cause. Do not claim that no request reached the backend, that the browser
interception guarantees isolation, or that an application authorization or
idempotency defect has been established. Do not blindly rerun the pilot.

#### Containment and follow-up

Both temporary tabs were closed; the original signed-in audit tab/URL stayed
open. Final read-only checks found zero matching local fixtures and no eligible
unfinished drafts. Earlier successful simulated-401 and six-case matrix fixture
names were still absent from the protected server list. Those observations do
not erase this new incident. No existing museum records were edited and no
Inventory/auth/runtime/server-process changes were made.

Keep the ignored `tools/browser/artifacts/offline-tab-interruption.txt` out of
further shared-backend runs. An unconditional error guard now disables that
local script before any browser action; this is containment, not a repaired
interruption harness. Related read-only incident helpers are
`offline-tab-final-read.txt`, `offline-tab-incident-read.txt` and
`offline-tab-audit-read.txt` in that same frontend artifact folder. No credentials,
headers, auth state or unrelated museum contents were exported.

Before another dependent run:

- [ ] Confirm an isolated disposable target and test-only account/context, with
  explicit permission for any persistent fixture creation/cleanup.
- [ ] Establish a transport containment mechanism independently of the tab being
  destroyed; verify it cannot reach the shared backend during route teardown.
- [ ] Reproduce without writes to the shared target, then check full recovery
  and any accepted-write/idempotency branch separately under its approved scope.
- [ ] Obtain direction on retaining or explicitly archiving the server fixture;
  do not delete it or conceal its audit automatically.

Application acceptance remains incomplete. This is a diagnostic defect/incident,
not permission to weaken authentication or change Inventory logic. Documentation
verification: `git diff --check`; application suites/build were not rerun for
this evidence-only change.

### DEF-016 - Backup HTTP fixture omits the security-audit delegate

**Related test:** BAK-001; `test/backup.e2e-spec.ts`
**Environment:** Mocked Nest HTTP integration suite, not live data
**Found on:** backend `001fd4b`, 2026-10-19
**Severity:** S3 Moderate (test-harness/coverage defect)
**Priority:** P2
**Status:** Ready for retest
**Owner:** Backup test fixture; coordinate with Auth for the event contract

Run `npm run test:e2e -- --runInBand --runTestsByPath test/backup.e2e-spec.ts`.
The developer request returns 403, but SecurityAuditService logs
`Could not record ACCESS_DENIED (DENIED)` and
`Cannot read properties of undefined (reading 'create')`. All 4 tests pass.
The injected Prisma mock has `backup_history` but no `audit_log` delegate;
this is a sibling of the Audit fixture gap DEF-015, not a recurrence in its fix.

Expected: the mock supports the denial write and an assertion verifies the
expected event and actor. Preserve the 403 and mocked providers; do not suppress
the error, bypass guards, or alter auth production code as a workaround.
No failed live audit persistence or damaged backup is demonstrated.

Retest after a focused fixture repair:

- [x] A regression fails when the denial event is absent.
- [x] The developer remains denied and the expected event is observable.
- [x] Backup suites pass without missing-audit-mock errors.
- [x] No real backup operations, artifact access, or live writes are introduced.

Repair evidence (2026-10-20): on `fix/backup-denial-test-fixture`, a new HTTP
regression first failed with an empty curator audit list and the missing-create
error. The fixture now stores actual audit writes in a per-test in-memory list;
the curator HTTP read verifies the developer actor, denied result, action,
required role, and `/backups/history` request details. Backup HTTP tests pass
5/5 and Backup unit tests pass 6/6, without the missing-mock error. Production
auth and backup source are unchanged. Independent review/retest is pending;
this does not establish live audit persistence or complete BAK-001 acceptance.

### DEF-001 - Duplicate normalized collection names are accepted

**Related test:** CAT-001  
**Environment:** Development  
**Found on:** current `develop` during frontend acceptance testing

**Status:** Ready for retest

#### Repair evidence - 2026-10-05

On `fix/cataloging-acceptance-defects`, create/rename now use a normalized SQL
precheck inside serializable transactions, map unique-index races to a clear
409, and retain atomic auditing. A new migration creates `uq_collection_name`
after aborting if existing names collide. No records are automatically changed
or deleted. The configured database's read-only preflight found no collisions.
Database-index deployment and live concurrent-request verification remain
required before this defect can be marked Verified.

#### Preconditions

- Tester is signed in as an active curator.
- Collection Management is available.

#### Reproduction

1. Open Collection Management.
2. Add a collection named `Entomology`.
3. Add `Entomology` again.
4. Also verify variants such as `entomology` and `ENTOMOLOGY`.

#### Expected

Only one normalized `Entomology` collection may exist. Create and rename
operations that collide with it return a clear conflict message and make no
database or audit mutation.

#### Actual

Two records with different UUIDs and the same visible name are created and
displayed. This can fragment specimen assignments across apparently identical
collections.

#### Technical observation

- `CollectionsService.create` and `CollectionsService.update` do not check for
  an existing case-insensitive normalized name.
- `public.collection.collection_name` has no database uniqueness protection.
- The frontend correctly displays the two distinct records; it is not merely a
  rendering duplicate.

#### Required remediation

1. Define normalization as trimming surrounding whitespace and comparing names
   case-insensitively.
2. Return HTTP `409 Conflict` from create and rename collisions.
3. Add a concurrency-safe PostgreSQL uniqueness rule through a reviewed Prisma
   migration or approved custom migration SQL.
4. Map the conflict to a specific frontend message.
5. Add service and E2E tests for exact, case, whitespace, rename, and concurrent
   collisions.
6. Inspect existing duplicate UUIDs and specimen reference counts.
7. Choose one canonical record, transactionally reassign references, and only
   then remove the duplicate.

Do not delete either existing row manually until references have been checked.

#### Retest

- [ ] Exact duplicate create returns `409`.
- [ ] Case-only and surrounding-whitespace duplicates return `409`.
- [ ] Rename to another collection's normalized name returns `409`.
- [ ] Repeating the same-name rename is handled clearly.
- [ ] Concurrent duplicate requests cannot create two records.
- [ ] Existing specimen-to-collection relationships remain correct after
      cleanup.
- [ ] Audit history contains only successful accepted mutations.

### DEF-002 - Future provenance collection dates are accepted

**Related test:** CAT-005; affects CAT-006 and CAT-007

**Environment:** Development, Supabase development project

**Found on:** backend `b56d183`; frontend `672fe4e`

**Severity:** S2 Major

**Priority:** P1

**Status:** Verified

**Owner:** Cataloging / Full stack

#### Repair evidence - 2026-10-05

The shared backend date policy rejects invalid and future dates in DTOs,
internal service writes and CSV preview. Readiness applies the same policy to
existing dates. Frontend form validation and the input maximum use Asia/Manila
calendar dates. Regression coverage includes the UTC/Manila midnight boundary,
unchanged legacy future dates, no mutation on rejection, and mixed CSV rows.
Original manual failures below are preserved; browser retesting is still required.

#### Live date regression verification - 2026-10-22

Using retained disposable CSV specimen `3e7a3ca2-bf8f-45c9-98d3-94b8bcf31419`,
created provenance with `2026-10-22`, then updated its date to `2020-01-01`.
Fresh editor navigation/reload preserved both accepted values. Tomorrow was
blocked natively with no POST; after removing only the test page's DOM maximum,
the Server Action independently rejected it. Unchanged submission also failed.
Reload preserved the historical value and restored the date maximum.

Revision UI showed exactly the two accepted date transitions, and audit UI
showed one provenance create and one update SUCCESS (plus the existing import).
Rejected attempts added no date revisions or successful mutation audits. The
date requirement was met, but other incomplete requirements kept Cataloging
disabled; status/public flag remained UNCATALOGED/false.

Together with the live CSV future-date error and isolated backend HTTP tests
in PR #166 (including legacy future-date readiness/completion rejection), this
verifies the original date regression. Direct live backend bypass, injected
legacy-invalid data, concurrency/rollback and independent module sign-off were
not tested or claimed. See CAT-005 live evidence in ACCEPTANCE_TEST_PLAN.md for
checkout references, the recovered post-merge note and diagnostic scripts.

#### Preconditions

- Tester is signed in as an active curator.
- An `UNCATALOGED` specimen exists.

#### Reproduction

1. Open the specimen's Provenance page on 2026-10-03.
2. Enter `2026-10-25` as the collection date.
3. Save and reload the record.
4. Inspect Catalog readiness.

#### Expected

A provenance collection date later than the museum's current calendar date is
rejected by both the frontend and backend. It must not satisfy Catalog
readiness. Today's date and valid historical dates remain accepted.

#### Actual

The future date saves, reloads, and appears in revision history. The current
completion policy checks only that the date is present, so an invalid future
date can satisfy that requirement.

Other CAT-005 behavior passed: persistence, revision old/new values, no-change
handling, one-field edits, removal of an empty provenance record, maximum input
length, whitespace normalization, and double-submit prevention.

#### Required remediation

1. Add a frontend date maximum for immediate feedback.
2. Enforce the same calendar-date rule in the backend, which remains
   authoritative for direct API calls.
3. Apply the rule to CSV import and every other persistence path.
4. Make Catalog readiness reject pre-existing future dates.
5. Use the museum's agreed local calendar date rather than an accidental UTC
   date boundary.

#### Temporary control

Do not complete Cataloging for a record with a future collection date. Correct
the test record to a valid historical date before continuing dependent tests.

#### Retest

- [x] A historical date saves (live UI/readback/reload).
- [x] Today's date saves (live UI/readback/reload).
- [x] Tomorrow is rejected by native/Server Action validation (live) and direct API (isolated HTTP).
- [x] Imported future dates are rejected in preview (live) and direct commit selection (isolated HTTP).
- [x] Existing future dates fail readiness/completion (isolated HTTP; no invalid live data seeded).
- [x] Rejected values add no provenance date revision or successful mutation audit (live + isolated HTTP).

### DEF-003 - Client-side specimen selection does not hydrate on a remote LAN browser

**Related test:** CAT-015

**Environment:** Development frontend opened through the host computer's LAN IP

**Found on:** backend `b56d183`; frontend `672fe4e`

**Severity:** S2 Major

**Priority:** P1

**Status:** Ready for retest

**Owner:** Cataloging / Frontend

#### Repair evidence - 2026-10-05

Each row now has real detail and URL-backed preview links; clearing selection
also uses a real link. Hydrated previews update native history without fetching
the loaded page again. Back/Forward follows URL selection and narrow screens
scroll to the preview. Next development assets allow this host's exact private
LAN IPv4 addresses, with no wildcard origins. Static-render regression tests
verify that navigation survives without click handlers. The original remote
browser console error remains uncaptured: restart the dev server and retest
both devices before claiming the hydration problem is resolved.

#### Preconditions

- Frontend and backend are running on the host development computer.
- A second device opens the frontend through the host's IP and port.
- The tester signs in as a curator and opens the specimen catalog.

#### Reproduction

1. Open the specimen list on the remote browser.
2. Observe that the first specimen is selected initially.
3. Attempt to select another specimen row.
4. Click the X button in the Selected Specimen panel.
5. Use the first specimen's real `View full specimen details` link.

#### Expected

Row selection and the X button work on supported local and LAN browsers. Every
specimen remains reachable using an accessible link even if client-side
enhancement fails.

#### Actual

The X button does nothing, strongly indicating that the client component did
not hydrate. The initial specimen's ordinary detail link still navigates, while
JavaScript-only row selection is unavailable. The exact browser/device and
client-console error still need to be captured.

#### Technical observation

- `SpecimensWorkspace` initially selects `items[0]` in client state.
- `SpecimenTable` uses an `onClick` handler on `<tr>` elements rather than a
  progressively enhanced link.
- The ordinary detail link can work without the failed interaction handlers.
- On narrow screens the 1,020-pixel table and below-table preview can also hide
  visible selection feedback, but the dead X button confirms a hydration issue
  in this session.

#### Required investigation and remediation

1. Record the affected device, browser/version, URL, and whether JavaScript is
   enabled.
2. Inspect browser Console and Network failures, especially `/_next/static/`
   client chunks and hydration errors.
3. Retest after clearing site data/service workers and in a private window.
4. Give every specimen an accessible real link and represent selection in the
   URL so records remain reachable without JavaScript-only row handlers.
5. Keep the preview as progressive enhancement and make its update visible on
   narrow screens.
6. Add desktop, keyboard, touch/mobile, and LAN-origin regression coverage.

#### Temporary workaround

Filter/search until the intended specimen becomes the first result, then use
its `View full specimen details` link. This workaround is not sufficient for
module acceptance.

#### Local keyboard evidence - 2026-10-22

Read-only Playwright check against the running `localhost:3000` frontend;
frontend worktree was clean at `d4d216b` (PR #77, merged into develop as
`590be23`). This is a local selection check, not a reproduction of the original
remote-LAN hydration failure. DEF-003 remains **Ready for retest**.

- A read-only IndexedDB preflight found no existing drafts eligible for automatic
  synchronization before opening the specimen workspace.
- A temporary tab opened `/specimens?search=TEST&selected=none` using the existing
  curator session. Two existing results were checked to have `TEST` names before
  interaction; no specimen was created or edited.
- Programmatically focused each common-name preview link and pressed native
  keyboard **Enter**. Both selected the matching URL ID, panel live-status text,
  current-link marker and full-detail target; the second did not remain stuck on
  the first result. Each corresponding row-detail link also targeted the same ID.
- Reload retained the second selection. Enter on **Clear selection** set
  `selected=none`, cleared the live-status text/selection marker, and Back/Forward
  restored/cleared the correct preview.
- All non-GET/HEAD requests in the temporary tab were aborted (four requests).
  Cover-preview Server Action behavior is therefore excluded from this result;
  this was not a normal image-loading or performance check.
- The temporary tab was closed; the original signed-in Audit tab and its URL
  remained unchanged. No credentials, auth exports or museum-record dumps were
  retained in the shared evidence.

Limits: programmatic focus plus Enter does not establish complete Tab order,
visible-focus contrast, screen-reader announcements or physical keyboard/device
acceptance. Detail destinations were inspected, not opened in this check. LAN
origin, touch/mobile, no-JavaScript navigation and comprehensive console/chunk
checks remain unverified here. Native anchors activate with Enter; Space normally
scrolls, so do not require button-style Space activation on these links or rows.

#### Local Tab and detail-navigation follow-up - 2026-10-22

Same clean frontend source `d4d216b`; a fresh read-only draft preflight again
found no eligible automatic-sync work. A separate temporary tab used two existing
`TEST` results and native keyboard traversal, without programmatic link focus:

- Tab from the freshly loaded page reached the first two rows' links in order:
  first detail, first preview, second detail, second preview.
- All four focused links matched `:focus-visible` and had a nonzero computed
  outline width with a non-`none` outline style. This checks presence, not contrast,
  clipping, overlap or a full visual accessibility review.
- Enter on the second preview selected its matching ID and live-status label.
  Shift+Tab reached that row's detail link; Enter loaded the actual detail page.
  Its header contained the selected common name, its revision-history link used
  the same specimen ID, and the load-failure message was absent.
- Browser Back returned to the selected catalog record. The original signed-in
  Audit tab and URL were preserved; only the temporary tab was closed.
- Page-error and error-console listeners detected zero matches for the bounded
  hydration-failure/chunk-load-error patterns used by this diagnostic. This is
  not a claim that every console message or asset response was inspected.
- All non-GET/HEAD browser requests were aborted (two); cover loading remains
  excluded. No forms were submitted and no specimens/inventory were changed.

This closes the local row-link traversal/detail-opening evidence gap from the
earlier diagnostic, not DEF-003 itself. Full-page keyboard/accessibility,
screen-reader, touch/mobile, LAN-origin and no-JavaScript checks remain pending;
no application fix was needed for the behavior exercised here.

#### Retest

- [ ] Selection works through `localhost` and the LAN-IP origin.
- [ ] The X button clears selection.
- [ ] Every result has a direct accessible detail link.
- [ ] Keyboard link activation with Enter and touch selection work (Space is not
      required to activate native links).
- [ ] Mobile users can see which specimen was selected.
- [ ] No hydration or client-chunk errors appear in the browser console.

### DEF-004 - Choose-file controls have no visible hover feedback

**Related test:** CAT-011

**Environment:** Development specimen-media page

**Found on:** frontend `672fe4e`

**Severity:** S4 Minor

**Priority:** P2

**Status:** Ready for retest

**Owner:** Cataloging / Frontend

#### Repair evidence - 2026-10-06

Frontend branch `fix/cataloging-media-file-feedback` gives both native file
pickers one shared style with enabled-only hover feedback, a visible keyboard
focus outline and distinct disabled input/button styling. Accessible wrapping
labels, native file selection, required/accept constraints and pending disabling
are preserved. Archived media still exposes no mutation pickers.

The repair uses the existing `forest-100` hover token. `sage-200` is not defined
in the current brand theme and would not generate a working hover utility.

Component rendering tests verify the shared classes, native input constraints
and archived read-only behavior. Visual hover/focus/disabled behavior and actual
file submissions must still be retested in supported desktop browsers before
marking this defect Verified. This backend update is documentation only; no
API, database, authorization or other module behavior changed.

Local verification: frontend lint and production build passed; 48 test files /
279 tests passed. Generated production CSS contains the enabled hover,
keyboard-focus and disabled file-button utilities. This does not replace a
visual/native-picker retest in supported browsers.

#### Manual retest observations - 2026-10-07

Tester reports the native file-picker checks look good, but separately reports
missing hover feedback on Save metadata and Set as cover (tracked as DEF-012).
The initially reported file disappearing after refresh was clarified: a file
was selected locally without Upload image or Replace file being submitted.
Clearing an unsubmitted native file selection on refresh is expected behavior,
not an upload-persistence defect. Actual successful-upload/replacement persistence
was not confirmed in this exchange. Exact tested commits were not captured;
DEF-004 remains Ready for retest pending explicit remaining checks.

#### Reproduction

1. Open a specimen's Media page.
2. Move a mouse pointer over the native Choose File/Choose Media control in the
   upload form.
3. Repeat on the replace-file form.

#### Expected

The interactive file-selection button gives clear hover, keyboard-focus, and
disabled feedback consistent with other BioSphere controls.

#### Actual

The upload control retains the same color while hovered. The behavior does not
block file selection, but it provides weak interaction feedback.

#### Technical observation

- The upload input defines `file:bg-sage-100` but no `file:hover:*` style.
- The replacement input uses the generic input style and has no consistent
  file-button interaction styling.
- This is a CSS issue and is independent of the client-hydration failure in
  DEF-003.

#### Required remediation

1. Apply one shared file-input style to upload and replacement controls.
2. Add visible pointer hover, keyboard focus, and disabled states with adequate
   contrast.
3. Preserve the native file picker and accessible label.
4. Verify behavior in the team's supported desktop browsers.

#### Retest

- [ ] Upload and replacement file controls visibly respond to pointer hover.
- [ ] Keyboard focus is visible without relying on color alone.
- [ ] Disabled/pending appearance is clear.
- [ ] Selecting and submitting a valid file still works.

### DEF-005 - Vocabulary search hides the matching tag names

**Related test:** CAT-010

**Environment:** Development specimen-tags page

**Found on:** frontend `672fe4e`

**Severity:** S4 Minor

**Priority:** P2

**Status:** Ready for retest

**Owner:** Cataloging / Frontend

#### Repair evidence - 2026-10-06

Frontend branch `fix/cataloging-visible-tag-suggestions` renders the existing
search results as visible keyboard-accessible buttons. Selecting a name fills
and focuses the existing Tag name input; only Attach tag performs the existing
validated mutation. Choices/input are disabled while attachment is pending,
archived records remain read-only, and clearing search resets its visible field.
No backend API, shared vocabulary, inventory or storage behavior changes.
Automated rendering/selection-contract checks were added; browser interaction,
persistence, duplicate prevention and revision history remain manual retests.

#### Manual retest evidence - 2026-10-07

Tester confirmed all eight guided checks passed: create `Acceptance Retest Tag`
on specimen A, find it through specimen B's reusable search, display the matching
button, select it to populate Tag name without saving, explicitly attach it,
confirm persistence after refresh, omit the attached tag from B's suggestions,
and clear the visible search field. Running commit IDs were not captured.
Keyboard/touch, pending/read-only states, case-insensitive duplicate prevention,
detach/reuse and revision-history checks remain outstanding for final sign-off.
Status stays Ready for retest; this records partial acceptance, not full verification.

#### Additional tag retest evidence - 2026-10-07

Tester explicitly confirmed keyboard selection fills Tag name, case-insensitive
reattachment creates no duplicate relationship, detachment persists after refresh,
and revision history works. The remaining guided tag checks were reported working.
Duplicate feedback is confusing because the existing-tag notice looks like a green
attachment confirmation; tracked separately as DEF-014, not a data-integrity failure.
Exact running commits and explicit pending/read-only checks remain uncaptured.

#### Reproduction

1. Attach a tag to one specimen so it becomes part of the shared vocabulary.
2. Open another specimen's Tags page.
3. Search the reusable vocabulary for that tag.

#### Expected

The matching reusable tag names are visibly shown and can be selected without
the curator having to discover a separate browser datalist interaction.

#### Actual

The page reports only that one reusable suggestion is available in the
tag-name field. It does not visibly list the matching name near the search
result, making the successful search result unclear.

#### Technical observation

- Matching tags are supplied to the attach field through an HTML `datalist`.
- The search-result area displays only the number of matches.
- Tag reuse itself works; this is a discoverability issue rather than a data or
  duplicate-protection failure.

#### Required remediation

1. Render the matching tag names as visible, keyboard-accessible choices.
2. Selecting a result should populate or attach through the existing validated
   tag workflow rather than introduce a second persistence path.
3. Preserve case-insensitive duplicate prevention and the shared vocabulary.
4. Provide an explicit no-results message.

#### Retest

- [ ] Matching reusable tag names are visible after searching.
- [ ] Results are usable with pointer, keyboard, and touch input.
- [ ] Selecting a result attaches the existing shared tag.
- [ ] An already attached tag remains excluded from suggestions.
- [ ] Duplicate normalization and revision history still work.

### DEF-006 - Media history exposes raw identifiers and storage paths

**Related test:** CAT-011

**Environment:** Development specimen revision-history page

**Found on:** frontend `672fe4e`

**Severity:** S4 Minor

**Priority:** P2

**Status:** Ready for retest

**Owner:** Cataloging / Frontend

#### Repair evidence - 2026-10-06

Frontend branch `fix/cataloging-readable-media-history` adds read-only media
event/value formatting for additions, removals, file replacements, cover,
caption and display-order changes. UUIDs/paths are replaced with neutral
descriptions; historical filenames are not invented or fetched from current
media records. Caption text and numeric ordering remain visible. Backend/API
revision values remain immutable and unchanged for authorized investigation.
Automated helper/rendering tests cover this presentation and preservation of
ordinary-field/tag formatting. Live CAT-011 history retesting remains required.

#### Reproduction

1. Upload, replace, and remove specimen media.
2. Open the specimen's revision history.
3. Inspect the values for `Specimen Media` and `Specimen Media.File` entries.

#### Expected

History describes the action in curator-readable terms, such as an image being
added, replaced, or removed, with a safe filename or caption where useful.

#### Actual

Media additions and removals display raw UUIDs. File replacement entries
display internal storage-object paths, which are implementation details and
make review history difficult to understand.

#### Technical observation

- The revision history formatter special-cases specimen tags but not media.
- The underlying audit data appears complete; the defect is in presentation.
- No credential or signed URL was observed in the displayed values.

#### Required remediation

1. Add media-specific revision formatting for add, replace, metadata edit, and
   removal events.
2. Prefer a sanitized filename, caption, or clear action label over UUIDs and
   storage paths.
3. Preserve the underlying immutable revision values for authorized forensic
   access without exposing implementation details in the ordinary curator UI.

#### Retest

- [ ] Media additions and removals use understandable action descriptions.
- [ ] Replacement history identifies the change without showing storage paths.
- [ ] Caption, display-order, and cover changes remain distinguishable.
- [ ] Existing tag and core-field history formatting is unchanged.

### DEF-007 - Selected-specimen preview never displays its cover image

**Related test:** CAT-011

**Environment:** Development specimen catalog page

**Found on:** backend `b56d183`; frontend `672fe4e`

**Severity:** S3 Moderate

**Priority:** P2

**Status:** Ready for retest

**Owner:** Cataloging / Full stack

#### Repair evidence - 2026-10-06

Frontend branch `fix/cataloging-cover-preview` lazily reads the selected
specimen's marked cover using existing curator-protected media/signing APIs.
A verified session and valid UUID are required before reads; the response
contains only caption and short-lived HTTPS URL, not storage paths or session
credentials. Backend media calls share a ten-second deadline. No-cover,
loading and safe error/retry states are distinct. The component is keyed by
specimen UUID and update timestamp and ignores late responses after unmount
or retry. Existing no-store reads and media revalidation remain in use.

Tests cover the action's authorization, selected-cover-only behavior, response
shape and safe failures plus rendered image/placeholder/error states. Browser
image loading, rapid selection, cover changes/removal and retry still require
manual retest. No backend application, Inventory, Storage or Exhibit code was
changed; this backend entry is documentation only.

Local verification: frontend lint and production build passed; 47 test files /
276 tests passed. No dependencies or database schema changes were introduced.

#### Manual retest observations - 2026-10-07

Tester confirmed the selected cover appears in the right-hand preview and a
separate specimen without a cover shows No cover image selected; the remaining
guided cover checks were reported working. Exact running commits were not captured.
Rapid-selection races, request failure/retry and expired image links still need
explicit testing before final verification. Status remains Ready for retest.

The tester estimates image loading at roughly one second. This is an unmeasured
performance observation, not a confirmed latency defect or accepted response-time
target. Capture image size and signing/download timings and compare development
with production before choosing an optimization.

**Deferred enhancement:** Show small cover thumbnails in the left-hand Record
column instead of its current icon, with a no-cover fallback. This is separate
from DEF-007; no row-thumbnail implementation is claimed. Evaluate bounded,
efficient thumbnail delivery without full-image/signing requests per row before
implementation. Keep this work within Cataloging presentation.

#### Reproduction

1. Upload at least one specimen image and mark it as the cover.
2. Confirm the cover marker persists on the Media page.
3. Return to the specimen catalog and select that specimen.
4. Inspect the image area in the Selected Specimen panel.

#### Expected

The selected specimen's current cover image appears through an authorized,
short-lived URL, with an accessible fallback when no cover exists or the image
cannot be loaded.

#### Actual

The panel always displays the paw placeholder even when the specimen has a
valid cover image.

#### Technical observation

- `SpecimenDetailPanel` renders `PawIcon` unconditionally.
- The catalog summary contract does not currently provide an authorized cover
  preview URL.
- Private storage paths must not be placed directly in the catalog response or
  exposed as public URLs.

#### Required remediation

1. Add a bounded, authorized way to obtain the selected specimen's current
   cover preview, preferably only when needed rather than signing every image
   for every catalog row.
2. Render the short-lived URL in the selected preview with appropriate alt text.
3. Retain the placeholder for specimens without a cover and for recoverable
   image-loading failures.
4. Ensure a cover change or removal invalidates the relevant cached view.

#### Retest

- [ ] A selected specimen with a cover displays the correct image.
- [ ] Switching the cover updates the preview after navigation or refresh.
- [ ] Removing the cover falls back safely without a broken image.
- [ ] A specimen without media continues to show the placeholder.
- [ ] No raw storage path, service credential, or long-lived public URL is exposed.

### DEF-008 - Clear all leaves stale filter values visible

**Related test:** CAT-012

**Environment:** Development specimen catalog page

**Found on:** frontend `672fe4e`

**Severity:** S3 Moderate

**Priority:** P2

**Status:** Ready for retest

**Owner:** Cataloging / Frontend

#### Repair evidence - 2026-10-05

Frontend branch `fix/cataloging-filter-reset` keys the uncontrolled filter form
to the complete parsed query. When Clear all or restored navigation changes
the applied query, React replaces the form and initializes its inputs/selects
from that query. Rerenders with the same query retain unfinished input; no
extra state, dependencies, API changes or inventory/storage mutations were
introduced.

Three automated component-contract tests cover changed form identity, default
values for every control, advanced-section defaults, all changed query fields,
and stable identity on unrelated rerenders. They do not simulate real browser
interaction. The original failure below remains evidence; manually retest Clear
all, immediate reapply and Back/Forward before marking this defect Verified.

Local verification: frontend lint and production build passed; 45 test files /
262 tests passed. Backend changes for this repair are documentation only.

#### Live browser comparison - 2026-10-18

A read-only Playwright retest reproduced the previously reported successful
manual behavior. An independent unfiltered API readback contained 57 active
records; Cataloged + Male expected and displayed 8 matching records. Every
displayed row's ID/status/gender agreed with that expectation. Clear all reset
the URL and checked search/filter/sort controls to defaults and restored the
original first-page record IDs and 57-record total. Back restored the filtered
controls/rows; Forward restored the cleared state; Apply worked again afterward.
All five automated checks passed. No specimen was created or edited, and only
the separate test browser was closed afterward.

Working-tree references were frontend `e43e7fc` and backend `60f89dc`; exact
commits of the already-running builds were not independently verified. The
temporary harness is ignored tooling output, not a maintained CI test. This
comparison supports the tester's earlier result; it does not cover changed
collection/advanced controls, keyboard/new-tab/no-JavaScript navigation or
failure/pending feedback. Keep those separate from this verified scenario.

Single-run observations were Apply 1120 ms and Clear 1526 ms, including browser
automation/settling checks. These are not a performance benchmark or proof of
improvement; DEF-011 remains unresolved. No latency target is signed off here.

#### Reproduction

1. Select values such as Cataloged status, a collection, and a gender.
2. Apply the filters and confirm the result set changes.
3. Select `Clear all`.

#### Expected

The URL, result set, and every visible search/filter/sort control return to
their documented default values.

#### Actual

The URL and result set reset, but controls such as status, collection, and
gender continue to display their previous selections. The visible form no
longer represents the active query.

#### Technical observation

- `Clear all` performs a client-side navigation to `/specimens`.
- Toolbar controls are uncontrolled inputs using `defaultValue`.
- During soft navigation, the existing DOM controls can retain their current
  values even though the server-rendered query and results have reset.

#### Required remediation

1. Synchronize every control with the parsed query after navigation, either by
   controlled state or by intentionally remounting/resetting the form when the
   query changes.
2. Keep the backend query as the source of truth.
3. Preserve pagination reset and the current validated query allowlist.
4. Add an interaction test that applies multiple filters and clears them.

#### Retest

- [ ] Clear all resets the URL and result set.
- [ ] Search, filters, and sort controls visibly return to defaults.
- [ ] Reapplying immediately after clearing does not restore stale filters.
- [ ] Browser Back/Forward keeps controls and results synchronized.
- [ ] Pagination returns to page 1.

### DEF-009 - Invalid row values make the entire CSV preview fail

**Related test:** CAT-013

**Environment:** Development Cataloging import page

**Found on:** backend `b56d183`; frontend `672fe4e`

**Severity:** S2 Major

**Priority:** P1

**Status:** Verified

**Owner:** Cataloging / Frontend

#### Repair evidence - 2026-10-05

Preview collection IDs and gender now accept bounded raw text, preserving
invalid CSV values alongside backend row errors. Strict normal specimen and
commit response schemas remain unchanged. Regression tests cover mixed valid
and invalid rows, malformed response shapes and the 500-row boundary. Browser
preview/commit retesting remains required; no acceptance result is changed to
Pass merely because automated contract tests pass.

#### Manual preview evidence - 2026-10-07

Tester supplied a screenshot showing three reviewed rows: two valid/Ready,
one invalid with a specific gender-enum validation message, and zero warnings.
The invalid row's checkbox appears disabled; valid rows are selected. Preview
renders rather than failing with the previously reported generic 502.
Exact running commits were not captured. Selected-row commit, persisted values,
preview-only non-mutation, repeat-commit safety and other invalid-input cases
remain to be explicitly tested. DEF-009 stays Ready for retest.
The separate CSV native-file hover report is tracked as DEF-013.

**Follow-up:** Tester reported the selected-row save checklist passed: only the
selected valid row was imported, its values persisted with UNCATALOGED status,
and unselected/invalid rows were not imported. Repeat-commit and other invalid
input edge cases remain unverified; tested commits were not captured.

#### Live regression verification - 2026-10-22

The earlier limitations above are historical. In the real signed-in local UI,
the mixed file now renders with 2 valid / 3 invalid rows, including invalid
gender, future collection date and malformed collection UUID. Invalid checkboxes
are disabled and row errors are visible; no generic 502 occurs. Protected
before/after reads show identical specimen-ID sets and zero test fixtures after
preview. A valid-only preview separately passes without creating a record.

Only the selected valid row was imported. Re-selecting it in the same retained
preview and committing again returns the same specimen UUID; protected reads
still find one fixture, Uncataloged and public off. Detail/reload preserves name
and remarks, while Audit Logs shows exactly one successful IMPORT_SPECIMEN event
after reload. Unselected/invalid rows remain absent. The earlier isolated HTTP
regressions also reject directly posted invalid/unreviewed row selections.

Fixture: `TEST CSV 20261022 C 7c56d941 Selected`, UUID
`3e7a3ca2-bf8f-45c9-98d3-94b8bcf31419`, retained for review. Checkout references:
frontend `0ffa81f`, backend `0da6cc6`; served build hashes not independently
inspected. No request mocks, direct database writes, auth exports, Inventory
operations or server restarts. Main commit/retry script reported zero page errors.

**Verified** applies to the original preview-schema regression and tested
core-only workflow, not extended imports, live concurrency/rollback, response-loss
recovery or independent module sign-off. Full reproduction, fixture/script
references and limits are in the CAT-013 live evidence in ACCEPTANCE_TEST_PLAN.md.

#### Reproduction

1. Prepare a CSV containing valid rows and one row whose gender is
   `BAD_VALUE`.
2. Open Cataloging import and select the CSV.
3. Select `Preview CSV`.
4. Inspect the browser Network panel.

#### Expected

The preview succeeds, marks the invalid row as unselectable, and displays the
backend's row-level gender validation message without saving any records.

#### Actual

`POST /api/cataloging/specimens/import/preview` returns `502 Bad Gateway`, and
the UI reports that CSV preview is temporarily unavailable. No row-level
preview is shown.

#### Technical observation

- The backend intentionally echoes raw CSV values in preview rows so invalid
  data can be reviewed alongside `valid` and `errors`.
- The frontend preview schema requires `data.gender` to match the valid enum
  and `data.collectionId` to be a valid UUID even for an invalid preview row.
- Therefore an expected invalid value such as `BAD_VALUE` causes frontend
  response parsing to reject the entire otherwise valid preview response.
- The same mismatch can affect other raw invalid values, such as malformed
  collection UUIDs.
- Backend import tests passed 39/39. Existing frontend contract tests passed
  3/3 but do not include an invalid raw preview row.
- The observed PostgreSQL `client.query()` deprecation warning is unrelated to
  the frontend response-schema rejection.

#### Required remediation

1. Model preview-row `data` as bounded raw CSV display values rather than as
   already business-valid create input.
2. Keep strict business validation in the backend and use each row's `valid`
   and `errors` fields to control selection and explain rejection.
3. Do not loosen the normal specimen-create or commit contracts.
4. Preserve the same-origin upload boundary, authentication, size limits, and
   strict top-level preview response validation.
5. Add frontend regression cases for invalid gender, malformed collection UUID,
   mixed valid/invalid rows, and safe rendering of backend errors.

#### Retest

- [x] A mixed-validity CSV returns a visible preview rather than 502 (live UI).
- [x] Invalid raw gender and collection values appear safely with errors (live UI).
- [x] Invalid rows cannot be selected (live UI) or committed (isolated direct HTTP regression).
- [x] Valid rows remain selectable and previewing creates no records (live protected reads).
- [x] Valid-only preview and retry-safe commit behavior remain unchanged (live UI/readback/audit).

### DEF-010 - Archived locations still look active in the live hierarchy

**Related test:** STO-004

**Environment:** Development Storage Location page

**Found on:** backend `6e3b1c2`; frontend `672fe4e`

**Severity:** S3 Moderate

**Priority:** P2

**Status:** Ready for retest

**Owner:** Storage Location Management / Frontend

#### Read-only recheck - 2026-10-21

**Still reproducible; status remains Open (S3/P2).** Reused the existing
archived fixtures through the signed-in local Storage UI; no records, lots,
quantities, hierarchy relationships or lifecycle states were changed.

- Cabinet: `TEST CABINET A`, `4fa17866-6e90-4020-a909-63f8163f33bc`.
- Child: `TEST - DRAW 1 Updated`, `360de017-ac7b-4939-9d4a-251008667209`.
- The default `/storage` hierarchy included the archived cabinet. Searching
  its name returned a result without an Archived label, and no Show archived
  toggle was available.
- The cabinet's child card did not mark its archived child as Archived. The
  parent reported one direct child without distinguishing active/history data.
- Selecting either fixture showed its Archived badge and read-only management
  notice. The child's direct selection survived reload with the same ID;
  its audit-history link showed one `ARCHIVE_STORAGE_UNIT` row.

Current source still requests `listStorageLocations("ALL")` and builds the
hierarchy, search and direct-child list without lifecycle filtering/badges.
This is the original display defect, not proof that archive data or history
was lost. No new duplicate defect ID is needed. No repair was implemented.

The initial browser run timed out waiting for read-only text after search
selection. A direct-link check and a rerun with explicit selection-URL/render
waits passed the read-only checks and reproduced the display defect. The
initial timeout's cause was not independently established; it is not classified
as a separate application/navigation defect from that single observation.

Checkout references: backend base `db45e1a`, frontend `f596a3f`; actual served
production build hashes were not independently verified. Existing servers and
sign-in were preserved. The local diagnostic script is Git-ignored at frontend
`tools/browser/artifacts/storage-archived-display-recheck.txt`. No API mocking,
direct database writes, credential export, or changes to Inventory occurred.
This does not retest backend write rejection or lot-assignment restrictions.

#### Frontend repair and local verification - 2026-10-21

Frontend commit `79f965f` implements active-first visibility with an explicit
URL-backed Show archived toggle. Legacy archived selection links still reveal
history; explicitly hiding archives chooses an active fallback. Tree, search,
breadcrumbs and child cards consistently label archived records. Active and
archived direct-child counts/lists are separate. Existing read-only management,
audit navigation and archived-parent exclusion remain intact.

The existing protected `ALL` read is retained for historical paths and parent
validation; visibility is frontend presentation, not authorization. No backend
application code, schema, dependencies, shared Inventory helpers or live data
were changed. Scope is Storage Location Management only.

- Test-first regressions: 10 new view cases; 18 tests including existing
  hierarchy/management suites passed. Full frontend: 57 files / 331 tests passed.
- Frontend lint, TypeScript and production Turbopack build passed. Build used
  an isolated source-only copy and public CI placeholders, not copied secrets
  or auth state; normal frontend build output was preserved.
- Signed-in live UI on loopback port 3100 reused the above archived fixtures
  and existing backend. Default/search filtering, toggle/reload, all four
  badge surfaces, counts (zero active / one archived child), child navigation,
  legacy link, keyboard hide and active fallback passed without data writes.
- Archived mutation controls were absent, parent options excluded archives,
  and one existing archive audit row remained accessible. Active navigation
  and case-insensitive search passed. Delaying only a browser read verified
  busy feedback, disabled toggle and recovery; the temporary hook was removed.
- Main UI script recorded zero page errors. Its initial immediate checkbox
  assertion was corrected to await server URL/render completion and reran
  successfully; this was a test timing assumption, not a write failure.

Empty/all-archived and malformed legacy hierarchy cases have pure regression
coverage only. Backend authorization, direct rejected writes, lot-assignment
restrictions and database concurrency were not re-executed. Local UI success
is not module sign-off. Status is **Ready for retest**, pending merge, rebuild
of the normal frontend, and team acceptance. See frontend
`docs/storage-archive-display.md` for the visibility contract and rollout.

#### Post-merge normal-frontend recheck - 2026-10-21

Confirmed frontend PR #75 and backend PR #162 merged. Clean local develop
checkouts fast-forwarded to frontend `0ffa81f` and backend `29fe779`. The
existing signed-in browser on normal port 3000 now exposes the new archive
toggle; no server restart, build overwrite or authentication export was needed.
Actual served build hashes were not independently inspected.

Reran the read-only acceptance script against port 3000 using the same archived
cabinet/drawer fixtures. Default tree/search excluded archives; historical
toggle and reload, tree/search/breadcrumb/child badges, zero active versus one
archived child, child selection, old direct links, keyboard hide and active
fallback all passed. Archived mutation controls were absent, archived parent
options were excluded, and the audit link still returned one archive event.
The script reported zero page errors and performed no data mutations. Browser
remains open and signed in. Diagnostic script remains Git-ignored at frontend
`tools/browser/artifacts/storage-visibility-acceptance.txt`.

The presentation repair passes this post-merge browser check. DEF-010 stays
**Ready for retest** pending the unchecked combined protection criterion below
and team sign-off; no live backend write rejection, Inventory lot-assignment
test or concurrency claim is added. This follow-up changes documentation only;
`git diff --check` passed, and full local application suites were not rerun.

#### Isolated HTTP protection evidence - 2026-10-21

Added 16 HTTP characterization regressions on backend base `27db649`:
archived edit/move and create/move-to-archived-parent rejection, plus
create/edit/move/archive permission checks for signed-out, invalid-token and
developer callers. All pass through real controllers/validation/guards/service
with database/auth adapters mocked. Archived details remain readable; denied
calls write neither storage changes nor success audit events. Developer
security-denial audit writes are supported and asserted.

Storage HTTP suite passed 29/29. Full backend unit tests passed 690/690;
HTTP tests passed 313 with 17 skipped. TypeScript no-emit passed; lint had
zero errors and seven unused-disable warnings in unchanged files. Separate
full-suite audit-mock noise is recorded in DEF-017, not hidden as a clean run.
No runtime/schema/dependency/Inventory changes or live requests were made.
These are existing-behavior checks, not a red-to-green application repair.
PR CI owns build verification to preserve the running backend build output.

This adds isolated backend evidence only. Live database/concurrency and John's
lot-assignment restriction remain untested by this step; the combined protection
checkbox stays unchecked and DEF-010 remains Ready for retest pending that
criterion and team sign-off.

#### Reproduction

1. Select a disposable storage location that has an active child or specimen
   lot and confirm that archiving is rejected.
2. Resolve the dependencies, archive the child, and archive its parent.
3. Refresh the Storage Location page and inspect the hierarchy, selected
   record, and direct-child list.

#### Expected

Archived records remain available for history and audit purposes, but the
default live hierarchy contains active locations only. If archived records
are deliberately displayed, every tree node, search result, breadcrumb, and
child card clearly identifies them as archived and read-only. Active child
counts do not include archived children.

#### Actual

The selected detail correctly shows an `Archived` badge and its management
controls are read-only. However, the archived cabinet and its archived child
remain in the tree and direct-child section with the same visual treatment as
active locations. The parent also reports the archived record as a direct
child, despite the page describing the hierarchy as live.

#### Technical observation

- The Storage page requests lifecycle `ALL` rather than an active-only view.
- Hierarchy construction includes every returned unit.
- Tree nodes, search results, and direct-child cards do not render
  `archivedAt` state.
- The management form already excludes archived units from eligible parent
  choices, so mutation protection is working independently of this defect.

#### Required remediation

1. Prefer an active-only hierarchy by default with an explicit `Show
archived` control for historical lookup.
2. When archived records are shown, add consistent archived styling and a
   text badge in the tree, search results, breadcrumbs, and child cards.
3. Exclude archived children from active child counts/lists, or display them
   in a clearly separate archived subsection.
4. Keep archived records selectable and read-only; do not delete their data
   or audit history.
5. Continue excluding archived locations from parent selection and other
   active mutation targets.

#### Retest

- [x] The default tree and active child count exclude archived locations (local repair UI).
- [x] `Show archived` reveals historical locations with an unmistakable
      archived state.
- [x] Archived records remain readable and linked to audit history (local repair UI).
- [ ] Archived locations cannot be edited, moved, selected as a parent, or
      assigned new specimen lots.
- [x] Active hierarchy navigation and search remain unchanged (local repair UI).

### DEF-011 - Clear all feels slow and has no appropriate pending feedback

**Related test:** DEF-008 filter-reset retest
**Environment:** Local frontend development server
**Found on:** User-reported browser test; running frontend/backend commits not captured
**Severity:** S4 Minor (provisional; revise if measured delays block use)
**Priority:** P2
**Status:** In progress
**Owner:** Cataloging / Frontend

#### Partial repair evidence - 2026-10-07

Frontend branch `fix/cataloging-clear-filter-feedback` wraps only Clear all in
a navigation transition with busy text and an accessible non-modal loading
status. Repeated same-link navigation is guarded while pending. The fixed native
href, modified/new-tab clicks, history and query-keyed form reset are preserved.
No premature optimistic reset, authentication bypass, new queries or cache is
introduced. Existing data-load failures continue to use catalog fallback/retry.

Five focused transition-contract checks plus existing filter-reset regressions
cover the implementation. The catalog's session check and three parallel data
reads were inspected, but authenticated latency measurements were not captured.
Production/development timing, failure/navigation and visual pending retests are
documented in the frontend checklist. Feedback is implemented; speed is not
claimed improved. Keep In progress until investigation and retest complete.

#### Tester follow-up - 2026-10-09

The tester reports the latest UI fixes are working and accepts continuing
other acceptance tests while the filter delay remains. Previously reported
durations were approximately 700-800 ms for Clear all and 1490-1600 ms for
Apply. After the requested production-build comparison, the tester reports
the delay is still similar; exact request timings, running commits and a
network trace were not supplied. These are user-reported observations, not
instrumented backend measurements. Pending-feedback behavior passed the
reported retest; the performance concern is not resolved or signed off.

#### Reproduction

1. Apply Cataloging filters.
2. Click Clear all.
3. Observe the transition until the unfiltered results appear.

#### Expected

Show immediate, accessible pending feedback during any noticeable navigation
delay, then consistent cleared controls/results. Determine actual latency before
choosing performance changes; no response-time target is assumed.

#### Actual / evidence - 2026-10-07

The tester reports that filters clear successfully, but the operation feels slow.
Only the bottom-left development "Rendering" indicator provides feedback.
No timings, network trace or production comparison have been captured.
This is separate from DEF-008's original stale-control defect: its basic reset
was reported successful, but Apply-again and Back/Forward results were not
explicitly confirmed, so DEF-008 remains Ready for retest.

**Follow-up:** Tester subsequently confirmed Apply-after-clear and Back/Forward
restore the controls/results for the current page correctly. Clear all appears
only after filters are applied; this was understood and accepted as current
Apply-based behavior. The latency/pending-feedback issue remains Open.

#### Controlled browser follow-up - 2026-10-22

Frontend PR #77 was confirmed merged and its CI subsequently passed. Checkout
references: frontend `d4d216b`, backend `f99f545`; exact served hashes/mode were
not independently checked. Used temporary tabs in the existing signed-in
`biosphere-aud002` context. Read-only preflight found no eligible offline drafts
before opening the workspace, and again after the checks.

For `/specimens?status=UNCATALOGED&gender=UNKNOWN`, held only the unfiltered
catalog GET long enough to inspect actual pending UI, then released it:

- Clear all changed to **Clearing filters…**, with `aria-busy=true`,
  `aria-disabled=true` and the live status **Loading unfiltered specimen results…**.
- No blocking dialog opened. Applied status/gender values and the same rendered
  row text remained in place while the GET was held; no row values were exported.
- Repeated keyboard Enter activation during pending work still produced only
  one held unfiltered navigation request.
- On completion, URL and status/gender reset together, Clear all disappeared,
  and the catalog-unavailable message was absent. Collection/public-display
  controls remained blank; clearing nonblank values for those was not tested.
- Back restored the filtered status/gender; Forward restored the cleared state.
  Applying a new filter through the form, modified clicks, JavaScript-disabled
  navigation and backend failure recovery were not tested in this run.

Three separate samples did not hold/delay the catalog GET. Elapsed automation
time from Clear all activation through observed URL/control reset was **1200,
1989 and 1191 ms**. These include browser/automation polling and do not measure
backend-only query duration, first paint or time to pending feedback. Unfiltered
prefetch was suppressed. All non-GET requests were deliberately aborted: the
successful run blocked ten POST Server Actions on `/specimens`. Source inspection
shows the selected-cover preview uses a read-only Server Action; method alone
does not establish a record mutation. Its cover-loading behavior was excluded
from this filter-only diagnostic, not verified or declared broken.

An initial run rejected its own broad non-GET guard at the final assertion.
A separate sanitized request check identified POST `/specimens` with the
Server Action header present, without exporting header values/payloads. The
helper was adjusted to retain the block and explicitly record that condition;
the complete filter-only run then passed. This was not an app runtime fix or
a reproduced filter failure.

No draft was created or submitted, no record-edit form used, and no server
process or app/auth/Inventory code changed. Normal GETs may refresh the local
read-only cache. Probe tabs/routes were closed after releasing the held GET;
the original signed-in audit tab/URL remained intact. DEF-019's interruption
script remained disabled. Ignored frontend diagnostics:
`tools/browser/artifacts/def011-clear-navigation.txt` and
`tools/browser/artifacts/def011-request-classification.txt`.

**Disposition:** scoped pending/reset/history checks passed; DEF-011 remains
**In progress**. Restricted local samples are not an equivalent production
benchmark, proof of a speed improvement or full defect closure. A controlled
development/production comparison and sanitized upstream timings are still
needed before choosing an optimization. Documentation-only verification:
`git diff --check`; application suites/build were not rerun for this update.

#### Required investigation / remediation

1. Measure frontend navigation and backend request duration; compare development
   with a production build before attributing the delay to rendering or queries.
2. Provide appropriate pending feedback without showing results as updated early.
3. Optimize only demonstrated bottlenecks; preserve filters, authorization and
   consistency. No code changes made while recording this report.

#### Retest

- [ ] Noticeable navigation displays immediate accessible pending feedback.
- [ ] Cleared controls and records agree once navigation finishes.
- [ ] Apply again and Back/Forward do not revive stale filter values.
- [ ] Development/production timings and tested commits are recorded.

### DEF-012 - Save metadata and Set as cover lack visible hover feedback

**Related test:** CAT-011 / media-controls acceptance retest
**Environment:** Local frontend browser testing
**Found on:** User report; exact running commit not captured
**Severity:** S4 Minor
**Priority:** P2
**Status:** Ready for retest
**Owner:** Cataloging / Frontend

#### Repair evidence - 2026-10-07

Frontend branch `fix/cataloging-control-hover-feedback` replaces the undefined
forest-50 hover token on both buttons with the defined forest-100 token. Shared
button classes include enabled-only hover, visible keyboard outline and disabled
cursor/opacity. Submit actions, pending guards and authorization are unchanged.
Rendering checks cover both buttons; visual browser retesting remains required.

#### Reproduction

1. Open an active specimen's Media page with an existing image.
2. Hover Save metadata and Set as cover while the controls are enabled.

#### Expected

Enabled buttons provide visible hover feedback and accessible keyboard focus;
disabled or pending controls remain clearly distinguishable.

#### Actual / evidence - 2026-10-07

Tester reports neither button highlights/darkens on hover. No save or cover
mutation failure was reported. This is separate from native file-picker DEF-004.

#### Retest

- [ ] Both enabled buttons visibly respond to hover and keyboard focus.
- [ ] Pending/disabled states remain clear and do not imply the action is enabled.
- [ ] Metadata and cover mutations still save and persist after refresh.

### DEF-013 - CSV Choose file control lacks visible hover feedback

**Related test:** CAT-013 / import file selection
**Environment:** Local Cataloging import page
**Found on:** User report; exact running commit not captured
**Severity:** S4 Minor
**Priority:** P2
**Status:** Ready for retest
**Owner:** Cataloging / Frontend

#### Repair evidence - 2026-10-07

The same frontend branch shares Cataloging-only native-file interaction styles
between import and media pickers. CSV hover now uses forest-100, with keyboard
outline and distinct disabled/file-button states. Existing CSV accept/required
attributes, preview/import pending guards and validated import flow are preserved.
Rendering checks verify these contracts; browser appearance remains to be retested.

#### Reproduction

1. Open Cataloging Import.
2. Hover the enabled CSV Choose file control.

#### Expected / actual

The native file-selection button should give visible hover feedback. Tester
reports that it does not darken; choosing a file and previewing rows work.
This is the import picker, not the media picker covered by DEF-004.

#### Retest

- [ ] Enabled CSV file control responds visibly to hover and keyboard focus.
- [ ] Pending/disabled states remain distinct.
- [ ] File selection, preview validation and saving behavior remain unchanged.

### DEF-014 - Already-attached tag notice resembles successful new attachment

**Related test:** CAT-010 / duplicate tag relationship
**Environment:** Local specimen Tags page
**Found on:** User report; exact running commit not captured
**Severity:** S4 Minor
**Priority:** P2
**Status:** Ready for retest
**Owner:** Cataloging / Frontend

#### Repair evidence - 2026-10-07

Frontend branch `fix/cataloging-duplicate-tag-notice` distinguishes the existing
relationship outcome with an amber status notice and explicit Already attached —
no changes saved heading. New attachment/change/detachment notices stay green.
Text, not color alone, communicates the difference; the notice has role=status
and aria-atomic=true. Unknown query outcomes are ignored. No backend mutation,
duplicate prevention, shared vocabulary or revision behavior changes.
Nine focused page regressions cover notices, query handling and session gating.
Browser duplicate/revision and assistive-technology retests remain required.

#### Reproduction

1. Attach a tag to a specimen.
2. Submit the same name with different capitalization.
3. Observe the feedback after the duplicate-safe operation.

#### Expected / actual

No duplicate relationship should be created (confirmed working). The notice
should clearly distinguish an existing relationship from a newly saved one.
Tester reports the notice is green and resembles an attachment confirmation.

#### Recommended remediation

Use explicit wording such as Already attached - no changes saved, with an
accessible informational/warning treatment near the attachment workflow.
Do not rely only on color or mark a valid existing tag as erroneous. Preserve
backend duplicate prevention, shared vocabulary and no-op history behavior.

#### Retest

- [ ] Duplicate attachment has distinct, understandable no-change feedback.
- [ ] New attachment retains success feedback.
- [ ] No duplicate relationship or misleading new revision is created.
- [ ] Keyboard/screen-reader users can perceive the notice.

### DEF-015 - Audit HTTP fixture omits the security-audit create method

**Related test:** AUD-001; `test/audit.e2e-spec.ts`
**Environment:** Isolated mocked Nest HTTP integration test, not live data
**Found on:** backend `021fe0e`, 2026-10-19
**Severity:** S3 Moderate (test-harness/coverage defect, not proven production impact)
**Priority:** P2
**Status:** Ready for retest
**Owner:** Audit test fixture; coordinate with Voltaire for auth-event contract

#### Reproduction

1. Run `npm run test:e2e -- --runInBand --runTestsByPath test/audit.e2e-spec.ts`.
2. The developer-token request is denied by the real RolesGuard.
3. SecurityAuditService attempts to write ACCESS_DENIED through the Prisma mock.

#### Expected

The mock supports the security-audit write, and the test asserts the denial
event's actor/action/result without calling a live database or logging an
unexpected failure. The request remains denied.

#### Actual and evidence

All 5 tests passed, but output included `Could not record ACCESS_DENIED (DENIED)`
and `this.prisma.audit_log.create is not a function`. The fixture defines audit
read/count delegates only. SecurityAuditService catches audit-write errors, so
403 passing does not prove the denial was recorded. No live failure is claimed.

#### Suspected scope and retest

Limit the follow-up to the Audit test fixture and contract assertions. Do not
weaken authorization, silence unexpected errors, or change auth production code
without coordination. Rerun the original command and confirm:

- [x] 401/403 expectations remain enforced in the focused suite.
- [x] The denial event is observable through an authorized HTTP read, with the
  expected test actor, action, result, record, reason, role, method, and path.
- [x] No missing-mock audit error appeared in the full focused rerun; all 6
  Audit HTTP tests and all 6 service tests passed.
- [x] Prisma/Supabase remain mocked; no live providers or writes introduced.

#### Repair and automated regression evidence - 2026-10-19

Added a failing HTTP regression first: a developer GET remains 403, then a
curator GET must expose the resulting ACCESS_DENIED event. Before the fixture
fix, that regression failed because only the seeded event was returned, and
the original missing-create error appeared. Added only the missing Prisma
create delegate backed by the same per-test in-memory store used for reads
and counts. The full Audit HTTP suite then passed 6/6 without the missing-mock
error; service tests passed 6/6. Production guards and SecurityAuditService
were not changed, no logging was silenced, and no live database was used.
Independent reviewer retest remains pending; this is not live persistence proof.

### DEF-017 - Storage-inventory denial fixture omits security-audit persistence

**Related test:** `test/storage-inventory.e2e-spec.ts`, developer denial case
**Environment:** Isolated mocked Nest HTTP test; not live Inventory data
**Found on:** backend base `27db649`, 2026-10-21
**Severity:** S3 Moderate (test-harness/coverage defect; no proven production failure)
**Priority:** P2
**Status:** Open
**Owner:** John / Inventory test fixture; coordinate with Voltaire for auth audit

#### Reproduction and evidence

Run `npm run test:e2e -- --runInBand storage-inventory.e2e-spec.ts -t developer`.
The single selected test passes its 403 expectation (four other tests skipped),
but SecurityAuditService logs `Could not record ACCESS_DENIED (DENIED)` and
`Cannot read properties of undefined (reading 'create')`. The fixture replaces
PrismaService without an `audit_log` delegate. The real RolesGuard attempts
the denial audit; SecurityAuditService catches the mock failure, preserving
the 403. A green denial test therefore does not prove audit recording.

The full HTTP suite also emitted missing-audit mock errors; not every message
was attributed to a suite. This entry claims only the focused reproduction.
It is the same class of fixture gap as DEF-015/016, but in a different fixture.
No Inventory application or test code was modified during discovery.

#### Recommended owner follow-up and retest

Provide the missing database-boundary audit delegate and assert the expected
developer denial event, actor, result and request metadata. Preserve the real
guards and existing 401/403 behavior; do not silence the error or bypass auth.

- [ ] Focused developer denial still returns 403 and observes the denial audit.
- [ ] Full storage-inventory HTTP suite passes without missing-mock audit errors.
- [ ] No live providers, data writes or authorization weakening introduced.

### DEF-018 - CSV commit success status differs from Swagger declaration

**Related test:** CAT-013; `test/specimens.e2e-spec.ts` reviewed CSV workflow
**Environment:** Isolated real Nest HTTP application with mocked adapters
**Found on:** backend base `304dee0`, 2026-10-22
**Severity:** S4 Minor (API documentation inconsistency)
**Priority:** P3 (nonblocking; no import failure observed)
**Status:** Ready for retest
**Owner:** Kyer / Cataloging

At discovery, selected-row commit and retry returned HTTP 201. The controller's
`POST /specimens/import/commit` declares `@ApiOkResponse` (200), with no
`@HttpCode` override. Both successful import behavior and retry checks pass;
this is not a data-integrity or duplicate-import failure. No runtime status
change is authorized or required by this finding.

Recommended follow-up: align the Swagger success declaration with the
established 201 response, retaining its response DTO, and verify the generated
operation. If the team instead chooses 200, explicitly review caller
compatibility and the desired contract before changing runtime behavior.

#### Correction and scoped verification - 2026-10-22

On backend base `d832885`, replaced only the commit success documentation with
`@ApiCreatedResponse`, retaining `SpecimenImportCommitResult`. No `@HttpCode`,
service, permission, transaction, import behavior or Inventory code changed.

An isolated Nest application containing the real import controller and a stub
import service generated Swagger before and after the correction. The original
operation declared only `200`; the corrected operation declares only `201`
with the same `#/components/schemas/SpecimenImportCommitResult` response schema.
No service methods, live providers, listening ports or database were used in
this diagnostic. This was a one-off generated-contract check, not a newly
maintained Swagger regression test or proof of the deployed `/docs` output.

The existing protected Cataloging HTTP suite passed **49/49** after the change,
including selected-valid-row commit and same-preview retry returning `201`.
That suite uses real controllers/services with mocked database/auth adapters;
it does not establish live database concurrency or independent acceptance.
The targeted commit/retry case also passed before the correction, confirming
the existing HTTP behavior was not the defect.

Import-service unit regressions passed **40/40**. Their intentionally injected
`connection reset` case emitted its existing server-side error log while
asserting that the returned row error does not expose those internals; this
was not a live connection failure. TypeScript `--noEmit --incremental false`
and `git diff --check` passed. `npm run lint:ci` completed with zero errors
and seven existing unused-disable warnings in untouched files. Full backend
suites/build and live Swagger retest were not run locally for this metadata-only
change; PR CI runs the normal suites/build separately.

- [x] Isolated generated Swagger response and actual tested commit response agree.
- [x] Selected-row commit and same-preview retry remain correct in the isolated HTTP suite.
- [ ] Independently verify the merged/deployed Swagger operation; status remains Ready for retest.

## 4. New defect template

Copy this section for each new failure:

```markdown
### DEF-XXX - Short, observable problem

**Related test:** TEST-ID
**Environment:** Development
**Found on:** frontend commit / backend commit
**Severity:** S1-S4
**Priority:** P0-P3
**Status:** Open
**Owner:** Module / person

#### Preconditions

#### Reproduction

1.
2.
3.

#### Expected

#### Actual

#### Evidence

#### Suspected scope

#### Retest

- [ ] Original reproduction no longer fails.
- [ ] Negative and regression cases pass.
```

When a defect is fixed, update its status to `Ready for retest`. A tester then
records the tested commit and changes it to `Verified`; do not erase the entry.

## 5. Observations awaiting reproduction

These are recorded signals, not confirmed application defects or closed issues.
Promote an observation to a DEF entry when reproduction establishes an
application failure; retain the original observation and cross-reference it.

### OBS-001 - Local revision-history navigation exceeded the browser deadline

**Observed:** 2026-10-21 during AUD-002 media replacement/removal testing
**Checkout references:** frontend `e43e7fc`, backend `39b9aac`; served build
revisions not independently verified
**Environment:** Local frontend/backend with signed-in isolated Edge
**Disposition:** Not reproduced in local follow-ups or the bounded dev/production-mode comparison on 2026-10-24; backend timing correlation and final owner disposition remain pending, not resolved
**Owner:** Cataloging frontend/backend; no auth or inventory changes authorized
**Priority:** P2 follow-up; application severity not assigned without reproduction

A `page.goto` to the disposable specimen's revision history exceeded the
diagnostic's 30-second `load` deadline. A subsequent read saw the document
still loading, initially no headings/rows, and then a rendered revision.
Both local app ports were listening and a public login-page check returned 200.
Once rendered, history still had eighteen revisions and no replacement/removal
events: no mutation was blindly repeated. No data loss was observed.

The baseline-guarded test was rerun with explicit DOM readiness, existing
element waits, and a 60-second navigation ceiling; its 78 functional assertions
passed. This is a harness robustness adjustment, not evidence that the original
delay was fixed or that page performance meets a target. Root cause (server,
upstream/database latency, development compilation, browser resources, etc.)
was not determined. No response-time requirement is invented from the timeout.

Follow-up (read-only; preserve auth/header privacy):

- [x] Repeat history navigation and measure document/rendered-history readiness separately (2026-10-22; samples below).
- [x] Record a bounded warm-development/local-production-mode comparison (2026-10-24; below). This is not an identical-build causal benchmark.
- [ ] Correlate frontend/backend request timing without exporting tokens or records.
- [ ] If reproducible, define the affected behavior/expected target and open a
  linked defect; otherwise record evidence for the final disposition.

#### Read-only follow-up - 2026-10-22

PR #170 was confirmed merged with successful CI. Checkout references were
backend `5d07a58`, frontend `bc55ce7`; exact running build hashes/mode were not
independently verified. Used the existing signed-in Edge context, first checking
that fixture `5b8e55d4-af0f-4263-9b0e-349b4b314f20` still had common name
`TEST - AUD-002 Trace 20261021` through the protected specimen read.

A temporary tab in that context navigated to the fixture history three times.
Times below are elapsed milliseconds observed by the automation from starting
navigation, not an approved performance threshold or backend-only timings.
Rendered-history readiness awaited both the heading and first visible entry;
the entry timestamps/values were then read and compared in memory.

| Sample | Response committed | DOM ready | History readiness observed | Load observed | Visible revisions |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 572 | 1174 | 1477 | 1194 | 21 |
| 2 | 706 | 1115 | 1599 | 1121 | 21 |
| 3 | 524 | 876 | 945 | 878 | 21 |

All history documents returned 200. Browser navigation timings separately
reported response start/end at 554/1158, 680/1102 and 499/863 milliseconds.
Those response timings include the local frontend/auth/upstream path; they
do not identify an individual backend query's duration or explain the old delay.
Locator polling/automation overhead is included in the observed history
readiness timings, not a measurement of first paint or interactive hydration.

All three reads contained the same 21 timestamp/value entries. This is the
current fixture baseline, not an assertion that the earlier 18-entry baseline
should persist after subsequent legitimate tests. The probe tab observed zero
POST/PUT/PATCH/DELETE requests and was closed afterward. The original signed-in
audit tab and URL remained intact. No auth state, headers, revision values or
private media URLs were exported. No records or server processes were changed.
Ignored diagnostic: frontend `tools/browser/artifacts/obs001-history-timing.txt`.

The earlier 30-second delay was **not reproduced**; this does not resolve its
cause, prove production performance, measure a controlled cold start, or close
OBS-001/full AUD-002. No speculative performance change was made. Retained-tab
notification console errors were investigated separately below, not attributed
to revision history. Documentation-only verification: `git diff --check`;
application suites/build were not rerun for this evidence update.

#### Confirmed local production-mode follow-up - 2026-10-24

Port 3000's listener and process ancestry identified an existing `next start`
server, not `next dev`; only sanitized mode flags were recorded. Ports 3000 and
3001 were left running unchanged, and port 3002 had no listener. Reused the
existing signed-in Edge session and the same identity-guarded TEST specimen
`5b8e55d4-af0f-4263-9b0e-349b4b314f20`. A separate probe allowed only GET/HEAD.

| Sample | Response committed | DOM ready | History readiness observed | Load observed | Visible revisions | Response start/end |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 512 ms | 813 ms | 870 ms | 815 ms | 22 | 496/804 ms |
| 2 | 430 ms | 981 ms | 1306 ms | 993 ms | 22 | 413/974 ms |
| 3 | 419 ms | 663 ms | 796 ms | 664 ms | 22 | 399/656 ms |

All documents returned 200, with identical timestamp/value snapshots across
the three reads. The 22-entry count is this run's baseline, not an assertion
that earlier snapshots must remain unchanged after legitimate later edits.
No probe page errors or non-read requests occurred. Temporary tabs closed;
the original Audit tab stayed signed in and unchanged. Revision values,
credentials, headers and auth state were not exported.

This supplies a confirmed local production-mode sample, not the missing
controlled dev/production comparison. The server was already running: no
cold-start, exact served-build revision or production deployment claim is made.
Frontend document timings still include authentication/upstream/browser and
automation costs, not isolated backend-query timings. No response target is
invented and no speculative fix is justified by this non-reproduction.
OBS-001 remains open pending comparison/timing correlation and disposition.
Diagnostic: ignored frontend `tools/browser/artifacts/obs001-production-history-timing.txt`.
No app code or records changed; documentation verification: `git diff --check`.

#### Approved development-mode comparison - 2026-10-24

After explicit approval, started a temporary `next dev` server bound only to
`127.0.0.1:3002`, leaving the existing `next start` frontend and backend alone.
The dev checkout was frontend `417b0c6`; the production server's exact served
revision was not established, so differences cannot be attributed solely to
mode. Next used its separate `.next/dev` artifacts; no production rebuild or
cache purge was performed.

The existing browser session accessed `localhost:3002` through normal browser
session handling. No cookie/token was copied, exported or entered by the
diagnostic, and manual login was not needed. The same guarded TEST specimen
and GET/HEAD-only history probe were used. One route warm-up was kept separate:
history readiness was observed at **2386 ms**, not asserted to be a clean cold
start because existing compiler/filesystem caches were retained.

| Warm dev sample | Response committed | DOM ready | History readiness observed | Load observed | Visible revisions | Response start/end |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 577 ms | 1236 ms | 1439 ms | 1237 ms | 22 | 553/1213 ms |
| 2 | 548 ms | 975 ms | 1431 ms | 976 ms | 22 | 520/957 ms |
| 3 | 518 ms | 907 ms | 1379 ms | 908 ms | 22 | 489/888 ms |

Observed readiness ranges were **796-1306 ms** for local production mode and
**1379-1439 ms** for warm development (three samples each). The 30-second delay
was not reproduced in either run. An additional read-only cross-mode check
confirmed identical timestamps/values for all 22 visible revisions. Neither
probe observed page errors or mutation attempts; the original Audit tab stayed
open and unchanged. These small samples do not define a response-time target,
explain the original event or establish deployed production performance.

Dev server diagnostics reported a shared header-logo LCP/loading advisory.
It did not prevent rendering; no link to the original delay is established.
Record it as a nonblocking advisory, not a newly reproduced functional defect;
no shared header/Dashboard component was changed. The printed Next request
durations are frontend runtime timings, not isolated Nest/database timings.

Closed the temporary probe tabs and stopped only the task-owned dev process.
Port 3002 had no remaining listener; ports 3000/3001 retained their original
listener PIDs, and the existing frontend login page returned HTTP 200. The
frontend worktree stayed clean. No records, account settings, dependencies or
runtime source changed. Diagnostic scripts remain ignored under frontend
`tools/browser/artifacts/obs001-dev-history-timing.txt` and
`obs001-cross-mode-history-check.txt`.

The local mode-comparison task is complete. OBS-001 remains **not reproduced,
pending final disposition**, rather than Fixed/Verified: backend timing
correlation, exact-build comparison and owner acceptance have not been supplied.
No speculative performance fix was made. Documentation check:
`git diff --check`; full app suites/build were not rerun.

### OBS-002 - Retained curator tab reported transient notification polling errors

**Observed:** 2026-10-22 during OBS-001 follow-up
**Checkout references:** backend `5d07a58`, frontend `bc55ce7`; served hashes unknown
**Disposition:** Two retained-session console errors observed; one subsequent read recovered; cause unverified
**Owner:** Dashboard/notification feed owners (John/Charles); coordinate shared backend responsibility
**Scope:** Observation/handoff only; no notification or authentication code changed

The retained browser session reported two resource failures for local
`/api/notifications`, both HTTP 502, approximately 60 seconds apart in the
session-relative console timestamps. These were on the original tab's feed,
not failed revision-history document responses. No response contents, request
headers or notification records were exported.

One subsequent authenticated GET to the same local route returned HTTP 200.
Source inspection shows that its proxy maps non-4xx upstream failures to 502;
this does not establish whether these two failures were upstream HTTP errors,
connection failures or another exception. Do not assume a cause or mark the
notification module passed/failed from this limited observation.

If recurring, the dashboard/feed owners should correlate polling timestamps
with sanitized frontend/backend logs and verify visible error/retry behavior.
Keep this separate from OBS-001; a causal connection has not been established.
Ignored read-only diagnostic: frontend
`tools/browser/artifacts/obs002-notification-read.txt`. No broader module work
was undertaken, and no known records or running processes were modified.

### OBS-003 - Isolated HTTP tests log missing security-audit mock adapters

**Observed:** 2026-10-24 consolidated backend regression, checkout `44b661d`
**Disposition:** Test-harness coverage limitation; no live audit failure established
**Owner:** Backend test maintainers / relevant module owners

The full isolated HTTP run passed 26 suites / 337 tests, but emitted repeated
`SecurityAuditService` errors during authorization rejection: accessing
`audit_log.create` on an undefined mock adapter. Source inspection found several
HTTP fixtures without an `audit_log` adapter, including `auth.e2e-spec.ts`;
individual emitted events were not mapped to every originating test.

Authorization assertions can pass because security-audit failures are caught;
these fixtures therefore do not establish denial-event persistence. The dedicated
Audit HTTP suite separately has an adapter and authorized readback coverage.
This is not evidence that the live database loses audit entries, nor a reason
to suppress the logger or change production authorization. Follow up by adding
appropriate external-adapter fixtures and public HTTP readback where persistence
is claimed; do not silently treat a no-op mock as persistence proof.

No harness/runtime fix was made in this checkpoint. The live Developer suite
was explicitly excluded. No museum record or account was changed. Results are
linked from the acceptance plan; documentation verification: `git diff --check`.
