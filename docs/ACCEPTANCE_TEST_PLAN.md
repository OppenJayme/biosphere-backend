# BioSphere Acceptance Test Plan

**Status:** Active testing  
**Environment:** Development / Supabase development project  
**Started:** 2026-09-29  
**Defects:** [TEST_DEFECT_LOG.md](./TEST_DEFECT_LOG.md)

## Start here

For the current grouped queue, owners and ready-to-send teammate messages, use
the [2026-10-24 completion handoff](./COMPLETION_HANDOFF.md). It supersedes stale
task-selection instructions below, not historical evidence or acceptance statuses.

Use this page as a checklist, not a requirement to repeat every historical run.
This navigation checkpoint summarizes recorded evidence as of **2026-10-22**;
the linked register rows and dated notes retain the exact results and limits.
It changes no acceptance or defect status.

| What you need | Where to go / current checkpoint |
| --- | --- |
| What already passed? | [Cataloging register](#cataloging-management): draft/core/taxonomy, provenance dates, completion/reopening, public eligibility, tags, filtering and core-only CSV have recorded passing coverage. Some rows retain explicit subcase or independent-sign-off gaps; this is not whole-module acceptance. |
| What is still pending? | [Remaining completion queue](#remaining-completion-queue-owner-scope-only), then the relevant [Storage](#storage-location-management), [Offline](#limited-offline-and-synchronization), [FAQ](#faq-knowledge-management) or [Audit/backup](#audit-and-backup-history) row. Choose an uncovered requirement, not an optional enhancement. |
| What must not be rerun yet? | [DEF-019 containment gate](./TEST_DEFECT_LOG.md#def-019---tab-interruption-diagnostic-failed-its-no-backend-write-guard): shared-backend tab-interruption diagnostics remain stopped until an isolated target and independent containment are approved. Earlier offline subcase passes do not clear this gate. |
| What needs another person or a safe environment? | [Ownership](#3-module-ownership): John prepares Inventory-owned lot/placement evidence; FAQ activation/public tests need approved policy and an isolated setup; real [backup/restore](./BACKUP_HISTORY_GUIDE.md) stays Deferred until its procedure and disposable environment are approved. Do not manufacture fixtures in another owner's module. |
| How do we find or report a bug? | [Defect summary](./TEST_DEFECT_LOG.md#2-summary) has current statuses; its linked IDs open the detailed evidence. Use the [defect template](./TEST_DEFECT_LOG.md#4-new-defect-template) for a reproducible issue, or [observations](./TEST_DEFECT_LOG.md#5-observations-awaiting-reproduction) for an unconfirmed symptom. |
| When do we finish? | Apply the existing [completion criteria](#12-completion-criteria), then [sign-off](#13-sign-off): critical/major cases and important failure/retry paths pass, blocking defects are resolved, regressions are green, deferrals are explicit, and owner plus teammate acceptance is recorded. |

Before the next session, check [entry criteria](#6-entry-criteria) and select
one safe outstanding case. Record its result once at the relevant evidence
location, update its register row if warranted, and link rather than copying
the same run into multiple guides. Historical failures are not new failures;
`Ready for retest` is not `Verified`, and a passing mock is not live acceptance.

## 1. Purpose

This document is the shared guide for validating BioSphere after initial
feature implementation. It defines ownership boundaries, test order, required
evidence, and acceptance criteria. Passing unit tests or CI alone does not mean
a workflow is accepted; important flows must also be exercised through the
frontend against the development backend and database.

The current phase is **integration, acceptance testing, and refinement**.
Testers should report defects instead of silently changing data or expanding a
module beyond its approved ownership.

## 2. Sources of truth

Test behavior against these sources, in priority order:

1. Approved team/curator business decisions and the SRS.
2. Frozen database conventions and module guides under `docs/`.
3. Backend API and Swagger contracts.
4. Frontend behavior.

If these disagree, record a defect or decision request. Do not guess a new
business rule during testing.

## 3. Module ownership

Ownership identifies the primary implementer and reviewer. Shared workflows
still require coordination, but a test fix must not absorb another member's
module without agreement.

| Owner             | Primary modules                                                                                                                                                                                                      |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Charles Boquecosa | Curator Dashboard; Visit Request Management; General Inquiry Management; Public Museum Website; shared Backend Management                                                                                            |
| John Gerozaga     | Curator Dashboard; Specimen Inventory Management; Reports and Data Export; General Inquiry Management; Public Museum Website; project coordination                                                                   |
| Kyer Jayme        | Cataloging Management; Storage Location Management; Controlled Knowledge-Based FAQ Assistant; Audit Log and Backup/Restore Management; Limited Offline Record Caching, Draft Synchronization, and System Integration |
| Voltaire Ratilla  | Authentication and Access Control; Exhibit and QR Content Management; Public Museum Website; QR Exhibit and WebAR; shared Backend Management                                                                         |

### Cataloging and Inventory boundary

- **Cataloging:** specimen core record, taxonomy, provenance, catalog status,
  completion/reopening, tags, media, import, and catalog search.
- **Storage Location Management:** storage hierarchy, parent-child rules,
  specimen-holding capability, and storage lifecycle.
- **Specimen Inventory Management:** lots, quantities, condition, placement,
  transfers, movements, and inventory transaction history.

Cataloging may display and validate the existence of an active lot. It must not
create movement or quantity behavior owned by Specimen Inventory Management.

## 4. Test roles

- The module owner performs the first functional and negative test pass.
- A teammate performs an independent acceptance pass for critical workflows.
- The author of a fix must not mark their own defect `Verified` without a
  repeatable test result or reviewer confirmation.
- Security, data-loss, authorization, and cross-module defects must be raised
  immediately and should not be worked around silently.

## 5. Test environment and data safety

- Use only the Supabase development project and test accounts.
- Never paste passwords, service-role keys, access tokens, or connection
  strings into this document, screenshots, or GitHub issues.
- Prefix disposable records clearly, for example `TEST - Entomology`.
- Do not manually delete records that may be referenced by specimens, lots,
  exhibits, history, or audit records.
- Capture record UUIDs when they help reproduce a defect, but remove personal
  information from evidence.
- Test backup/restore only when an approved disposable database and restoration
  procedure exist.

## 6. Entry criteria

Before starting a test session:

- [ ] The relevant pull requests are merged and CI is green.
- [ ] Backend and frontend are on clean, current `develop` branches.
- [ ] Dependencies and Prisma Client are current.
- [ ] Backend unit, E2E, lint, and build checks pass.
- [ ] Frontend unit, lint, and build checks pass.
- [ ] A valid active curator test account is available.
- [ ] The tester knows which records are disposable.

### Consolidated automated regression checkpoint - 2026-10-24

Executed against backend `44b661d` and frontend `417b0c6`, without runtime
source changes, dependency installation, builds, server restarts or browser
interaction:

| Check | Command | Result |
| --- | --- | --- |
| Backend unit | `npm test -- --runInBand` | 53 suites, 690 tests passed |
| Backend isolated HTTP | `npm run test:e2e -- --runInBand --testPathIgnorePatterns=developer.e2e-spec.ts` | 26 suites, 337 tests passed; live Developer file explicitly excluded |
| Frontend | `npm test -- --maxWorkers=2` | 62 files, 366 tests passed |

The frontend's first attempt failed before executing tests with a Windows
sandbox `spawn EPERM`; the approved retry outside that restriction passed.
This is not an application regression. Backend unit output includes deliberate
failure-path diagnostics; the HTTP run also exposed incomplete security-audit
mock adapters, tracked as [OBS-003](./TEST_DEFECT_LOG.md#obs-003---isolated-http-tests-log-missing-security-audit-mock-adapters).
Green request assertions do not establish audit persistence in those fixtures.

This checkpoint verifies the existing automated suites together, not live
database/provider behavior, builds, CI, merged deployment, concurrency or final
module acceptance. Lint was not rerun in this checkpoint (the preceding focused
test change had targeted lint evidence). No acceptance row or defect is promoted
solely from these results. Before further live acceptance, merge the pending
work through PR/CI and confirm the running build, then choose an uncovered case
from the owner queue; independent sign-off and explicit safety/policy gates remain.

### Merged frontend runtime refresh - 2026-10-24

Verified frontend PR #78 and backend PRs #181/#182 merged. Post-merge frontend
CI run `40077400871` and backend CI run `40077423810` completed successfully.
Both local repositories were fast-forwarded to clean `develop`: frontend
`d38476b`, backend `735d4d1`. This does not establish the backend process's
served source revision; it was deliberately not rebuilt or restarted.

After explicit approval for a frontend-only outage, verified and stopped the
old port-3000 Next production process (PID 3588). Preserved its `.next` build
for recovery. The initial placement under the ignored browser-artifact folder
was picked up by the project's broad TypeScript include before relocation;
that build failed with generated-validator import errors. This was an operator
backup-placement error, not a source regression. The recovery copy now lives
outside both repositories at workspace sibling
`biosphere-frontend-build-recovery-20261024`; it may contain private generated
artifacts and must not be committed, uploaded or served. No recovery files were
deleted, and no application or TypeScript configuration was changed.

A second `npm run build`, with the recovery copy outside the source tree,
passed compilation, TypeScript and page generation. Started `next start` on
port 3000 as a hidden background process, PID 21052. Build ID:
`l4aSSUwwq2D41IdpX_t9G`. Fresh `/login` GET returned 200 with the expected sign-in
page. Listener checks confirmed port 3000 belonged to PID 21052 and backend
3001 retained PID 36052. Frontend worktree remained clean. Browser windows,
credentials, account configuration and museum records were not manipulated.

The refreshed frontend is ready for post-merge live testing. This operational
smoke check does not itself verify DEF-020, authenticated page recovery,
service-worker freshness or other acceptance cases. Existing tabs may retain
older client assets until refreshed; no automatic browser reload or offline
draft synchronization was initiated. Startup logs remain local under ignored
`tools/browser/artifacts/frontend-refresh-20261024.*.log`. The previous build
remains available for a separately scoped recovery operation if needed.

## 7. Recommended execution order

Run tests in this order because later workflows depend on earlier records:

1. Authentication smoke test.
2. Collections and specimen draft creation.
3. Specimen core editing and revision history.
4. Taxonomy and provenance.
5. Catalog-readiness and completion.
6. Reopening and protected required fields.
7. Tags and media.
8. Search, filtering, duplicate warnings, and CSV import.
9. Storage Location Management.
10. Offline caching, draft synchronization, and retry behavior.
11. FAQ knowledge management.
12. Audit-log and backup-history views.
13. Authorization, invalid input, network failure, and regression pass.

## 8. Kyer Jayme acceptance register

Record each result as `Not run`, `In progress`, `Pass`, `Fail`, `Blocked`, or `Deferred`.
Every `Fail` must reference an entry in the defect log.

### Status reconciliation - 2026-10-22

The tables below are current coverage summaries, not immutable records of the
first run. Dated evidence paragraphs retain the original failures, repairs and
test limits. A passing subcase does not pass the entire row, and an old failure
is not evidence that the repaired workflow is still broken today.

This documentation-only review uses recorded guides/browser runs plus earlier
tester confirmations in the project conversation. Those conversation reports
did not consistently capture execution dates, commits, exact case coverage or
independent review; they are identified as reports, not newly replayed tests.
No missing evidence is manufactured; this reconciliation alone promotes no
defect to Verified. Subsequent verification sessions are recorded separately.

Evidence reconciled:

- Collections: tester reported the exact/case/space/rename collision checklist
  successful. DEF-001's database-index deployment, concurrent collisions and
  data/audit guarantees still require evidence; the original failure is retained.
- Provenance: tester reported future-date input blocked, valid saving and
  revision history working. This does not establish direct API/import bypass
  rejection or readiness behavior for a legacy future date (DEF-002).
- Catalog media/tags/filters: tester reported successful persistence/removal,
  cover preview, reusable suggestions, duplicate no-op feedback and filter reset/
  browser history. Later supervised AUD-002 evidence independently covers the
  recorded tag/media operations. Full failure, privacy, accessibility and
  remote-LAN cases are not inferred from those reports. DEF-011 timing remains
  a refinement item, not proof that filtering is functionally broken.
- CSV: tester reported mixed preview with two valid/one invalid row and later
  continuation successful. The short confirmations do not independently prove
  preview non-mutation, every invalid-field variant or retry-safe commit;
  those remain explicit gaps under CAT-013/DEF-009.
- Duplicates: [CAT-014 evidence](./SPECIMEN_DUPLICATES_GUIDE.md#cat-014-verification-evidence---2026-10-12)
  replaces the stale PR-blocked status, but preserves archived-policy and
  browser failure/retry gaps. Dashboard enhancements remain with their owners.
- Offline: [manual and automated evidence](./OFFLINE_SYNC_GUIDE.md#acceptance-and-recovery-evidence---2026-10-17)
  and the [live lost-response pilot](./OFFLINE_SYNC_GUIDE.md#live-lost-response-pilot---2026-10-18)
  replace the stale Not run statuses. Each guide's limitations still apply.
  OFF-001's wording is aligned with the documented limited-offline contract:
  an open workspace cache is not a replay of protected HTML after navigation.
  This is a checklist clarification, not new offline functionality or scope.
- Storage: the dated post-merge browser recheck and HTTP regressions below
  establish separate UI and isolated-backend evidence. Inventory lot-assignment
  and live concurrency are not counted as tested by Cataloging/Storage checks.
- Restoration: [CAT-016 verification](./CATALOG_RESTORATION_VERIFICATION.md)
  supersedes the historical unimplemented-restore checkpoint below. It does not
  prove the live Cataloged restoration branch or close all audit lifecycle work.

#### Remaining completion queue (owner scope only)

**2026-10-24 update:** Read the [completion handoff](./COMPLETION_HANDOFF.md)
before selecting work from this older queue. Date/import/readiness and the
approved completion/reopening/eligibility audit batch below now have evidence;
do not repeat them as though untested. Owner merged-build duplicate failure/retry
also passed, and DEF-018's declaration mismatch is Verified. Independent review,
explicit policy/environment gates and the remaining precise subcases still apply.

1. Close the identified Cataloging gaps, not every previously passed happy path:
   date/API/import/readiness cases, reviewed CSV commit/retry evidence, remote
   LAN interaction and relevant media/error/privacy checks. Verify collection
   migration/concurrency evidence before treating DEF-001 as closed; any live
   migration or destructive test needs its own approved procedure/environment.
2. Complete Storage protection sign-off with John for the Inventory-owned
   lot-assignment criterion. Do not add lot management to Cataloging or change
   John's module to manufacture a passing fixture.
3. Finish offline interruption/session-expiry and remaining recovery cases from
   the guide. Do not repeat the already-recorded lost-response pilot as though
   it were untested; any destructive interruption uses a disposable draft.
4. Record FAQ matching/fallback and duplicate-policy decisions, then test the
   remaining lifecycle/public assistant cases in a confirmed isolated setup.
   Do not activate arbitrary test answers in a publicly used knowledge base.
5. Finish audit completion/reopening/public-eligibility traceability using an
   Inventory-owner-prepared specimen. Cover the remaining audit access/failure
   cases, backup-history positive-data cases and observation OBS-001. Real
   backup/restore remains Deferred until a safe procedure/environment is approved.
6. Run one final scoped integration/regression pass; resolve blocking defects,
   document explicitly accepted deferrals and obtain owner/teammate sign-off.

Do not expand this queue with optional enhancements or new features without
an approved requirement. Passing unit/HTTP/CI checks support acceptance; they
do not replace live evidence or independent sign-off. DEF-017 is a documented
John/Voltaire test-fixture handoff, not permission to absorb Inventory work.

### Cataloging Management

| ID      | Test                                                                           | Expected result                                                                                            | Status                                                                |
| ------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| CAT-001 | Create and rename a collection; retry the same normalized name                 | Valid unique names save; duplicates are rejected clearly                                                   | In progress; collision UI retest reported passed; database/concurrency evidence pending (original Fail - DEF-001) |
| CAT-002 | Create complete and incomplete specimen drafts                                 | Both start `UNCATALOGED`; public display is off                                                            | **Pass**                                                              |
| CAT-003 | Edit specimen core fields and submit an unchanged form                         | Changes persist with revision history; no-change submission is rejected clearly                            | **Pass**                                                              |
| CAT-004 | Create and edit taxonomy                                                       | One taxonomy record exists; draft values and revisions persist                                             | **Pass**; completion requirement remains under CAT-006                |
| CAT-005 | Create and edit provenance; reject invalid dates                               | Values and revisions persist; empty values normalize; future collection dates are rejected                 | **Pass** for live date create/update/readback/rejection/history plus earlier recorded provenance checks; DEF-002 Verified; independent module sign-off pending |
| CAT-006 | View readiness with missing and complete requirements                          | Every approved rule reports the correct pass/fail state and fix location                                   | **Pass** for recorded incomplete and [fully-ready live UI](./CATALOG_COMPLETION_GUIDE.md#approved-fully-ready-fixture-and-history-check---2026-10-23), Fix links/button/reload behavior plus 22 existing regressions; independent module sign-off pending |
| CAT-007 | Complete Cataloging with one prepared valid active lot                         | Status becomes `CATALOGED`; public display remains off; history/audit are written                          | **Pass** for recorded lifecycle behavior; DEF-002 date regression Verified; independent module sign-off pending |
| CAT-008 | Remove required data while Cataloged, then reopen with a reason                | Removal is blocked until reopening; reopening returns to `UNCATALOGED` and disables public display         | **Pass**                                                              |
| CAT-009 | Enable and disable public eligibility                                          | Only Cataloged specimens qualify; no exhibit is published automatically                                    | **Pass**                                                              |
| CAT-010 | Attach, change, repeat, and detach tags                                        | Relationships remain unique and retry-safe                                                                 | **Pass**; usability issue DEF-005                                     |
| CAT-011 | Upload, edit, cover, replace, and remove supported media; reject invalid media | Private signed access, database/storage consistency, and usable interaction states are preserved           | In progress; [DEF-022 merged production recovery/retry passed; independent acceptance pending](./SPECIMEN_MEDIA_GUIDE.md#merged-metadata-repair-verification---2026-10-24). Prior [media/privacy batch](./SPECIMEN_MEDIA_GUIDE.md#cat-011-consolidated-media-batch---2026-10-22) and [wrong-pair HTTP regressions](./SPECIMEN_MEDIA_GUIDE.md#cat-011-wrong-pair-http-checkpoint---2026-10-23) pass; live role/wrong-pair access, failure/concurrency and full accessibility/sign-off gaps remain (original Fail - DEF-004/006/007) |
| CAT-012 | Search, combine filters, sort, and paginate                                    | Results are bounded, stable, case-insensitive where approved, and archived records are excluded by default | **Pass**; Clear-all UI defect DEF-008                                 |
| CAT-013 | Preview and commit mixed-validity CSV rows; retry commit                       | Preview is non-mutating; only reviewed valid rows import as `UNCATALOGED`; retries do not duplicate rows   | **In progress**; prior live core-only cases and DEF-009 remain passed/Verified; [merged production-build DEF-021 retest](./TEST_DEFECT_LOG.md#merged-production-build-import-retest---2026-10-24) passed twice with blocked synthetic commits; independent reviewer acceptance and stated live-provider/concurrency limits remain |
| CAT-014 | Review possible duplicate warnings, including archived matches                 | Warnings show evidence and never auto-merge records                                                        | In progress; [merged browser retest](./SPECIMEN_DUPLICATES_GUIDE.md#merged-browser-retest-checkpoint---2026-10-24) passes owner warning/clear, transport failure/form retention/retry and final delayed-read result; full stale-response coverage, archived policy and independent acceptance pending |
| CAT-015 | Select multiple specimens from the protected catalog on local and LAN clients  | Every row is keyboard/touch accessible and opens the matching preview/detail route                         | In progress; local preview/clear, reload/history, first-two-row Tab traversal with computed focus outlines and Enter opening the matching detail page pass (2026-10-22, DEF-003); LAN, touch and full keyboard/accessibility remain unverified |
| CAT-016 | Restore an archived specimen after current-requirement revalidation | Same record returns as Cataloged only when complete, otherwise Uncataloged; public display off; history preserved; inventory unchanged | **Partial pass** — live incomplete restore, cancel/error/reload and audit passed; complete branch covered by isolated HTTP tests; live concurrency unverified |

CAT-016 evidence and limits are recorded in
[Cataloging restoration verification](./CATALOG_RESTORATION_VERIFICATION.md).
Historical results below are retained; the new restoration check does not
retroactively sign off earlier cases or other modules.

For CAT-007, Cataloging only verifies the prepared lot. Quantity, placement,
condition, movement, and transfer behavior belong to John Gerozaga's Inventory
acceptance tests.

CAT-007 evidence recorded on 2026-10-03: the specimen changed to `CATALOGED`,
public-display eligibility remained off, revision history recorded the status
transition, the audit log contained `COMPLETE_SPECIMEN_CATALOGING`, and
readiness remained satisfied. This validates the lifecycle transition but does
not close DEF-002; Cataloging cannot be signed off while a future provenance
date can satisfy readiness.

CAT-008 evidence recorded on 2026-10-03: removing required Cataloging data was
blocked while the specimen was `CATALOGED`; a blank reopening reason was
rejected; and a valid acceptance-testing reason reopened the record as
`UNCATALOGED`. Public-display eligibility was switched off and unavailable, the
reason was preserved, and the reopening action appeared in the audit log. Once
reopened, removing required data succeeded and readiness correctly prevented
completion. Restoring the required data made Catalog completion available
again.

CAT-009 evidence recorded on 2026-10-03: enabling public-display eligibility
preserved the specimen's `CATALOGED` status, changed the public flag from
`false` to `true`, and created the expected revision-history entry. The state
persisted after refresh and was visible as `Eligible` in the lifecycle and core
record views. Disabling eligibility preserved `CATALOGED`, persisted the
disabled state, and recorded the inverse change. No exhibit row was created,
the exhibit total remained unchanged, and no exhibit was published
automatically.

CAT-010 evidence recorded on 2026-10-03: a new tag attached successfully and
appeared in revision history. The shared tag was available for reuse on a
different specimen, while a case-insensitive duplicate attachment to the same
specimen was rejected without creating another relationship. The changed tag
persisted after refresh, and detaching it created the expected revision entry
while retaining the shared vocabulary tag. Core tag behavior passed. DEF-005
tracks that vocabulary search reports only the number of suggestions instead
of visibly listing the matching names.

CAT-011 evidence recorded on 2026-10-03: supported images loaded before and
after refresh; a second upload and file replacement succeeded; and the saved
metadata persisted. An unsupported file was rejected with the approved
JPEG/PNG/WebP guidance, and a negative display order was rejected. Removing an
image persisted and created revision history. Switching the cover removed the
marker from the previous image, assigned it to the second image, and persisted
after refresh. Reloading the separate revision-history page to see a newly
committed event is expected because it is not a live subscription. DEF-004
tracks missing file-control hover feedback, DEF-006 tracks raw identifiers and
storage paths in revision history, and DEF-007 tracks the catalog preview's
hard-coded placeholder instead of the selected cover image.

CAT-012 evidence recorded on 2026-10-03: identifier and name searches,
individual and combined filters, ascending and descending sorting, active and
archived filtering, and pagination all returned the expected records. With 28
records, the first page showed 25 and the second showed the remainder without
duplicates or omissions. `Clear all` reset the query and result set but left
the previous status, collection, gender, and other control values visibly
selected; DEF-008 tracks this stale form-state defect.

CAT-013 evidence recorded on 2026-10-03: submitting the approved acceptance
CSV with two valid rows and one deliberately invalid gender returned `502 Bad
Gateway` from the same-origin preview route and displayed `The CSV preview is
temporarily unavailable.` No backend exception was logged. Backend import
tests passed 39/39 and frontend import-contract tests passed 3/3, but the
frontend contract does not cover invalid raw preview values. DEF-009 tracks
the response-schema mismatch that prevents the UI from displaying the
backend's row-level validation result.

#### Cataloging date/import HTTP evidence - 2026-10-22

On backend base `304dee0`, the user approved protected HTTP tests for dates/
readiness and reviewed CSV preview/selected commit/retry. Extended the existing
`test/specimens.e2e-spec.ts` fixture without mocking internal Cataloging
services: only Prisma and Supabase adapters are replaced. The in-memory
fixture is deliberately limited, not a database emulator or rollback proof.

Fifteen new characterization cases pass:

- Five date cases: create/update accept `2026-01-02` when the clock is
  `2026-01-01T16:30:00Z` (Manila Jan 2), read back the saved value and check
  revision/audit attribution. Both reject Jan 3 without writes. A seeded legacy
  Jan 3 date is the sole missing readiness requirement, blocks completion and
  remains unchanged/readable. The pre-existing prepared-lot read fixture is
  reused; no Inventory operation or lot creation is added.
- CSV preview reports two valid and three invalid rows (gender, future date,
  malformed collection UUID), preserves the specimen list and performs no
  create/audit writes. Only selected row 1 is committed as Uncataloged, public
  off and curator-attributed; retry returns its original record with one
  total create/IMPORT_SPECIMEN audit. Invalid rows and an unreviewed row 99
  cannot be committed through a direct request.
- Preview/commit each reject signed-out, invalid-token and developer callers.
  Another active curator cannot commit the owner's preview (404); the owner's
  preview remains usable after that denial.

Cases were added and run one behavior group at a time against existing
production behavior. They passed immediately; no red-to-green application
repair is claimed. No runtime, frontend, schema, dependency or Inventory code
changed, and no live import, database write or server restart occurred.

Verification: focused Specimens HTTP 49/49; full unit 53 suites / 690 tests;
full HTTP 26 suites / 328 tests passed, one suite / 17 tests skipped.
TypeScript no-emit and diff checks passed. Lint: zero errors / seven existing
unused-disable warnings outside this file. Expected negative-path unit logs
and broader missing-audit fixture errors (including DEF-017) were not silenced;
the focused 49-case HTTP run had no such error output. Build is delegated to
PR CI to preserve the running backend's build output.

Date/import API gaps now have isolated evidence; do not repeat these suites
as if untested. Remaining work is the actual frontend-to-backend preview/
selection/commit/refresh/retry path in a confirmed development environment,
with disposable core-only records and explicit non-mutation/readback checks.
Do not create lots or inject legacy invalid dates into the live database.
Real concurrency, rollback, multi-instance/restart durability of the in-memory
preview cache and independent acceptance remain unverified. DEF-002/009 remain
Ready for retest, not Verified. DEF-018 records a nonblocking Swagger status
documentation mismatch observed during these tests.

#### CAT-013 live core-only CSV acceptance - 2026-10-22

Later contract-only follow-up: [DEF-018 running Swagger verification](./TEST_DEFECT_LOG.md#running-swagger-verification---2026-10-24)
passed on two reads on 2026-10-24. The declaration now lists 201 and the correct
commit response DTO; DEF-018 is Verified for that mismatch only. Earlier dated
pending statements remain historical; no new CSV mutation or module sign-off
is implied.

After confirming backend PR #166 merged, used the existing signed-in headed
Edge session `biosphere-aud002` and real local frontend/backend. Checkout
references: frontend `0ffa81f`, backend `0da6cc6`; exact served build hashes
were not independently inspected. Servers were not restarted or replaced.

Fixture marker: `TEST CSV 20261022 C 7c56d941`. Only row 1, named
`TEST CSV 20261022 C 7c56d941 Selected`, was imported. Its specimen UUID is
`3e7a3ca2-bf8f-45c9-98d3-94b8bcf31419`. Remarks identify it as a disposable
core-only import acceptance record. No lot/storage/taxonomy/media columns were
supplied; collection and accession were left unassigned for this draft.

Executed checks:

1. Protected same-origin specimen reads found no fixture before preview.
2. Uploaded five rows through the actual file input: two valid, one invalid
   gender, one future collection date and one malformed collection UUID.
   Preview succeeded (no 502), showing 5 total / 2 valid / 3 invalid / zero
   warnings with specific row errors. Valid rows were checked; invalid rows
   were disabled. Protected before/after reads returned identical specimen-ID
   sets and zero fixture records: preview created nothing.
3. Unchecked valid row 2 and imported only row 1 through the UI. The completion
   notice reported one success / zero failures. Protected read returned only
   the selected fixture, `UNCATALOGED` with public display off.
4. Re-selected row 1 in the same retained reviewed preview after the UI's
   refresh, without uploading/re-previewing. Imported again through the UI;
   protected read still returned one fixture with the identical specimen UUID.
5. Opened its real detail page in a temporary tab and reloaded. Name and
   remarks persisted; only that temporary tab was closed. Main commit/retry
   script reported zero page errors.
6. Filtered the actual Audit Logs UI by specimen UUID/module/action. One
   `IMPORT_SPECIMEN` SUCCESS remained after reload; it referenced this specimen,
   CURATOR role and row 1, with preview/batch IDs and Uncataloged status in
   structured details. Actor UUID equality/exact timestamp were not asserted.
7. Previewed a separate valid-only file containing the still-unimported row 2.
   It showed one valid / zero invalid and a selected checkbox. No commit was
   made: protected ID sets stayed unchanged and only the original fixture
   existed. Invalid and unselected mixed-file rows remained absent.

CAT-013 passes this scoped core-only development workflow. DEF-009's original
mixed-row preview regression is Verified using this repeatable browser result
and the isolated invalid-row direct-commit regressions in PR #166. Historical
failed evidence is preserved. This is not independent teammate or full module
sign-off, nor a test of extended taxonomy/provenance/lot imports, process death,
lost commit response, concurrent requests, rollback or multi-instance behavior.

The single saved fixture is retained for review; nothing was deleted/archived.
No direct database writes, request/response mocks, auth-state exports, Inventory
changes or publication occurred. Browser stays open and signed in on its detail
page. Local fixture-specific scripts remain Git-ignored under frontend
`tools/browser/artifacts/cat013-*.txt`; they are diagnostic evidence, not CI tests.
This commit changes documentation only: `git diff --check` is the local check;
full automated suites/build were not rerun for this evidence update.

#### CAT-005 read-only date-input checkpoint - 2026-10-22

Using the same signed-in browser and retained CAT-013 specimen, opened its
Provenance form without submitting. The input maximum matched independently
computed Asia/Manila today (`2026-10-22`). Filling tomorrow (`2026-10-23`)
produced native `rangeOverflow` / invalid state; today and `2020-01-01` both
passed native input validity. Reload returned the date to its original blank
value. A request listener counted zero POST/PUT/PATCH/DELETE requests during
the check; no record or provenance data changed.

Browser remains open and signed in on that provenance page. Local diagnostic:
frontend `tools/browser/artifacts/cat005-date-input-readonly.txt` (Git-ignored).
Frontend checkout `0ffa81f`, backend evidence branch based on `0da6cc6`; exact
served hashes not independently inspected. This validates the date input only,
not save persistence, the native calendar popup, validation-bypass resistance
or live readiness. DEF-002 and full CAT-005/006 acceptance remain pending.
No application suites/build rerun for this documentation-only addition;
`git diff --check` passed. Stop this session here at the user's request.

#### CAT-005 live date-save and rejection evidence - 2026-10-22

Merge audit: PR #167 merged CSV evidence commit `d056c71` into `28f16bb`, with
successful CI. The final read-only date note `3f7e5ff` had been pushed after
that merge and was not in develop. It is carried into this follow-up as
`1daf4c8`; the original commit was preserved, not lost or force-pushed.

Used the existing signed-in Playwright session `biosphere-aud002` and disposable
CSV specimen `3e7a3ca2-bf8f-45c9-98d3-94b8bcf31419`. Frontend checkout `0ffa81f`,
backend base `28f16bb`; served build hashes were not independently inspected.
Existing servers/authentication were preserved. Executed through real UI:

1. Repeated the read-only date-input check successfully before saving.
2. Created provenance containing only museum-today `2026-10-22`. The create
   notice appeared; editor navigation and reload retained the exact date.
3. Updated only the date to `2020-01-01`. The update notice appeared, and
   fresh editor navigation/reload retained it.
4. Unchanged submission showed the explicit no-changes message. Tomorrow
   (`2026-10-23`) failed native validation without a POST. Removed only this
   test page's DOM maximum and submitted again: the Server Action displayed
   the museum-time future-date error. Reload restored the maximum and saved
   historical date. This is not a direct live backend-bypass test.
5. Filtered revision UI returned exactly two collection-date events:
   Not recorded -> 2026-10-22, then 2026-10-22 -> 2020-01-01; reload retained
   two. Rejected attempts added no date revisions.
6. Filtered audit UI returned only three SUCCESS events for this specimen:
   original IMPORT_SPECIMEN, CREATE_SPECIMEN_PROVENANCE and
   UPDATE_SPECIMEN_PROVENANCE, one each. No additional successful mutation
   audit appeared for rejected attempts. Exact actor UUID/timestamp not checked.
7. Details marked the date requirement met. Catalog completion stayed disabled
   for the other missing requirements; a protected read still showed
   UNCATALOGED/public display off. No Cataloging completion or lot creation.

Main save script reported zero page errors. Two successful provenance writes
are retained on the existing test specimen; no new specimen, Inventory data,
schema/code changes, direct DB writes, auth exports or server restarts.
Fixture scripts remain ignored at frontend `tools/browser/artifacts/`:
`cat005-live-date-save.txt`, `cat005-live-date-rejections.txt`, and
`cat005-live-history-readiness.txt`. Browser stays open and signed in on details.

CAT-005's recorded workflow passes and DEF-002's original date regression is
Verified using live UI/Server Action evidence, the actual CSV invalid-date
preview, and PR #166's isolated backend create/update/legacy-readiness checks.
No invalid legacy date was injected into the live DB. Live direct HTTP bypass,
concurrency/rollback and independent full CAT-006/module acceptance are not
claimed. Documentation-only checks: `git diff --check`; application suites/build
were not rerun for prose changes.

### Storage Location Management

| ID      | Test                                                  | Expected result                                               | Status                                               |
| ------- | ----------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------- |
| STO-001 | Create a root and nested storage hierarchy            | The hierarchy reloads with correct parent-child relationships | **Pass**                                             |
| STO-002 | Attempt self-parenting and descendant cycles          | Both operations are rejected without changing the hierarchy   | **Pass**; UI manual + automated backend verification |
| STO-003 | Edit storage metadata and specimen-holding capability | Valid changes persist and invalid values are rejected clearly | **Pass**                                             |
| STO-004 | Exercise approved archive restrictions                | Referenced/unsafe locations cannot be archived incorrectly    | **Pass** for original restrictions; DEF-010 post-merge display and isolated HTTP checks passed; combined Inventory criterion/sign-off pending |

STO-001 evidence recorded on 2026-10-04: a disposable top-level room and its
nested storage locations were created with the intended parent-child
relationships. Labels, curator-entered unit and storage types, and
specimen-holding capability persisted after refresh, and the hierarchy
displayed correctly.

STO-002 evidence recorded on 2026-10-04: the Move Location UI excluded the
selected unit, its current parent, and its descendants from eligible parent
choices. At the tester's request, no manual API mutation was sent. Focused
automated verification passed 27/27 backend service/path tests and 7/7
frontend hierarchy/management tests. The backend tests specifically verify
that self-parenting, no-op moves, and descendant-parenting are rejected before
movement history is written. Expected warnings came from fixtures that
deliberately model missing ancestors and legacy cycles.

STO-003 evidence recorded on 2026-10-04: valid label, unit type, storage type,
size, capacity, and specimen-holding changes saved and persisted. Submitting
the unchanged form did not create an update. Whitespace-only required values
were rejected, and the capacity control rejected zero, negative, fractional,
and nonnumeric values, preserving the last valid state.

STO-004 evidence recorded on 2026-10-04: archiving was rejected while the
location had active children or specimen lots. After those dependencies were
resolved, the disposable child and its parent cabinet archived successfully,
the selected record showed its archived state, and mutation controls became
read-only. The archived cabinet and child nevertheless remained visually
indistinguishable from active locations in the hierarchy and direct-child
list. DEF-010 tracks this lifecycle-presentation issue; archived records must
remain recoverable for history, but they must not appear to be part of the
live hierarchy.

#### Storage archive-display recheck - 2026-10-21

Read-only browser recheck of the existing archived `TEST CABINET A` and
`TEST - DRAW 1 Updated` fixtures reproduced DEF-010: the default hierarchy still
included the archived cabinet, search and child cards lacked archived labels,
and the parent counted the archived child without an active/history distinction.
No Show archived toggle was available. Detail badges and read-only management
were correct, child selection survived reload, and its audit-history link
showed one archive event. No live data was mutated.

DEF-010 remains **Open**, not Verified or Ready for retest. The next corrective
step is the existing scoped frontend remediation in the defect log; repeating
the same successful archive operation does not repair its display. STO-004's
earlier archive-restriction result is retained, not extended into module sign-off.

See [DEF-010 recheck](./TEST_DEFECT_LOG.md#def-010---archived-locations-still-look-active-in-the-live-hierarchy)
for fixture IDs, navigation-timing observation and verification limits.
Checkout bases: backend `db45e1a`, frontend `f596a3f`; served build hashes were
not independently verified. No application code changed; documentation check
is `git diff --check`, not a new full automated-suite/build execution.

#### Storage archive-display repair verification - 2026-10-21

Frontend `79f965f` repairs DEF-010 with default active-only tree/search,
explicit historical visibility, consistent archive labels, separate child
counts/lists and preserved read-only audit access. Local signed-in UI on
loopback port 3100 passed toggle/reload, old archived links, child/ancestor
navigation, active fallback, parent-option exclusion and pending feedback.
The existing archived fixtures were read only; no server data was changed.

Ten test-first view regressions were added; all 331 frontend tests, lint,
TypeScript and isolated production Turbopack build passed. Empty/all-archived
states are unit-covered, not manufactured live states. No backend API,
Inventory behavior, dependencies or schema changed. Backend authorization,
lot-assignment rejection and concurrency were not re-executed.

DEF-010 is now **Ready for retest**, not Verified: merge/rebuild the normal
frontend and complete team acceptance. The earlier failed recheck remains
historical evidence; STO-004's original restriction pass is not expanded into
full Storage sign-off. This backend change is evidence documentation only;
`git diff --check` is the local check, not a new backend suite execution.

#### Storage post-merge normal-frontend recheck - 2026-10-21

Frontend PR #75 and backend PR #162 are merged; local develop checkouts are
frontend `0ffa81f` / backend `29fe779`. The running port 3000 frontend exposes
the new toggle, although its exact served build hash was not independently
inspected. Read-only browser checks passed active filtering, archived labels
across all surfaces, separate child counts/lists, toggle/reload, child selection,
legacy direct links, keyboard hide/fallback, read-only controls, archived-parent
exclusion and existing archive audit access. Zero page errors were reported;
no data mutations or server restarts occurred, and sign-in was preserved.

This advances DEF-010's presentation evidence, not full Storage sign-off.
Backend rejected writes, Inventory lot-assignment restrictions and concurrency
were not re-executed; the combined protection criterion remains unchecked.
DEF-010 remains Ready for retest pending that criterion and team acceptance.
See its defect entry for fixture IDs and the local diagnostic script.
Documentation-only verification: `git diff --check`; no new local full-suite run.

#### Storage HTTP protection regressions - 2026-10-21

On backend base `27db649`, extended `test/storage-locations.e2e-spec.ts` at
the user-approved HTTP boundary. Real Nest controllers, validation, auth/role
guards and storage service run with mocked Prisma and Supabase adapters;
no requests reach the running backend or a live database.

- Four archived-state cases pass: archived detail remains readable; archived
  edits/moves fail; create-child and move-child reject archived parents.
  Rejected calls produce no storage writes or success audit events.
- Twelve permission cases cover create/edit/move/archive for signed-out,
  invalid-token and developer callers: 401/401/403 respectively. Developer
  denial audits remain supported and asserted; no storage writes occur.
- Each archived case and then the permission matrix passed against existing
  production behavior; no red application regression was observed and no
  runtime changes were needed. This is added characterization coverage, not
  a claimed red-to-green application repair.
- Focused storage HTTP suite: 29 passed (13 previous + 16 new). Full backend:
  53 unit suites / 690 tests passed; 26 HTTP suites / 313 tests passed,
  with one suite / 17 tests skipped. TypeScript no-emit and diff checks passed.
- Lint completed with zero errors / seven unused-disable warnings in unchanged
  files. Full-suite expected failure-path logs were not suppressed. A separate
  missing-audit mock error was reproduced and logged as DEF-017; other such
  full-run messages were not all attributed to individual suites.

No application/schema/dependency/frontend or Inventory code changed. Build is
left to PR CI to avoid overwriting the running backend's build output. These
mock-backed checks do not prove live database writes, rollback/concurrency,
real Supabase token validation or Inventory lot-assignment restrictions.
DEF-010 remains Ready for retest; its combined protection criterion and team
acceptance are not marked complete by this narrower evidence.

### Limited offline and synchronization

| ID      | Test                                                            | Expected result                                                                                 | Status  |
| ------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------- |
| OFF-001 | Cache the allowed specimen list, disconnect, and check workspace/reload | Open workspace retains bounded cached viewing; fresh offline navigation/reload shows record-free fallback | In progress; manual workspace/fallback/recovery evidence recorded; independent retest pending |
| OFF-002 | Create an offline text draft and synchronize after reconnecting | One attributed `UNCATALOGED` record is created                                                  | In progress; manual save/persistence/sync evidence recorded; independent sign-off pending |
| OFF-003 | Retry the same synchronization and simulate temporary failure   | Retry is safe; no duplicate specimen is created; recoverable errors remain visible              | In progress; prior scoped pilots pass; new tab-interruption pilot failed its no-write guard (DEF-019), dependent interruption runs stopped pending isolation; actual session expiry/concurrency gaps remain |
| OFF-004 | Inspect offline feature boundaries                              | Media, inventory movement, archive, and privileged operations are not falsely available offline | In progress; text-core boundary/account isolation reported and regression-covered; full negative matrix pending |

### FAQ knowledge management

| ID      | Test                                      | Expected result                                                                              | Status   |
| ------- | ----------------------------------------- | -------------------------------------------------------------------------------------------- | -------- |
| FAQ-001 | Create and edit a knowledge entry         | Valid question, answer, category, and keywords persist                                       | Pass     |
| FAQ-002 | Search/filter and change lifecycle status | Active, inactive, and archived behavior matches the API and UI                               | In progress; filter/archive UI, archive audit and [activation cancellation checks](./FAQ_KNOWLEDGE_GUIDE.md#faq-002-activation-cancellation-checkpoint---2026-10-23) pass; actual activation/deactivation pending |
| FAQ-003 | Attempt invalid or duplicate operations   | Clear validation is shown and no unintended record is created                                | In progress; UI validation and [category HTTP boundary regressions](./FAQ_KNOWLEDGE_GUIDE.md#faq-003-category-http-boundary-checkpoint---2026-10-23) pass; duplicate policy pending |
| FAQ-004 | Test public assistant matching            | Approved match, alternative wording, inactive ignored, no-match fallback, prohibited general answer (e.g. species identification) refused, and inquiry/visit-request redirection | Not run  |

#### FAQ-001 supervised browser evidence - 2026-10-19

Ran the real local frontend with the isolated, headed Edge session
`biosphere-faq-001` after the user signed in manually with a development curator
account. Playwright drove the visible forms; no API mocking or direct database
writes were used.

- Fixture question: `TEST FAQ 20261019 A e1a74c2d - What is this test entry for?`
- Record ID: `231d8430-41d9-4d84-ab2b-1f8ddb6b8a4a`.
- The unique fixture search returned no matches before creation. Creating it
  showed the success notice and `INACTIVE` status.
- After fresh navigation and reload, the question, original answer, category,
  alternative wording, and both keywords matched the submitted literals. The
  filtered list contained exactly one matching record.
- Changed only the answer to `This entry verifies that FAQ edits persist.`
  through **Save knowledge**. The update notice appeared, and fresh navigation
  plus reload preserved the new answer, record ID, and all other fields.
  Exactly one matching record remained, still `INACTIVE`.
- The first edit attempt stopped before submitting because an exact-label
  locator did not resolve the prefilled textarea. Corrected the diagnostic
  locator and resumed on the same record; no second entry was created. The
  continuation passed all five edit/persistence/identity checks.

The fixture is retained inactive for follow-up testing; it was not activated,
archived, or deleted. The isolated browser was closed. Scripts and diagnostic
artifacts remain local and Git-ignored under the frontend's
`tools/browser/artifacts/`; credentials and browser authentication state are
not included in this evidence.

This passes only FAQ-001's valid create/edit persistence case. It does not
establish lifecycle/filter acceptance, invalid/duplicate handling, public
matching, authorization failure behavior, audit attribution, concurrency, or
production readiness. FAQ-002 through FAQ-004 remain not run; the matching-rule
approval gate in `FAQ_KNOWLEDGE_GUIDE.md` still applies. The frontend checkout
was `e43e7fc`; the backend checkout before documenting was `76f6799`. Actual
served build revisions were not independently verified. No app code changed,
and no full lint, unit, or production-build suite was rerun for this evidence.

#### FAQ-002 read-only filter evidence - 2026-10-19

Supervised Playwright checks ran through the actual local FAQ Knowledge UI in
isolated Edge session `biosphere-faq-002`, after manual curator login. Reused
FAQ-001's retained inactive fixture (`231d8430-41d9-4d84-ab2b-1f8ddb6b8a4a`);
no records were created, edited, activated, deactivated, archived, or deleted.
All eight checks passed:

1. Lowercase search for the fixture question's unique prefix found exactly
   that one record, with its expected category and inactive status.
2. Search plus `INACTIVE` plus exact category `Acceptance testing` returned
   that same single record.
3. Reload preserved those results and all three filter controls.
4. Changing the combined status to `ACTIVE` excluded the inactive fixture.
5. Changing it to `ARCHIVED` also excluded the inactive fixture.
6. Category `Acceptance` did not match `Acceptance testing`, confirming an
   exact-category rather than substring filter for this case.
7. A unique no-match query showed zero entries and the empty-state message,
   without stale selected-record details.
8. Clear reset all three controls and restored the unfiltered first-page rows
   captured before the test (compared in memory, not published in artifacts).

Only the isolated test browser was closed. The diagnostic script is local and
Git-ignored at frontend `tools/browser/artifacts/faq-002-filters.txt`. Checkout
references at execution: frontend `e43e7fc`, backend `49f62d4`; actual served
build revisions were not independently verified. No API mocking was used.

FAQ-002 remains **In progress**: these checks do not validate actual lifecycle
transitions or positive retrieval of active/archived fixtures, pagination,
browser history, authorization failures, pending/error UI, or public matching.
Activation would make a test answer eligible for public matching and needs a
confirmed isolated test environment before that follow-up. FAQ-003 and FAQ-004
remain not run. This is evidence only, not an application fix or complete FAQ
acceptance; full lint/unit/build suites were not rerun for this docs-only update.

#### FAQ-002 inactive-to-archived browser evidence - 2026-10-21

Used the existing signed-in, headed Edge session `biosphere-aud002` and the
real local curator UI on port 3000. Playwright followed the visible forms and
audit link; no API mocking, direct database writes, auth-state export, public
activation, hard deletion, or changes to another owner's module occurred.

Created one disposable fixture rather than permanently archiving the retained
FAQ-001 entry needed for other tests:

- Question: `TEST FAQ Archive 20261021 B 7c56d941 - Why is this entry archived?`
- ID: `b6893943-43e0-4192-a862-afcf68311f48`.
- Answer: `Disposable inactive-only FAQ archive acceptance fixture. Do not activate.`
- Category: `Acceptance testing`; alternative wording and keywords left empty.

Executed checks:

1. The unique question search was empty before creation. Create showed the
   inactive-success notice; fresh navigation returned exactly one inactive
   fixture with its saved answer and ID.
2. Opened Archive confirmation and chose Cancel. Reload retained `INACTIVE`;
   audit history contained one `CREATE_FAQ_ENTRY` and no archive event.
3. Confirmed **Yes, archive**. The success notice appeared; fresh navigation
   and reload showed `ARCHIVED`, preserving the question, answer, category
   and original ID.
4. Archived knowledge displayed the permanent read-only explanation and no
   edit form, Save, Activate, Deactivate, or Archive button for that entry.
   The unrelated Create-inactive form remains available as intended.
5. Search plus `ACTIVE` or `INACTIVE` excluded this archived fixture with a
   proper empty state. Search plus `ARCHIVED` returned exactly one match.
6. **View audit history** returned one create and one successful
   `ARCHIVE_FAQ_ENTRY`. The archive actor matched the creating/acting curator,
   and structured details contained `previousStatus: INACTIVE` and
   `newStatus: ARCHIVED`. Reload preserved the same event counts.

An initial diagnostic locator matched both the answer paragraph and edit
textarea, so that script stopped after creating the inactive fixture but
before any archive attempt. Scoped the locator to Knowledge details and
resumed on the same UUID; no second create occurred. This was a test-selector
error, not an application defect. No application assertion failed in the
corrected lifecycle run; no new defect was reproduced.

The disposable fixture is retained archived for evidence; routine operations
cannot restore it. The earlier FAQ-001 fixture was not changed. The browser
remains open and signed in on the archived fixture. Diagnostic scripts stay
Git-ignored under frontend `tools/browser/artifacts/faq-archive-*.txt`.

Checkout bases: backend `d1afbb3`, frontend `f596a3f`. Actual served production
build hashes were not independently verified and servers were not restarted.
No application code changed; `git diff --check` is the documentation check.
Full lint/unit/build suites were not rerun for this evidence-only change.

FAQ-002 remains **In progress**: activation, deactivation, active-to-archived
behavior, direct archived-write rejection, real concurrent/idempotent HTTP
requests, session expiry, and failure/pending UI are not established by this
run. Refreshing audit history is not an actual mutation retry. No test answer
became public, and no chatbot request was sent; FAQ-004 approval/testing and
independent module sign-off remain separate.

#### FAQ-003 supervised negative-path evidence - 2026-10-19

Playwright drove the actual FAQ create/edit forms in isolated Edge session
`biosphere-faq-003` after manual curator login. Reused inactive fixture
`231d8430-41d9-4d84-ab2b-1f8ddb6b8a4a`. All 12 checks passed:

- Saving the unchanged edit showed **Change at least one valid knowledge field
  before saving.** Fresh navigation confirmed the saved fixture was unchanged.
- Empty question and empty answer were each blocked by native required-field
  validation, with focus on the missing field, for both create and edit forms
  (four checks).
- Whitespace-only question and answer were each rejected with the corresponding
  **Enter the visitor question.** or **Enter the approved answer.** message for
  both create and edit forms (four checks). Reloaded after each edit attempt.
- Typing 101 category characters retained only 100, matching the input's
  `maxlength`. This checks browser typing protection, not bypass resistance or
  successful persistence of a boundary-length category.
- Searching the unique invalid-create marker
  `TEST INVALID FAQ 20261019 54f6a891` returned zero entries.
- Final reload preserved all displayed fixture fields, record ID, timestamp,
  and inactive status against the pre-test baseline. Its question still matched
  exactly one record. No successful data or lifecycle changes were performed.

The isolated browser was closed; the script remains Git-ignored at frontend
`tools/browser/artifacts/faq-003-validation.txt`. Checkout references at
execution: frontend `e43e7fc`, backend `3d9fcfa`; served build revisions were not
independently verified. No API mocking or credential exports were used.

FAQ-003 remains **In progress**. Direct backend validation, overlength payload
bypasses, repeated keyword/alternative normalization, and duplicate-question
creation were not tested. Source inspection found no explicit duplicate-question
lookup in `FaqService.create` or question uniqueness in the Prisma FAQ model;
this is not runtime proof or an approved requirement to impose uniqueness.
Before deliberately creating duplicates, confirm whether normalized duplicate
questions should be rejected, warned about, or allowed, and how archived
entries/categories affect that rule. Do not mark an unconfirmed policy gap as
a reproduced defect. Full lint/unit/build suites were not rerun for this
documentation-only evidence update.

#### FAQ backend isolated-suite evidence - 2026-10-19

Ran the existing focused suites at backend checkout `39901fb`, without adding
tests or changing application code:

| Command | Result |
| --- | --- |
| `npm test -- --runInBand --runTestsByPath src/faq/faq.service.spec.ts` | 13/13 passed |
| `npm run test:e2e -- --runInBand --runTestsByPath test/faq.e2e-spec.ts` | 13/13 passed |

The service suite injects a Prisma mock. The HTTP suite builds the Nest app
with its real ValidationPipe and guards, replacing Prisma and the Supabase
client with in-memory mocks before initialization. No live database mutations,
Supabase authentication calls, public FAQ activation, or browser login were
performed by these checks.

Coverage includes rejected management requests without authentication or with
a developer role; forbidden status injection; whitespace question, malformed
list/null fields, invalid UUID/status/pagination/query input; normalization and
case-insensitive repeated-term removal; unchanged updates; explicit lifecycle
actions and archived immutability; audit call arguments; and the implemented
public assistant response/fallback contracts. The service suite also checks
idempotent lifecycle behavior and simulated transaction conflicts.

These results supplement FAQ-002/003, not complete their acceptance. They do
not prove live transaction rollback/concurrency, database constraints, actual
audit persistence, browser lifecycle controls, or curator approval of public
matching rules. The existing HTTP tests do not cover the overlength-category
payload bypass noted above, and duplicate-question policy/testing remains
pending. FAQ-004 remains not run for acceptance; passing tests of implemented
matching behavior do not approve that behavior. Both focused suites passed;
full lint/build and the rest of the test suites were not rerun for this
documentation-only update.

#### FAQ-003 category boundary follow-up - 2026-10-23

The [category HTTP checkpoint](./FAQ_KNOWLEDGE_GUIDE.md#faq-003-category-http-boundary-checkpoint---2026-10-23)
supersedes only the earlier untested overlength-category API statement:
100-character create/edit acceptance and 101-character rejection with unchanged
HTTP readback now pass in isolation (four new tests; complete FAQ HTTP suite
17/17). FAQ-003 remains In progress; no duplicate policy or public matching
approval is inferred. Earlier dated evidence remains historical.

### Audit and backup history

| ID      | Test                                                                 | Expected result                                                                                                        | Status   |
| ------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------- |
| AUD-001 | Filter audit logs by actor, module, action, result, record, and date | Results are protected, stable, bounded, and accurate                                                                   | In progress; live Developer exclusion and persisted denial evidence plus [direct-endpoint HTTP role-denial regressions](./AUDIT_LOG_GUIDE.md#direct-endpoint-role-denial-http-regressions---2026-10-24) pass; exact live request correlation, remaining access/failure/boundary cases and sign-off pending |
| AUD-002 | Trace Cataloging actions to revision and audit entries               | Actor, affected record, action, outcome, and timestamp match                                                           | In progress; prior evidence plus [five live lifecycle transitions and matching history/audits](./AUDIT_LOG_GUIDE.md#aud-002-approved-lifecycle-traceability-batch---2026-10-23) pass; OBS-001 disposition and independent sign-off pending |
| BAK-001 | Search and filter backup-history records                             | History loads with correct status/type/creator/date filters                                                            | In progress; empty-history UI checks pass, positive-data cases unavailable |
| BAK-002 | Execute and restore a real backup                                    | Deferred until deployment ownership, storage, retention, verification, and disposable restore environment are approved | Deferred |

The [2026-10-23 lifecycle batch](./AUDIT_LOG_GUIDE.md#aud-002-approved-lifecycle-traceability-batch---2026-10-23)
supersedes the older pending-completion/reopening/public-eligibility statements
below. Historical checkpoints and OBS-001's separate limits are retained.

OBS-001's [2026-10-24 local mode comparison](./TEST_DEFECT_LOG.md#approved-development-mode-comparison---2026-10-24)
did not reproduce the timeout: history readiness was 796-1306 ms on the existing
production-mode server and 1379-1439 ms on the temporary warm dev server, with
the same 22 revisions. That temporary server was stopped. This completes the
bounded local comparison, not backend timing correlation or final disposition.

#### Current scoped follow-ups - 2026-10-22

Frontend PR #76 was confirmed merged with successful CI. Its nine isolated
Audit page/rendering regressions cover connection/HTTP failures, 401 redirect,
403 guidance, invalid/non-JSON responses and independent request recovery.
They run the real audit client/schema/static UI with synthetic session/fetch
boundaries, not Next RSC, browser hydration or live authorization/outages.
See frontend `docs/audit-page-verification.md` at commit `bc55ce7` for the
340-test full-suite, lint/TypeScript evidence and exact limits.

OBS-001 history navigation was separately retried read-only in three local
browser samples: rendered-history readiness was observed at 1477, 1599 and
945 ms, with identical 21-entry history. The old 30-second delay did not recur;
this is not a fix or production-performance sign-off. OBS-001 remains open for
production comparison/timing correlation. A separate transient notification
polling observation, OBS-002, is recorded for the dashboard/feed owners; their
code was not changed. See `TEST_DEFECT_LOG.md` for measurements and limitations.

#### AUD-002 archive checkpoint and blocked restoration - 2026-10-21

Historical checkpoint: restoration was subsequently implemented and checked;
see CAT-016 and `CATALOG_RESTORATION_VERIFICATION.md` for the later result and
remaining limits. The blocked statement below describes that earlier run,
not the current existence of the restore workflow.

This concludes the current supervised Cataloging traceability browser batch,
not full module/project acceptance. PRs #153-#156 were still pending at this
checkpoint; evidence there must be reviewed/merged separately with CI results.

Before mutation, source inspection found no specimen restore controller/service
workflow, while `SpecimenLifecyclePanel.tsx` explicitly warns that no restore
workflow exists. `docs/CATALOG_COMPLETION_GUIDE.md`, Deferred decisions,
explicitly excludes restoration from `ARCHIVED`. **Restore testing is Blocked
by an unimplemented/deferred capability, not Pass and not a new regression.**
Do not interpret previous manual references to restoring required field data
as evidence that archived specimen restoration exists. No restore endpoint was
invented or attempted, and no restore implementation was added during testing.

To preserve the main reusable specimen, created a separate throwaway record
`TEST - AUD-002 Archive Only 20261021`, UUID
`9f2cd6f5-92d0-4afc-bd11-dfe7b3c1fde0`, with no active lots. Its remarks
explicitly identify it as disposable with restoration not implemented.
Using signed-in isolated Edge session `biosphere-aud002`, all 37 executed
archive assertions passed (includes repeated view checks, not 37 test cases):

- Verified fixture name, `UNCATALOGED`, public eligibility off, no active lots,
  no initial revisions, and exactly one creation audit. No inventory was changed.
- Cancelled archival and confirmed status, revisions, and audit contents unchanged.
- Confirmed archive: `ARCHIVED`, public eligibility still off, core values readable,
  edit link absent, and no repeat-archive or restore control offered.
- Exactly one `Status` revision recorded `UNCATALOGED` -> `ARCHIVED`, source
  `Specimen Core`, within the measured operation window with five-second tolerance.
- Exactly one `ARCHIVE_SPECIMEN` audit identified the fixture UUID/type `specimen`,
  module `specimens`, result `SUCCESS`, and only `previousStatus: UNCATALOGED`
  metadata. Displayed actor matched the revision, selected detail showed curator
  role, and the displayed timestamp minute matched the revision.
- Reload retained the archived status, off eligibility, one revision, and two
  audits (create/archive). Direct core-edit navigation showed read-only behavior.
- Default catalog search excluded the archived fixture; explicit `status=ARCHIVED`
  search returned exactly its row. Read-only browsing added no history/audits.
- Main reusable specimen `5b8e55d4-af0f-4263-9b0e-349b4b314f20` remained
  `UNCATALOGED` and active. Browser was left open/signed in on that main record.

The throwaway record remains archived with its history preserved; it was not
deleted or restored. No failed assertion or new application defect was reproduced
in this archive run. The restore gap is recorded here as a capability blocker,
not incorrectly entered as a newly introduced bug. Diagnostic remains ignored
locally at frontend `tools/browser/artifacts/aud-002-archive.txt`, not a CI test.
No request mocks, direct database writes, lot/storage/publication operations,
production source changes, or credential/auth-state exports were used.

Checkout references: frontend `e43e7fc`, backend `39b9aac`; actual served build
revisions not independently verified. Actor UUID equality, exact audit database
timestamps, direct unauthorized-write rejection, active-lot archive rejection,
repeat-request idempotency, concurrency, and production security are not proven
by this archive-only case. Documentation only; `git diff --check` passed;
full lint/unit/build suites were not rerun.

Remaining after this batch:

- Review/merge evidence PRs and independent retest; do not infer CI from local results.
- Completion/reopening/public-eligibility traceability on an approved specimen
  with a lot prepared by the Inventory owner; Cataloging must not manufacture a
  lot or modify quantity/placement just to unblock its own acceptance tests.
- Separately scope/implement approved restore rules before restoration can be tested.
- Follow up unresolved history-navigation timing OBS-001 (recorded in PR #156),
  plus the remaining access/failure/concurrency/private-media checks. Functional
  successes do not close that timing observation or establish full security.

AUD-002 remains **In progress**. Stop this batch here; choose the next scoped
testing/implementation task explicitly after reviewing these gaps.

#### BAK-001 read-only empty-history browser evidence - 2026-10-19

Supervised Playwright ran the real Backup History page in isolated Edge session
`biosphere-backup-001` after manual curator login. Baseline history contained
zero rows. All six exercised checks passed:

1. The page loaded its explicit empty-history state rather than an error or
   substituted sample records.
2. A unique no-match search retained zero rows and no stale pagination.
3. Combined search/status/type/date/page-size values survived a reload and
   remained visible in their controls, with an empty result.
4. All four page-size controls (10/25/50/100) could be submitted and retained;
   zero visible rows stayed within each bound. This is not positive-data
   pagination or filter accuracy proof.
5. An inverted date range showed the explicit start/end validation message
   without displaying history rows.
6. Clear reset all filter controls, restored the default 25-row setting, and
   returned to the same empty baseline.

Positive status/type/creator/date matching and Next/Previous pagination were
not exercised because no baseline records or second page existed. The combined
empty query proves control/URL round-tripping, not that each predicate correctly
includes/excludes stored history. Keep BAK-001 **In progress**, not Pass.

No backup was created, downloaded, restored, deleted, or seeded. No credentials
were exported or API responses mocked. The test browser was closed; the local
script remains Git-ignored at frontend
`tools/browser/artifacts/bak-001-history.txt`. Checkout references at execution:
frontend `e43e7fc`, backend `ccf8bfa`; served build revisions were not independently
verified. No application code changed; full lint/unit/build were not rerun for
this documentation-only evidence. Next safe coverage is isolated backend tests
with in-memory history fixtures, not creating a real backup solely for test data.
BAK-002 real backup/restore remains Deferred under its existing approval gate.

#### Backup backend isolated-suite evidence - 2026-10-19

At backend checkout `001fd4b`, existing focused checks completed:

| Command | Result |
| --- | --- |
| `npm test -- --runInBand --runTestsByPath src/backup/backup.service.spec.ts` | 6/6 passed |
| `npm run test:e2e -- --runInBand --runTestsByPath test/backup.e2e-spec.ts` | 4/4 passed, with the fixture warning below |

Both suites replace Prisma; the HTTP suite also replaces Supabase before app
initialization. History records are mocked. These tests do not execute backups,
download artifacts, restore data, or write live records. They check metadata
projection without private storage paths, creator/type/status/date query
arguments, UUID/text search construction, nullable creators, unknown records,
401/403 responses, rejected query values, and absence of routine mutation routes.
Mocks return predefined records, so these checks do not substitute for accurate
filtering/pagination over a real populated history or a live database.

The HTTP run logged `Cannot read properties of undefined (reading 'create')`
while recording `ACCESS_DENIED`: its Prisma mock has no `audit_log` delegate.
SecurityAuditService catches the error, so 403 passing does not prove the denial
was audited. DEF-016 records this Backup test-harness gap separately from the
Audit fixture repaired in PR #147. No production defect is claimed or fixed.

BAK-001 remains In progress, BAK-002 remains Deferred. No application or test
code changed; full lint/build and unrelated suites were not rerun for this
documentation update. Correct the Backup fixture and add a failure-sensitive
denial-audit assertion next, without changing auth production code.

#### Backup denial-audit fixture repair - 2026-10-20

On `fix/backup-denial-test-fixture`, the new HTTP regression first failed:
developer access returned 403, but the curator's audit history contained no
denial event. Adding the missing Prisma mock write delegate made the same
regression pass. Writes populate a fresh per-test list, rather than seeding
the expected denial; real guards and audit services remain in the request path.

- `npm run test:e2e -- --runInBand --runTestsByPath test/backup.e2e-spec.ts`:
  5/5 passed, with no missing-audit-mock errors.
- `npm test -- --runInBand --runTestsByPath src/backup/backup.service.spec.ts`:
  6/6 passed.
- `npm run lint:ci`: passed with 0 errors and 7 unused-disable warnings in
  unchanged files. `git diff --check` also passed.

The regression verifies the developer actor, `ACCESS_DENIED`, `DENIED`, and
request/role details through the authorized curator `/audit-logs` response.
DEF-016 is Ready for retest. No production code, real backups/restores,
artifact access, live writes, or browser authentication changes are included.
BAK-001 remains In progress; populated live-history filtering and persistence
are not proven by these mocks. BAK-002 remains Deferred.

#### AUD-001 supervised read-only browser evidence - 2026-10-19

Used isolated Edge session `biosphere-audit-001` after manual curator login.
Playwright drove the real Audit Logs filter form and pagination, without API
mocking or audit mutations. The known FAQ acceptance fixture
`231d8430-41d9-4d84-ab2b-1f8ddb6b8a4a` supplied independently known create/edit
actions and a 2026-10-19 museum-local date. All 12 checks passed:

1. UUID search returned the fixture's expected `CREATE_FAQ_ENTRY` and
   `UPDATE_FAQ_ENTRY` actions, with `faq` module, `faq_entry` record type, and
   `SUCCESS` results.
2. Combined record search, module, update action, result, record type, and
   same-day date range returned matching fixture rows only.
3. Reload preserved those rows and all submitted filter controls.
4. Switching to the create action returned the matching create event.
5. Actor-name text search returned rows whose displayed names matched the
   search; actor identity was kept in memory, not published in this evidence.
6. A mismatched module excluded the known fixture.
7. A failed-result filter excluded its successful events.
8. The preceding local day excluded the fixture events.
9. A unique no-match query showed an empty list without stale detail content.
10. A reversed date range showed the explicit start/end validation message,
    without audit rows.
11. Clear reset all filters and restored bounded default-page results.
12. Next returned a nonempty second page of at most 25 rows without first-page
    row overlap; Previous restored the original first page.

The initial actor-search attempt incorrectly included the avatar initials in
the test's search string. Corrected the diagnostic locator to read only the
name span and reran the complete read-only test successfully. This was a
harness issue, not a reproduced application defect.

Closed only the named test browser. The local diagnostic script remains
Git-ignored at frontend `tools/browser/artifacts/aud-001-filters.txt`. Checkout
references were frontend `e43e7fc` and backend `65f72c7`; actual served build
revisions were not independently verified. Unrelated audit rows and actor
names were compared in memory rather than included in shared results.

AUD-001 remains **In progress**: access denial/session expiry, actor-ID API
filtering, all page-size choices, exact midnight/date bounds, concurrent
pagination, and request-failure UI were not tested. Date exclusion of an
earlier day is not full boundary coverage. Failed-result exclusion is not
positive coverage of failed/denied fixtures. This does not sign off AUD-002's
Cataloging revision/audit traceability or backup/restore. No app code changed;
full lint/unit/build suites were not rerun for this documentation-only update.

#### AUD-001 read-only museum-date browser check - 2026-10-22

Confirmed PR #168 merged with successful CI; backend checkout base `eb661a4`,
frontend `0ffa81f`. Exact running build hashes were not independently inspected.
Used existing signed-in Edge session `biosphere-aud002` and retained disposable
specimen `3e7a3ca2-bf8f-45c9-98d3-94b8bcf31419`; no new events were generated.

Protected specimen read provided the fixture's creation timestamp, whose UTC
date is `2026-10-21` and independently formatted Asia/Manila date is
`2026-10-22`. Through the actual Audit Logs page, filtered by that specimen
UUID, module `specimens` and action `IMPORT_SPECIMEN`:

- From/To both `2026-10-22` returned exactly its one import event. Controls
  matched the applied range, and reload retained the same result.
- From/To both `2026-10-21` showed the empty state with no stale import row.
- From `2026-10-23`, To `2026-10-22` showed the start/end validation message,
  with no stale import row. Returning to the valid museum-day range restored
  exactly one matching event.

Browser request listener observed zero POST/PUT/PATCH/DELETE requests. No
records, backups, Inventory data, auth state or server processes were changed;
no API response was mocked. Browser stays open and signed in on the valid audit
range. Local diagnostic remains ignored at frontend
`tools/browser/artifacts/aud001-museum-date-boundary.txt`.

This passes the tested live date-membership/reload/recovery case, not exact
midnight/subsecond edges, raw audit timestamp verification, live authorization,
outage handling, concurrency or independent full AUD-001 acceptance. AUD-001
remains In progress; no new defect was reproduced. Documentation-only checks:
`git diff --check`; full local application suites/build not rerun. Session ends
here as requested; remaining access/failure cases are future scoped work.

#### AUD-001 signed-out live access check - 2026-10-22

Used a new empty browser context inside existing Edge session
`biosphere-aud002`, without copying cookies or exporting authentication state.
The curator's existing audit tab was left unchanged. Backend checkout was
`ad0711c`, frontend `0ffa81f`; exact running build hashes were not inspected.

- Anonymous navigation to `/audit-logs` redirected to `/login` with
  `from=/audit-logs` and a visible password field, not the Audit Logs heading.
- A direct filtered audit bookmark for disposable specimen
  `3e7a3ca2-bf8f-45c9-98d3-94b8bcf31419` also redirected to login; the rendered
  login body did not contain that specimen UUID or an Audit Logs heading.
- A separate anonymous GET to `http://localhost:3001/audit-logs` returned HTTP
  `401` with `statusCode: 401`, not an array or an `items`/`data` response.
- The temporary anonymous context was closed. The original curator tab kept
  its URL and visible Audit Logs heading; no sign-out or sign-in was performed.

No mutation requests were submitted by this diagnostic, API responses were
not mocked, and no museum records, Inventory data or server processes were
changed. Local diagnostic remains ignored at frontend
`tools/browser/artifacts/aud001-signed-out-access.txt`. No new defect was
reproduced. This establishes the tested anonymous denial paths, not a full
security review: wrong-role/deactivated accounts, expired sessions, backend
outages, exact boundary cases and full AUD-001 acceptance remain pending.
Documentation-only verification: `git diff --check`; application suites/build
were not rerun for this evidence update.

#### Audit backend isolated-suite evidence - 2026-10-19

At backend checkout `021fe0e`, the existing focused suites completed:

| Command | Result |
| --- | --- |
| `npm test -- --runInBand --runTestsByPath src/audit/audit.service.spec.ts` | 6/6 passed |
| `npm run test:e2e -- --runInBand --runTestsByPath test/audit.e2e-spec.ts` | 5/5 passed, with the test-harness warning below |

Both suites inject Prisma mocks; the HTTP suite also overrides Supabase before
Nest initialization. No live audit writes, browser sessions, or backup/restore
operations were used. Coverage includes 401 without authentication, 403 for a
developer token, invalid filters/timestamps/pagination/UUIDs, response shape,
nullable actors, missing records, filter/order/query arguments, inverted ranges,
and 404 for routine audit POST/PATCH/DELETE routes.

The HTTP run logged `this.prisma.audit_log.create is not a function` while
recording `ACCESS_DENIED`. Its read-only Prisma fixture omits the create method
now used by `SecurityAuditService`. The service catches logging failures, so
403 still passed; denial-audit creation was not verified. DEF-015 records this
reproduced test-harness defect, not a demonstrated live persistence failure.
Do not suppress the error instead of correcting the fixture and asserting the
expected denial event in a follow-up coordinated with the auth owner.

AUD-001 remains **In progress**: focused mock-backed tests do not prove live
audit persistence, session expiry, inactive-account denial, or database date
boundaries. No application/test code changed here, and no full lint/build or
remaining test suites were run for this documentation-only update.

#### DEF-015 test-fixture repair verification - 2026-10-19

Followed a red/green cycle at the existing HTTP boundary: the new denial-event
regression failed before the fixture correction, then passed within the full
Audit HTTP suite (6/6). Audit service tests also passed 6/6. The developer GET
still returned 403, and an authorized curator GET exposed the expected denial
event with the developer actor and request metadata. The Prisma create mock
now stores events in the same per-test collection used by read/count delegates.
No production/auth code changed, no logger was silenced, and the missing-create
error did not appear in the focused green rerun. See DEF-015 for evidence and
independent-retest status. These mocked checks do not prove live persistence
or complete AUD-001 acceptance.

Full `npm run lint:ci` passed after correcting test formatting (zero errors,
seven unused-disable warnings). `git diff --check` passed. A production build
and unrelated test suites were not rerun for this test-fixture-only repair.

#### AUD-002 media replacement/removal browser evidence - 2026-10-21

Continued in signed-in isolated Edge session `biosphere-aud002` on disposable
specimen `5b8e55d4-af0f-4263-9b0e-349b4b314f20`. PRs #153-#155 were still open
at the start; none was automatically merged. Identified the two test media
through fixture-scoped creation metadata, guarded the specimen test name,
and observed eighteen revisions plus one audit for image A and three for B.

The completed run passed 78 executed assertions (includes repeated readiness/
decoding checks; not 78 acceptance cases):

- Selected a generated replacement PNG, cancelled its confirmation, and verified
  the original 32 x 32 image and both histories remained unchanged.
- Confirmed replacement of cover image `TEST AUD-002 media B edited` with a
  generated green 48 x 48 PNG. The UI request succeeded, retained the same media
  UUID, and reported `previousStorageCleanupPending: false`. New dimensions and
  a different private object path were observed, without exporting signed URLs.
  Caption, display order 2, cover status, and total two media records persisted.
- Exactly one `Image file replaced` revision used safe previous/replacement
  labels, and one `REPLACE_SPECIMEN_MEDIA_FILE` audit identified the same media,
  specimen, and MIME type. Reload retained the 48 x 48 replacement and the
  unchanged 32 x 32 image A.
- Cancelled removal and verified both images/histories were unchanged. Confirmed
  removal of B: only B disappeared, A became cover, and reload preserved this.
  Exactly one `Image removed` revision showed `Image recorded` -> `No image record`.
  One `REMOVE_SPECIMEN_MEDIA` audit identified B, `wasCover: true`, and A as
  `replacementCoverId`; the UI reported no pending cleanup.
- Removed the remaining generated image A. Exactly one further removal revision
  and audit recorded `wasCover: true`, `replacementCoverId: null`. The empty-media
  message and zero media cards persisted after reload. Earlier media audit
  entries and all observed revisions remained available after removal.
- For replacement and both removals, verified exact affected `specimen_media`
  UUID, exact specimen UUID in details, module `specimens`, result `SUCCESS`,
  matching nonempty displayed revision/audit actor, curator role, media source,
  measured revision timestamp window (five-second tolerance), and matching
  audit/revision displayed minute.

Counts were revisions 18 -> 19 -> 20 -> 21 for baseline/replacement/B removal/
A removal. Final audits were two for A (create/remove) and five for B
(create/metadata/cover/replace/remove). Replacement/removal reported completed
storage cleanup; physical object deletion/revocation was not independently probed.
Only the two generated test images were removed through the UI; they can be
regenerated but were not moved to a recoverable trash. No museum media was used.

Diagnostic incidents were preserved rather than hidden: an initial dimension
helper omitted its browser-side argument and was corrected before mutation.
A later history navigation exceeded the default 30-second `load` deadline.
Read-only state checks confirmed the unchanged eighteen-revision baseline and
zero replacement/removal events before rerunning. Added DOM-readiness navigation
and a 60-second ceiling; the full functional run then passed. The original delay
is still an unresolved observation, tracked as **OBS-001** in TEST_DEFECT_LOG.md,
not a proven/fixed application defect or a performance pass.

No direct database writes, request mocks, inventory/lots/storage hierarchy,
publishing, production source changes, or credential/auth-state exports were
used. Diagnostic remains ignored locally at frontend
`tools/browser/artifacts/aud-002-media-replacement-removal.txt`, not a maintained
CI test. Browser remains open and signed in on the empty-media page.

Checkout references: frontend `e43e7fc`, backend `39b9aac`; actual served build
revisions not independently verified. Actor UUID equality, exact audit database
timestamps, full pixel integrity, old signed-link revocation, invalid/oversized
uploads, failure/rollback/concurrency, and production security remain unproven.
AUD-002 remains **In progress** for lifecycle/public eligibility; this is not
full CAT-011 or performance/security acceptance. Documentation only;
`git diff --check` passed; full lint/unit/build suites were not rerun.

#### AUD-002 core-edit traceability browser evidence - 2026-10-21

Used isolated headed Edge session `biosphere-aud002` after manual curator
login. The existing Playwright CLI diagnostic exercised the real frontend
forms and server-backed history views without request mocking or direct
database writes. PR #147 was confirmed merged before this check.

Created a disposable uncataloged specimen named `TEST - AUD-002 Trace 20261021`
with ID `5b8e55d4-af0f-4263-9b0e-349b4b314f20`. Left collection and accession
unassigned; no lots, inventory operations, storage changes, or publishing were
performed. Initial remarks were `AUD-002 initial remarks 20261021`; the only
edit changed them to `AUD-002 verified remarks 20261021`.

All 13 diagnostic assertions/check groups passed:

1. Before editing, fixture UUID search returned exactly one `CREATE_SPECIMEN`
   audit entry with the expected affected record and `SUCCESS` outcome.
2. Saving the remarks edit returned to specimen details and showed the new value.
3. Revision count increased from 0 to exactly 1.
4. The Remarks revision contained the exact independently specified old/new values.
5. Audit and revision displayed the same nonempty actor name.
6. The update audit identified the fixture UUID and `specimen` record type.
7. Exactly one `UPDATE_SPECIMEN` entry had module `specimens` and result `SUCCESS`.
8. Its structured metadata was exactly `{ "fields": ["remarks"] }`.
9. The revision timestamp fell within the measured edit window with a five-second
   clock tolerance; the audit and revision displayed the same formatted minute.
10. The selected audit detail identified the actor's role as `CURATOR`.
11. Reload preserved the audit count and complete observed revision; the edit
    form also reloaded the saved remarks.
12. Submitting the unchanged edit form showed `No changes were saved` and
    remained on the edit route.
13. Reading both histories again showed no extra or altered entries: one
    revision and two audits (creation plus the one successful edit).

A final read-only specimen-detail check confirmed it remained `UNCATALOGED`.
The fixture is intentionally retained for review; it was not archived or deleted,
which would introduce additional lifecycle events. No credentials/auth state or
unrelated museum rows were exported. Actor names were compared in memory rather
than recorded here. The local diagnostic is Git-ignored at frontend
`tools/browser/artifacts/aud-002-trace.txt`; it is fixture-specific, not a
maintained repeatable CI suite. Its pre-edit value guard prevents blindly
repeating the mutation against an already-changed fixture.

The first sidebar navigation attempt used a link locator where this page had
no matching link. It timed out without mutation; navigating to the known
specimen form resolved the diagnostic issue. No application defect was
reproduced by this test, so no new defect entry was added.

Checkout references were frontend `e43e7fc` and backend `2da6b72`; actual
served build revisions were not independently verified. AUD-002 remains
**In progress**: this is one core-field case, not blanket acceptance for
taxonomy, provenance, tags/media, completion/reopening, archive/restore, or
public-eligibility auditing. Actor equality was checked by displayed name,
not independently by account UUID; audit timestamps were compared at displayed
minute precision, not exact database timestamps. Transaction rollback,
concurrent writes, adversarial access, and production security are not proven.
Only this documentation changed; full lint/unit/build suites were not rerun.

#### AUD-002 media upload/metadata/cover browser evidence - 2026-10-21

Used signed-in isolated Edge session `biosphere-aud002` and disposable specimen
`5b8e55d4-af0f-4263-9b0e-349b4b314f20`. PRs #153/#154 remained open at the
start; no automatic merge was performed. Verified fixture name, no initial
media, and the previous tag-change baseline of thirteen revisions.

Generated two 32 x 32 PNG fixtures in browser memory (red/blue blocks, not museum
photographs) and submitted them through the real upload form. Captions were
`TEST AUD-002 media A` and `TEST AUD-002 media B`; display orders were 0 and 1.
Cover upload checkboxes were unchecked. Verified the first image became cover
automatically, while the second did not displace it.

The completed recovery run passed 74 executed assertions, including repeated
view-availability/image-decoding checks, not 74 acceptance cases:

- Each upload produced exactly one `Image added` revision and one
  `CREATE_SPECIMEN_MEDIA` audit. History used `No image record` -> `Image recorded`
  instead of exposing raw storage paths. Creation metadata had exactly the
  specimen UUID, display order, expected cover flag, and MIME type `image/png`.
- Changed the second image's caption to `TEST AUD-002 media B edited` and order
  from 1 to 2. Exactly two revisions showed those old/new values; one
  `UPDATE_SPECIMEN_MEDIA` audit listed only `caption` and `display_order`.
- Set the second image as cover. It gained the cover marker and lost its
  redundant set-cover control; the first image lost its marker. Exactly one
  `Cover image changed` revision used safe previous/selected labels, and one
  `SET_SPECIMEN_MEDIA_COVER` audit identified the original cover's media UUID.
- For all four actions (two creates, metadata, cover), verified media UUID as
  affected `specimen_media` record, exact specimen UUID in details, module
  `specimens`, result `SUCCESS`, matching displayed actor, media revision source,
  curator role, and audit/revision displayed minute. The second upload/edit/cover
  revisions were bounded to measured operation windows with five-second tolerance.
- Before and after reload, both image previews decoded at the expected 32 x 32
  dimensions and used signed-object URL paths with a token query parameter.
  URLs/tokens were not exported. Reload retained two media records, caption/order,
  and exactly the selected cover. Submitting unchanged metadata displayed
  `No changes were saved` and altered/added no observed revision or media audit.

Counts across baseline/first upload/second upload/metadata/cover were revisions
13 -> 14 -> 15 -> 17 -> 18. First media retained exactly one creation audit;
second media retained exactly three audits (create, metadata update, cover).

The initial run stopped after the first upload because the diagnostic compared
JSON serialization order, even though JSON object key order is not meaningful.
Read-only inspection confirmed every expected metadata key/value. Recovery
compared exact values/key count independent of order, guarded the already-saved
image, and did not upload it again. Its original pre-upload baseline was
observed by the first run; first-image revision time was checked against
museum-day bounds during recovery, not the precise initial upload window.
This was a harness issue, not an application defect; no new application defect
was reproduced. Scripts remain ignored locally at frontend
`tools/browser/artifacts/aud-002-media.txt` and `aud-002-media-resume.txt`, not CI.

Two labelled test images remain in private specimen storage for follow-up tests.
No request mocking, direct database writes, inventory/lots/storage hierarchy,
publishing, production source changes, or auth-state exports were used. Browser
remains open and signed in on media management as requested. Actor names and
private URLs are not included in committed evidence.

Checkout references: frontend `e43e7fc`, backend `39b9aac`; actual served build
revisions were not independently verified. Actor UUID equality, exact audit
timestamps, pixel-content integrity, URL expiry/revocation, unauthorized image
access, invalid/oversized uploads, concurrency, and storage rollback were not
established. AUD-002 remains **In progress** for media replacement/removal and
lifecycle/public eligibility. This is not full CAT-011 or security sign-off.
Documentation only; `git diff --check` passed; full lint/unit/build not rerun.

#### AUD-002 taxonomy traceability browser evidence - 2026-10-21

Continued in isolated Edge session `biosphere-aud002` after manual login,
using the same disposable specimen `5b8e55d4-af0f-4263-9b0e-349b4b314f20`.
Verified its test name before mutation and confirmed the taxonomy form was in
create mode with all ten fields empty. Existing core-test baseline was one
revision and two fixture-scoped audit entries.

The supervised UI diagnostic completed all 44 executed assertions (including
initial-empty-field and repeated view-availability checks; not 44 separate
acceptance test cases):

- Created taxonomy with kingdom `Animalia` and habitat `TEST AUD-002 habitat A`.
  History gained exactly two revisions from `Not recorded` to the specified
  values, both under `Specimen Taxonomy`. Audit gained exactly one
  `CREATE_SPECIMEN_TAXONOMY` entry with fields `kingdom` and `habitat`.
- Reopened the form in edit mode and confirmed the saved values. Changed only
  habitat to `TEST AUD-002 habitat B`. History gained exactly one habitat
  revision with the expected old/new values and taxonomy source. Audit gained
  exactly one `UPDATE_SPECIMEN_TAXONOMY` entry with only `habitat` in its fields.
- For both actions, verified module `specimens`, result `SUCCESS`, record type
  `specimen`, the exact fixture UUID, matching nonempty displayed actor names,
  and curator role in the selected audit detail. Revision timestamps fell in
  the measured operation windows with five-second tolerance; audit and revision
  matched at displayed-minute precision.
- Reloaded and confirmed saved taxonomy values, observed revision contents,
  and audit count persisted. Submitting the unchanged taxonomy showed
  `No changes were saved` and remained on the form. Subsequent reads showed no
  extra or altered audit/revision entries. Counts were revisions 1 -> 3 -> 4
  and audits 2 -> 3 -> 4 across baseline, creation, and edit.

No request mocking, direct database writes, inventory/lots/storage operations,
publishing, credential export, or production source changes were used. No new
application defect was reproduced. The fixture-specific diagnostic remains
ignored at frontend `tools/browser/artifacts/aud-002-taxonomy.txt`; it checks
the expected baseline before mutation and is not a maintained CI suite.
Per the user's preference, the isolated browser was left open and signed in
on the taxonomy form; auth state was not exported or saved for reuse.

Checkout references: frontend `e43e7fc`, backend `6df5825`; actual served build
revisions were not independently verified. Actor identity was compared by
displayed name, not account UUID; exact audit database timestamps, concurrent
updates, transaction rollback, and authorization attacks were not tested.
AUD-002 remains **In progress** for provenance, tags/media, and lifecycle/public
eligibility traceability. This evidence does not replace broader taxonomy
validation or independent acceptance. Documentation-only change;
`git diff --check` passed, and full lint/unit/build suites were not rerun.

#### AUD-002 tag-change traceability browser evidence - 2026-10-21

Used signed-in isolated Edge session `biosphere-aud002` and test specimen
`5b8e55d4-af0f-4263-9b0e-349b4b314f20`. PR #153's preceding attach/detach
evidence was still open when this independent case began; it was not merged
automatically. The observed live baseline had eleven revisions and no attached
tags. Guarded the fixture's test name before any mutation.

Reattached existing vocabulary `TEST - AUD-002 Trace Tag 20261021` as setup,
then changed it to `TEST - AUD-002 Changed Tag 20261021`. All 49 executed
assertions passed, including repeated availability checks, not 49 separate
acceptance cases:

- Setup reused vocabulary (`createdVocabulary: false`), added one revision,
  and added one attach audit on a new relationship. Identified that relationship
  by comparing before/after audit records, not by confusing it with the earlier
  detached relationship. Discovery was bounded to the newest 100 attach audits.
- Change retained exactly one attachment with only the new name. Exactly one
  `Specimen Tags` revision captured the original name -> changed name.
- Exactly one `CHANGE_SPECIMEN_TAG` audit identified the same relationship,
  module `specimens`, and result `SUCCESS`. Its exact metadata keys were
  `specimenId`, `tagId`, `previousTagId`, `previousTagName`, `tagName`, and
  `createdVocabulary`; verified the fixture UUID, original tag ID/name, distinct
  valid replacement tag UUID/name, and `createdVocabulary: true`.
- Both setup/change audits matched their revision's displayed actor, tag
  source, and displayed timestamp minute; selected details showed `CURATOR`.
  Revision timestamps fell within measured operation windows with five-second
  tolerance. Reload retained observed revisions, audit count, and the changed tag.
- Exact-name and lowercase-name change submissions each showed the explicit
  already-current-name message. Subsequent reads showed no additional or
  altered revision or relationship audit. The old shared vocabulary remained
  a reusable suggestion, rather than being globally renamed.

Counts were revisions 11 -> 12 -> 13 across baseline/setup/change. The new
relationship had exactly two audits (setup attach plus change). The changed
test tag remains attached for review; both shared test names are retained.
No request mocks, direct database writes, inventory/lots/storage/publication
operations, production source changes, or credential/auth-state export were
used. No application defect or failed assertion occurred in the completed run.
The fixture-specific diagnostic remains ignored locally at frontend
`tools/browser/artifacts/aud-002-tag-change.txt`, not a maintained CI test.
Browser remains open/signed in with the unsaved attach input cleared.

Checkout references: frontend `e43e7fc`, backend `39b9aac`; actual served build
revisions were not independently verified. Actor equality was by displayed
name, not account UUID; exact database audit timestamps, cross-specimen effects,
merging into an already-attached target tag, concurrency, rollback, and security
were not established. AUD-002 remains **In progress** for media and lifecycle/
public eligibility. Documentation only; `git diff --check` passed;
full lint/unit/build suites were not rerun.

#### AUD-002 provenance traceability browser evidence - 2026-10-21

Continued in signed-in isolated Edge session `biosphere-aud002` with the same
disposable fixture `5b8e55d4-af0f-4263-9b0e-349b4b314f20`. PR #151 was confirmed
merged. Verified fixture name, create mode, and all six provenance fields empty;
observed baseline was four revisions and four fixture-scoped audit entries.

Created provenance with collection date `2026-10-20`, collection location
`TEST AUD-002 location A`, preservation type `TEST AUD-002 preservation type`,
and preservation method `TEST AUD-002 preservation method`. Collector/donor
were left empty. These are acceptance fixtures, not museum factual claims.
Creation added exactly four revisions from `Not recorded` to the specified
values under `Specimen Provenance`, and exactly one
`CREATE_SPECIMEN_PROVENANCE` audit whose field list contained only
`collection_date`, `collection_location`, `preservation_type`, and
`preservation_method`.

The initial diagnostic stopped after creation: copying its source through
PowerShell without explicit UTF-8 decoding corrupted the middle-dot separator
used in source-label comparisons. The guarded recovery diagnostic first
validated the already-saved creation instead of creating again. It stopped
on the same encoding problem in the affected-record separator comparison;
correcting both comparisons with Unicode escapes resolved the harness issue.
These stops caused no repeated creation or extra mutation and are not
application defects. Recovery baseline counts were independently recorded by
the original run, not freshly measured before a second creation.

The completed recovery run passed 33 executed assertions (not 33 separate
acceptance cases), including creation verification and the following checks:

- Changed only collection location to `TEST AUD-002 location B`. Exactly one
  revision captured location A -> B and the provenance source; exactly one
  `UPDATE_SPECIMEN_PROVENANCE` audit contained only `collection_location`.
- For creation and update, the exact affected record was `specimen` plus the
  fixture UUID, module was `specimens`, result was `SUCCESS`, displayed actor
  names matched the corresponding revisions, and audit detail showed `CURATOR`.
- Creation revision timestamps were bounded to the current museum-local day
  through the recovery read (with five-second tolerance), not the original
  precise creation-operation window. The update revision was bounded to its
  measured operation window with five-second tolerance. Each audit matched its
  corresponding revision at displayed-minute precision.
- Reload preserved observed revision contents and audit count. The edit form
  retained the past collection date and changed location. Unchanged submission
  displayed `No changes were saved`, stayed on the form, and added/altered no
  revision or audit entry. Counts were revisions 4 -> 8 -> 9 and audits
  4 -> 5 -> 6 across baseline, creation, and update.

No request mocking, direct database writes, inventory/lots/storage management,
publishing, credential export, or production source edits were involved. No new
application defect was reproduced. Both fixture-specific diagnostics remain
ignored locally at frontend `tools/browser/artifacts/aud-002-provenance.txt`
and `aud-002-provenance-resume.txt`; they are not a repeatable CI suite. Browser
was left open and signed in on the provenance form as requested, without
exporting authentication state.

Checkout references: frontend `e43e7fc`, backend `94247eb`; actual served build
revisions were not independently verified. Actor UUID equality, exact audit
database timestamps, concurrent updates, rollback, authorization attacks,
future-date validation, and full provenance acceptance were not established
by this run. AUD-002 remains **In progress** for tags/media and lifecycle/public
eligibility traceability. Documentation only; `git diff --check` passed;
full lint/unit/build suites were not rerun.

#### AUD-002 tag relationship traceability browser evidence - 2026-10-21

Used the signed-in isolated Edge session `biosphere-aud002` and existing test
specimen `5b8e55d4-af0f-4263-9b0e-349b4b314f20`. PR #152 was confirmed merged.
The initial UI check observed nine revisions, no attached tags, and no exact
vocabulary suggestion for `TEST - AUD-002 Trace Tag 20261021`.

Attached that name through the UI, then verified:

- Exactly one attachment and one new `Specimen Tags` revision, with previous
  value `None (tag added)` and the exact test name as the new value.
- One `ATTACH_SPECIMEN_TAG` audit with module `specimens` and result `SUCCESS`.
  Its affected record was a valid `specimen_tag` relationship UUID, not the
  specimen UUID. Structured details identified the exact specimen, a valid tag
  UUID, the exact name, and `createdVocabulary: true` with no extra keys.
- A lowercase-name retry showed the explicit already-attached notice, retained
  one attachment, and created/altered no observed revision or relationship audit.
- Reload retained the attachment. Cancelling the detach dialog retained it;
  confirming detach then removed it and added exactly one inverse revision,
  ending in `None (tag removed)`.
- The `DETACH_SPECIMEN_TAG` audit used the original relationship UUID and exact
  specimen/tag/name metadata. Each audit matched its corresponding revision's
  displayed actor, taxonomy-independent tag source, displayed timestamp minute,
  and curator role in the selected detail panel.
- Reload retained both relationship audit entries and the observed revision
  contents. The detached tag remained absent; searching its exact vocabulary
  name returned a reusable suggestion. Selecting the suggestion filled the
  attach field without creating another relationship.

The completed guarded recovery diagnostic passed 39 executed assertions,
including repeated availability checks, not 39 acceptance cases. Revisions
were 9 -> 10 -> 11; the test relationship had one attach audit, then exactly
two audits after detach. Discovery inspected the bounded newest 100 attach
audits and matched fixture details in memory; subsequent audit reads were
scoped by relationship UUID, not by specimen UUID (which is nested in details).

The initial diagnostic stopped after attachment because it expected ordinary
field empty-value wording instead of the existing tag-specific wording. Recovery
validated the saved attachment without attaching again. Two further harness
issues were corrected: selecting by action alone matched multiple audit rows,
so the locator was narrowed to the exact relationship; a post-reload count ran
before the tag form finished rendering, so an explicit readiness wait was added.
No application defect was reproduced. Recovery runs repeated only the safe
case-variant no-op until the final successful detach. The attach revision time
was checked against museum-day bounds during recovery, not its original precise
operation window; detach used its measured window, both with five-second tolerance.

Only labelled test vocabulary/relationship data was changed through the UI.
The shared vocabulary remains intentionally retained for review. No direct
database writes, request mocks, inventory/lots/storage/publishing operations,
production source changes, or auth-state exports were used. Actor names and
unrelated audit content are not included in this committed evidence. Diagnostics
remain ignored locally at frontend `tools/browser/artifacts/aud-002-tags.txt`
and `aud-002-tags-resume.txt`; these fixture-specific scripts are not CI tests.
The browser remains open and signed in on the tag page as requested.

Checkout references: frontend `e43e7fc`, backend `39b9aac`; actual served build
revisions were not independently verified. Actor UUID equality, exact audit
timestamps, cross-specimen reuse, concurrent requests, rollback, and adversarial
access were not established. AUD-002 remains **In progress** for tag change,
media, and lifecycle/public eligibility traceability. Documentation only;
`git diff --check` passed; full lint/unit/build suites were not rerun.

## 9. John Gerozaga acceptance register

Record results with the same statuses and evidence rules as Section 8. Curator
Dashboard, General Inquiry Management, and Public Museum Website are shared
modules; Charles Boquecosa (and Voltaire Ratilla for the website) should run
the independent pass. Catalog search mechanics belong to Cataloging (CAT-012);
the SRCH cases below cover only the inventory-oriented filters, columns, and
sorts added under SRS 4.7 (REQ-4.7-02/03).

### Specimen Inventory Management

Inventory owns lots, quantities, condition, placement, movements, quantity
adjustments, and transaction history (SRS 4.5; `SPECIMEN_LOTS_GUIDE.md`). Use a
disposable `TEST -` specimen and storage units that hold specimens.

| ID      | Test                                                                                            | Expected result                                                                                                                                         | Status  |
| ------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| INV-001 | Create a lot in a specimen-holding unit; retry with the same unit and condition in another case | Quantity, condition, and placement persist after reload; the case-variant duplicate (`Good`/`good`) is rejected rather than silently added to           | Not run |
| INV-002 | Create or move a lot so a unit's active quantity exceeds its capacity                           | The operation succeeds with a visible capacity warning (advisory, REQ-4.6-11); a unit without capacity never warns                                      | Not run |
| INV-003 | Move part of a lot, then the rest, to another holding unit                                      | Specimen total is unchanged; a partial move splits, a full move deactivates the source; a matching target is increased; one `MOVEMENT` each             | Not run |
| INV-004 | Change the condition of part of a lot, including to a case variant of an existing lot           | Total is unchanged; the case variant merges into the existing lot; a no-op condition is rejected as unchanged                                           | Not run |
| INV-005 | Apply each quantity-adjustment type with a reason                                               | Sign rules hold (`ADDITION` positive, losses negative, `DATA_CORRECTION` either); reducing to zero deactivates the lot; history is recorded             | Not run |
| INV-006 | Submit an adjustment from a stale screen; overdraw; zero delta; blank reason                    | A stale `expectedQuantity` returns a reload-required conflict; the others are rejected; nothing changes                                                 | Not run |
| INV-007 | Operate on an archived specimen, an inactive lot, an archived unit, and a non-holding unit      | Each is rejected with a clear message and no partial change (reductions from a reconfigured unit remain allowed)                                        | Not run |
| INV-008 | Review the specimen lot history and the per-location lot-movement feed                          | Every operation above appears once with type, quantity, source, target, curator, reason, and Philippine-time timestamp                                  | Not run |
| INV-009 | Trace inventory operations to revision history and the audit log                                | Each accepted operation has matching revision and audit entries attributed to the acting curator                                                       | Not run |
| INV-010 | Check derived storage paths on lots, specimen details, and the catalog table                    | Paths read `Room › Cabinet › Drawer`, update after a move, and archived units are labelled                                                              | Not run |

### Curator Dashboard

| ID       | Test                                                                                         | Expected result                                                                                                                         | Status   |
| -------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| DASH-001 | Compare the status cards with the catalog                                                    | Total, Uncataloged, Cataloged, and Archived match `/specimens` filtered by status; "added this month" uses Philippine time (REQ-4.3-01) | Not run  |
| DASH-002 | Compare Pending Requests with the Public Website lists                                       | Pending inquiries and visit requests match their `PENDING` lists (REQ-4.3-02)                                                           | Not run  |
| DASH-003 | Open every stat card and quick action                                                        | Each opens the matching filtered list or module, including review requests, reports, and offline drafts (REQ-4.3-04, §4.3.2)            | Not run  |
| DASH-004 | Check the category donut, 12-month trend, queue, recent records, and QR readiness            | Values match the underlying records; recent rows show the largest active lot's path and condition                                       | Not run  |
| DASH-005 | Create an offline draft, go offline, reconnect, and force a sync failure                     | The Offline Drafts panel shows Online/Offline and Pending Sync, Synchronizing, Synchronized, and Sync Failed counts (REQ-4.3-03)        | Not run  |
| DASH-006 | Submit a public inquiry and a visit request                                                  | The notification bell lists both and opens the related record; the authorized curator receives the alert email (REQ-4.3-05/06/09)     | Not run  |
| DASH-007 | Mark a notification read or dismissed                                                        | Deferred: notification state needs a notification table (REQ-4.3-07); on hold by owner decision                                         | Deferred |
| DASH-008 | Load the dashboard as a developer, signed out, and with one backend endpoint failing         | Developer and signed-out access are refused; a failing section shows its own error while the others still render                        | Not run  |

### Reports and Data Export

| ID       | Test                                                                                                                                              | Expected result                                                                                                                                         | Status  |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| RPT-001  | Generate the Consolidated report for a month, a year, and a custom range, with remarks                                                            | DOCX and PDF open; every total matches the records for the period; remarks appear; editing the DOCX changes nothing in BioSphere (REQ-4.7-05/06/11/16) | Not run |
| RPT-002  | Generate the Inventory report complete and filtered (status, category, taxonomy, condition, location with and without sub-locations, public display, date added) | Rows match the catalog for the same filters; CSV, PDF, and DOCX open; the confidentiality notice is on every page (REQ-4.7-07/12/13)     | Not run |
| RPT-003  | Generate the General Inquiry Summary by period and status                                                                                         | Counts and rows match the inquiry list; private details appear only in this internal report (REQ-4.7-08/13)                                            | Not run |
| RPT-004  | Generate the Visit-Request Summary by period and status                                                                                           | Request and visitor totals match the visit-request list (REQ-4.7-09)                                                                                    | Not run |
| RPT-005  | Generate the QR and AR Exhibit report, all and by AR availability                                                                                 | Published, unpublished, disabled, and AR-enabled counts match the exhibits page; archived exhibits are excluded (REQ-4.7-10)                            | Not run |
| RPT-006  | Generate the Audit Log report by module, action, and result                                                                                       | Rows match the Audit Logs page for the same filters; times are in Philippine time; the file is confidential (REQ-4.15-04)                              | Not run |
| RPT-007  | Request an unsupported format, an unsupported filter, a reversed or over-10-year range, and a report over 10,000 rows                              | Each is refused with an understandable message; no file is produced; the failed attempt appears in history (REQ-4.7-15)                                | Not run |
| RPT-008  | Review Report History and the summary cards; filter and page through history                                                                      | Every attempt lists curator, time, format, parameters, row count, and result; the cards count successful generations (REQ-4.7-14)                      | Not run |
| RPT-009  | Call the report endpoints as a developer and signed out; exceed 20 generations per minute                                                         | Developer and signed-out access are refused; the rate limit shows a clear wait-and-retry message                                                       | Not run |
| SRCH-001 | Filter the catalog by classification status, taxonomy rank, tag, condition, and date added                                                        | Results match exactly, ignoring case; a reversed date range shows an error instead of results (REQ-4.7-02)                                             | Not run |
| SRCH-002 | Filter by a storage location with and without its sub-locations                                                                                   | "Include units inside it" returns specimens in child units; "only directly in it" excludes them                                                        | Not run |
| SRCH-003 | Sort by category and family; check the Family, Active Qty, Condition, and Storage Location columns                                               | Sorting is stable with blanks last; the columns match each specimen's active lots (REQ-4.7-03)                                                         | Not run |

### General Inquiry Management

| ID      | Test                                                                                   | Expected result                                                                                                                                          | Status  |
| ------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| INQ-001 | Submit a public inquiry without an account                                             | It is stored with a unique ID, timestamp, `PENDING` status, and consent record; the visitor sees a confirmation (REQ-4.8-01/04)                          | Not run |
| INQ-002 | Submit blank, oversized, and invalid-email inquiries; exceed the public form rate limit | Each is rejected with field-level messages and nothing is stored (REQ-4.8-02/03)                                                                       | Not run |
| INQ-003 | Search and filter inquiries by status, text, and date                                  | Results match; the selected inquiry shows full details and history (REQ-4.8-05)                                                                          | Not run |
| INQ-004 | Move an inquiry through Reviewed and Closed                                            | Only approved transitions are allowed; each change is recorded with curator and time (REQ-4.8-06/11)                                                     | Not run |
| INQ-005 | Send a curator reply and add an internal note                                          | The reply is emailed and recorded with message, sending time, curator, and delivery result; the note stays internal (REQ-4.8-09/11)                     | Not run |
| INQ-006 | Refer an inquiry to a visit request                                                    | The inquiry becomes Turned to Visit Request; the visit request is created but never approved automatically (REQ-4.8-07)                                  | Not run |
| INQ-007 | Request inquiry data signed out or as a developer                                      | Access is refused; no inquiry data appears on public pages (REQ-4.8-10)                                                                                  | Not run |

### Public Museum Website

| ID      | Test                                                                                   | Expected result                                                                                                                                       | Status  |
| ------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| WEB-001 | Navigate Home, Gallery, Visit, and About; use Plan Your Visit                          | All four areas load; Plan Your Visit opens Visit; there is no Events page (REQ-4.10-01/02/03)                                                         | Not run |
| WEB-002 | Use the Visit area                                                                     | Visitor guidance, the inquiry form, and the formal visit-request form are reachable (REQ-4.10-05)                                                     | Not run |
| WEB-003 | Review Gallery and About content against museum-approved material                      | Blocked: stock placeholder images and a placeholder About contact remain; needs approved photos and staff/contact details (REQ-4.10-04/06)            | Blocked |
| WEB-004 | Inspect public pages and their network responses                                       | No storage locations, internal remarks, audit data, account data, or private visitor information appear (REQ-4.10-08)                                 | Not run |
| WEB-005 | Check desktop, tablet, and mobile widths with keyboard-only navigation                 | No horizontal scrolling; every control is reachable with visible focus; images have alt text (REQ-4.10-09)                                            | Not run |
| WEB-006 | Confirm the static pages have no editing route in the curator or developer interfaces  | Content changes require a source update and redeploy (REQ-4.10-07/10)                                                                                 | Not run |

## 10. Cross-cutting negative tests

Apply these cases to each important workflow:

- no, expired, or malformed authentication token;
- wrong role;
- inactive account;
- invalid UUID or missing record;
- blank, oversized, or invalid-enum input;
- repeated submission and browser refresh;
- concurrent or stale-page update;
- temporary backend/network failure;
- direct API request that bypasses frontend controls; and
- an operation against an archived record.

Expected failures must be safe: no partial mutation, no duplicate record, no
secret or stack-trace disclosure, and an actionable user-facing response.

## 11. Evidence required

For each test session record:

- date and tester;
- frontend and backend commit hashes;
- environment used;
- test-case IDs executed;
- actual result;
- screenshots or sanitized request/response when useful; and
- linked defect IDs for failures.

Do not mark a case `Pass` only because the page rendered. Verify the saved
database-backed result by reloading or retrieving it again.

## 12. Completion criteria

A module is accepted when:

- all critical and major test cases pass;
- no open security, authorization, data-loss, or data-integrity defect remains;
- important failure and retry paths pass;
- automated regression checks are green;
- deferred behavior is documented and not presented as working; and
- the module owner and at least one teammate record sign-off.

## 13. Sign-off

### Defect repair retest checkpoint — 2026-10-05

Historical checkpoint only. Use the 2026-10-22 reconciliation and current rows
in Section 8 for remaining work; do not infer current deployment state from
this older migration note or repeat already-confirmed subcases without cause.

Repairs for DEF-001, DEF-002, DEF-003 and DEF-009 are ready for manual
retest. Preserve the original failed acceptance results until the repair is
verified against the running frontend and backend; automated tests alone do
not turn those results into a `Pass`.

Retest in this order:

1. CSV preview: valid and invalid rows together must display row errors, not
   a gateway error. Confirm preview creates no records before testing commit.
2. Specimen selection: restart the frontend, then test selecting and clearing
   multiple records over LAN, direct detail links, refresh and browser Back.
3. Collections: test create and rename collisions with case and surrounding
   spaces, and confirm no extra collection or audit success entry is saved.
4. Provenance: reject tomorrow's date on create, update and import; accept
   today using the museum's Asia/Manila calendar. Check catalog readiness for
   a legacy future date without silently rewriting it.

The collection-name index migration is prepared but has not been applied to
Supabase. The read-only collision preflight found no duplicates on 2026-10-05;
repeat it immediately before deployment. Live database concurrency and LAN
interaction remain manual verification items. Detailed frontend steps are in
`biosphere-frontend/docs/cataloging-defect-retest.md`.

Local automated evidence for this repair:

- Frontend: lint and production build passed; 44 files / 259 tests passed.
- Backend: lint completed with zero errors and seven existing unused-disable
  warnings; build and Prisma schema validation passed.
- Backend unit tests: 52 suites / 665 tests passed.
- Backend e2e: 24 suites / 270 tests passed, with one suite / 17 tests skipped.
  The skipped/live-database checks are not counted as verified behavior.
- Dependency installation used the existing lockfile, without version changes.
  npm reported 11 dependency advisories (three moderate, eight high); dependency
  remediation is a separate review, not an automatic audit-fix operation.

| Module                      | Owner      | Independent reviewer | Date | Result  |
| --------------------------- | ---------- | -------------------- | ---- | ------- |
| Cataloging Management       | Kyer Jayme |                      |      | Pending |
| Storage Location Management | Kyer Jayme |                      |      | Pending |
| Offline Drafts and Sync     | Kyer Jayme |                      |      | Pending |
| FAQ Knowledge Management    | Kyer Jayme |                      |      | Pending |
| Audit and Backup History    | Kyer Jayme |                      |      | Pending |
| Specimen Inventory Management | John Gerozaga |                    |      | Pending |
| Curator Dashboard           | John Gerozaga, Charles Boquecosa |   |      | Pending |
| Reports and Data Export     | John Gerozaga |                    |      | Pending |
| General Inquiry Management  | John Gerozaga, Charles Boquecosa |   |      | Pending |
| Public Museum Website       | John Gerozaga, Charles Boquecosa, Voltaire Ratilla | |   | Pending |
