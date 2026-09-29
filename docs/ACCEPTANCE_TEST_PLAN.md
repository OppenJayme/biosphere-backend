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

Record each result as `Not run`, `Pass`, `Fail`, `Blocked`, or `Deferred`.
Every `Fail` must reference an entry in the defect log.

### Cataloging Management

| ID      | Test                                                                           | Expected result                                                                                            | Status                                                   |
| ------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| CAT-001 | Create and rename a collection; retry the same normalized name                 | Valid unique names save; duplicates are rejected clearly                                                   | **Fail - DEF-001**                                       |
| CAT-002 | Create complete and incomplete specimen drafts                                 | Both start `UNCATALOGED`; public display is off                                                            | Not run                                                  |
| CAT-003 | Edit specimen core fields and submit an unchanged form                         | Changes persist with revision history; no-change submission is rejected clearly                            | Not run                                                  |
| CAT-004 | Create and edit taxonomy                                                       | One taxonomy record exists; kingdom and revisions persist                                                  | Not run                                                  |
| CAT-005 | Create and edit provenance                                                     | Date, preservation type/method, optional fields, and revisions persist                                     | Not run                                                  |
| CAT-006 | View readiness with missing and complete requirements                          | Every approved rule reports the correct pass/fail state and fix location                                   | Not run                                                  |
| CAT-007 | Complete Cataloging with one prepared valid active lot                         | Status becomes `CATALOGED`; public display remains off; history/audit are written                          | Not run                                                  |
| CAT-008 | Remove required data while Cataloged, then reopen with a reason                | Removal is blocked until reopening; reopening returns to `UNCATALOGED` and disables public display         | Not run                                                  |
| CAT-009 | Enable and disable public eligibility                                          | Only Cataloged specimens qualify; no exhibit is published automatically                                    | Not run                                                  |
| CAT-010 | Attach, change, repeat, and detach tags                                        | Relationships remain unique and retry-safe                                                                 | Not run                                                  |
| CAT-011 | Upload, edit, cover, replace, and remove supported media; reject invalid media | Private signed access and database/storage consistency are preserved                                       | Not run                                                  |
| CAT-012 | Search, combine filters, sort, and paginate                                    | Results are bounded, stable, case-insensitive where approved, and archived records are excluded by default | Not run                                                  |
| CAT-013 | Preview and commit mixed-validity CSV rows; retry commit                       | Preview is non-mutating; only reviewed valid rows import as `UNCATALOGED`; retries do not duplicate rows   | Not run                                                  |
| CAT-014 | Review possible duplicate warnings, including archived matches                 | Warnings show evidence and never auto-merge records                                                        | Blocked pending active duplicate-detection PR acceptance |

For CAT-007, Cataloging only verifies the prepared lot. Quantity, placement,
condition, movement, and transfer behavior belong to John Gerozaga's Inventory
acceptance tests.

### Storage Location Management

| ID      | Test                                                  | Expected result                                               | Status  |
| ------- | ----------------------------------------------------- | ------------------------------------------------------------- | ------- |
| STO-001 | Create a root and nested storage hierarchy            | The hierarchy reloads with correct parent-child relationships | Not run |
| STO-002 | Attempt self-parenting and descendant cycles          | Both operations are rejected without changing the hierarchy   | Not run |
| STO-003 | Edit storage metadata and specimen-holding capability | Valid changes persist and invalid values are rejected clearly | Not run |
| STO-004 | Exercise approved archive restrictions                | Referenced/unsafe locations cannot be archived incorrectly    | Not run |

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
| FAQ-001 | Create and edit a knowledge entry         | Valid question, answer, category, and keywords persist                                       | Not run  |
| FAQ-002 | Search/filter and change lifecycle status | Active, inactive, and archived behavior matches the API and UI                               | Not run  |
| FAQ-003 | Attempt invalid or duplicate operations   | Clear validation is shown and no unintended record is created                                | Not run  |
| FAQ-004 | Test public assistant matching            | Deferred until exact/fuzzy matching, ambiguity, threshold, and fallback wording are approved | Deferred |

### Audit and backup history

| ID      | Test                                                                 | Expected result                                                                                                        | Status   |
| ------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------- |
| AUD-001 | Filter audit logs by actor, module, action, result, record, and date | Results are protected, stable, bounded, and accurate                                                                   | Not run  |
| AUD-002 | Trace Cataloging actions to revision and audit entries               | Actor, affected record, action, outcome, and timestamp match                                                           | Not run  |
| BAK-001 | Search and filter backup-history records                             | History loads with correct status/type/creator/date filters                                                            | Not run  |
| BAK-002 | Execute and restore a real backup                                    | Deferred until deployment ownership, storage, retention, verification, and disposable restore environment are approved | Deferred |

## 9. Cross-cutting negative tests

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

## 10. Evidence required

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

## 11. Completion criteria

A module is accepted when:

- all critical and major test cases pass;
- no open security, authorization, data-loss, or data-integrity defect remains;
- important failure and retry paths pass;
- automated regression checks are green;
- deferred behavior is documented and not presented as working; and
- the module owner and at least one teammate record sign-off.

## 12. Sign-off

| Module                      | Owner      | Independent reviewer | Date | Result  |
| --------------------------- | ---------- | -------------------- | ---- | ------- |
| Cataloging Management       | Kyer Jayme |                      |      | Pending |
| Storage Location Management | Kyer Jayme |                      |      | Pending |
| Offline Drafts and Sync     | Kyer Jayme |                      |      | Pending |
| FAQ Knowledge Management    | Kyer Jayme |                      |      | Pending |
| Audit and Backup History    | Kyer Jayme |                      |      | Pending |
