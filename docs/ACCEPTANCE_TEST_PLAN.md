# BioSphere Acceptance Test Plan

**Status:** Active testing  
**Environment:** Development / Supabase development project  
**Started:** 2026-09-29  
**Defects:** [TEST_DEFECT_LOG.md](./TEST_DEFECT_LOG.md)

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

### Cataloging Management

| ID      | Test                                                                           | Expected result                                                                                            | Status                                                                |
| ------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| CAT-001 | Create and rename a collection; retry the same normalized name                 | Valid unique names save; duplicates are rejected clearly                                                   | **Fail - DEF-001**                                                    |
| CAT-002 | Create complete and incomplete specimen drafts                                 | Both start `UNCATALOGED`; public display is off                                                            | **Pass**                                                              |
| CAT-003 | Edit specimen core fields and submit an unchanged form                         | Changes persist with revision history; no-change submission is rejected clearly                            | **Pass**                                                              |
| CAT-004 | Create and edit taxonomy                                                       | One taxonomy record exists; draft values and revisions persist                                             | **Pass**; completion requirement remains under CAT-006                |
| CAT-005 | Create and edit provenance; reject invalid dates                               | Values and revisions persist; empty values normalize; future collection dates are rejected                 | **Fail - DEF-002**                                                    |
| CAT-006 | View readiness with missing and complete requirements                          | Every approved rule reports the correct pass/fail state and fix location                                   | **Fail - DEF-002**                                                    |
| CAT-007 | Complete Cataloging with one prepared valid active lot                         | Status becomes `CATALOGED`; public display remains off; history/audit are written                          | **Pass** for lifecycle behavior; DEF-002 still blocks module sign-off |
| CAT-008 | Remove required data while Cataloged, then reopen with a reason                | Removal is blocked until reopening; reopening returns to `UNCATALOGED` and disables public display         | **Pass**                                                              |
| CAT-009 | Enable and disable public eligibility                                          | Only Cataloged specimens qualify; no exhibit is published automatically                                    | **Pass**                                                              |
| CAT-010 | Attach, change, repeat, and detach tags                                        | Relationships remain unique and retry-safe                                                                 | **Pass**; usability issue DEF-005                                     |
| CAT-011 | Upload, edit, cover, replace, and remove supported media; reject invalid media | Private signed access, database/storage consistency, and usable interaction states are preserved           | **Fail - DEF-004, DEF-006, DEF-007**; core operations passed          |
| CAT-012 | Search, combine filters, sort, and paginate                                    | Results are bounded, stable, case-insensitive where approved, and archived records are excluded by default | **Pass**; Clear-all UI defect DEF-008                                 |
| CAT-013 | Preview and commit mixed-validity CSV rows; retry commit                       | Preview is non-mutating; only reviewed valid rows import as `UNCATALOGED`; retries do not duplicate rows   | **Fail - DEF-009**; mixed-validity preview blocked                    |
| CAT-014 | Review possible duplicate warnings, including archived matches                 | Warnings show evidence and never auto-merge records                                                        | Blocked pending active duplicate-detection PR acceptance              |
| CAT-015 | Select multiple specimens from the protected catalog on local and LAN clients  | Every row is keyboard/touch accessible and opens the matching preview/detail route                         | **Fail - DEF-003**                                                    |

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

### Storage Location Management

| ID      | Test                                                  | Expected result                                               | Status                                               |
| ------- | ----------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------- |
| STO-001 | Create a root and nested storage hierarchy            | The hierarchy reloads with correct parent-child relationships | **Pass**                                             |
| STO-002 | Attempt self-parenting and descendant cycles          | Both operations are rejected without changing the hierarchy   | **Pass**; UI manual + automated backend verification |
| STO-003 | Edit storage metadata and specimen-holding capability | Valid changes persist and invalid values are rejected clearly | **Pass**                                             |
| STO-004 | Exercise approved archive restrictions                | Referenced/unsafe locations cannot be archived incorrectly    | **Pass**; lifecycle display issue DEF-010            |

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

### Limited offline and synchronization

| ID      | Test                                                            | Expected result                                                                                 | Status  |
| ------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------- |
| OFF-001 | Cache the allowed specimen list, disconnect, and reload         | Previously cached bounded data remains readable                                                 | Not run |
| OFF-002 | Create an offline text draft and synchronize after reconnecting | One attributed `UNCATALOGED` record is created                                                  | Not run |
| OFF-003 | Retry the same synchronization and simulate temporary failure   | Retry is safe; no duplicate specimen is created; recoverable errors remain visible              | Not run |
| OFF-004 | Inspect offline feature boundaries                              | Media, inventory movement, archive, and privileged operations are not falsely available offline | Not run |

### FAQ knowledge management

| ID      | Test                                      | Expected result                                                                              | Status   |
| ------- | ----------------------------------------- | -------------------------------------------------------------------------------------------- | -------- |
| FAQ-001 | Create and edit a knowledge entry         | Valid question, answer, category, and keywords persist                                       | Pass     |
| FAQ-002 | Search/filter and change lifecycle status | Active, inactive, and archived behavior matches the API and UI                               | In progress; filter checks pass, lifecycle pending |
| FAQ-003 | Attempt invalid or duplicate operations   | Clear validation is shown and no unintended record is created                                | In progress; UI validation passes, duplicate policy pending |
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

### Audit and backup history

| ID      | Test                                                                 | Expected result                                                                                                        | Status   |
| ------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------- |
| AUD-001 | Filter audit logs by actor, module, action, result, record, and date | Results are protected, stable, bounded, and accurate                                                                   | Not run  |
| AUD-002 | Trace Cataloging actions to revision and audit entries               | Actor, affected record, action, outcome, and timestamp match                                                           | Not run  |
| BAK-001 | Search and filter backup-history records                             | History loads with correct status/type/creator/date filters                                                            | Not run  |
| BAK-002 | Execute and restore a real backup                                    | Deferred until deployment ownership, storage, retention, verification, and disposable restore environment are approved | Deferred |

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
