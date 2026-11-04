# Cataloging and Storage sign-off review - 2026-11-04

Owners: Kyer Jayme and Ivan, following the Kyer/Ivan ownership in `CLAUDE.md`.
Each owner's acceptance and an independent reviewer decision are **pending**.
This is the finite acceptance handoff for these two modules. It does not sign
off Inventory, FAQ, Offline, Audit, Reports or the entire project. Source PR
approval and a passing engineering test are evidence, not module acceptance.

## Existing results to retain

The authoritative statuses remain in the
[acceptance register](./ACCEPTANCE_TEST_PLAN.md#cataloging-management).
After DEF-032's legacy-state reproduction, Cataloging has 9 Pass rows, 6 In progress rows and 1
Partial pass row. Storage has four scoped Pass rows; STO-004 explicitly retains
its combined Inventory criterion and independent-sign-off gap. No result is
promoted by counting it.

| Cases | Recorded evidence | Reviewer action |
| --- | --- | --- |
| CAT-002/003/004 | Draft defaults, core editing/no-change behavior, one taxonomy record and revisions passed | Review existing results; repeat only if report, build change or defect warrants it |
| CAT-005/006/007/008/009 | Date checks, readiness, completion, reopening, public eligibility and history/audit have scoped passes | Verify the documented business rules and evidence; Cataloging checks the prepared lot but does not own quantities or placement |
| CAT-010/012 | Tag relationships and ordinary catalog search/filter/sort/pagination passed; DEF-032 adds a reproduced legacy archive gap with an owner-tested repair | Review DEF-032 independently without discarding earlier ordinary search evidence; usability/performance dispositions remain separate |
| CAT-001 | User-reported collision UI pass, disposable SQL/HTTP checks and independent SQL result | Confirm the identified release target and accept/retest the collection UI evidence; do not recreate the SQL suite as an untested item |
| CAT-011 | Image lifecycle and recovery evidence; unpinned local [Curator preview](./SPECIMEN_MEDIA_GUIDE.md#curator-preview-checkpoint---2026-11-03), [Developer redirect](./SPECIMEN_MEDIA_GUIDE.md#developer-page-redirect-checkpoint---2026-11-03), [Curator 200/404](./SPECIMEN_MEDIA_GUIDE.md#curator-wrong-specimen-read-checkpoint---2026-11-04) and [Developer 403](./SPECIMEN_MEDIA_GUIDE.md#developer-direct-endpoint-checkpoint---2026-11-04) | Review each dated checkpoint and remaining limits; recovered launch provenance does not pin the backend compiled build used at execution. Release-specific acceptance remains pending |
| CAT-013 | Live mixed CSV and XLSX preview/selection/commit/same-preview retry passed; invalid rows excluded | Confirm real museum-template suitability and disposition of concurrency/durability limits; keep synthetic fixture IDs out of real holdings/demo totals |
| CAT-014 | Recorded matcher/manual, request failure/retry and six independent component scenarios; DEF-031 service/SQL archive-indicator regression passed | User preference is recorded, but Curator/SRS disposition of REQ-4.4-21 blocks acceptance. Review the [consistency repair](./SPECIMEN_DUPLICATES_GUIDE.md#archive-indicator-consistency-repair---2026-11-04) separately from that scope decision, plus live-result and ordering limits |
| CAT-015 | Local keyboard/detail checks plus six user-reported phone Chrome LAN/touch checks passed | Review existing phone evidence and accessibility limits; do not claim unspecified device/version details |
| CAT-016 | Incomplete restoration, cancel/error/reload and audit passed live; complete restoration passed isolated HTTP | Decide the evidence required for the defensive legacy branch; see the fixture constraint below |
| STO-001/002/003 | Root/nested hierarchy, cycle rejection, valid/invalid editing and persistence passed | Review existing UI/backend evidence; no new Inventory fixture is needed for these cases |
| STO-004 | Unsafe archive rejection, post-merge active/archive display and isolated permission/edit/move protection passed | Obtain John's combined Inventory restriction result and independent disposition of DEF-010 |

## Remaining acceptance decisions, not an automatic new test campaign

1. **Identify the release being accepted.** Record frontend build/source, backend
   build/source and a private target identifier. Existing passing runs stay tied
   to their original environments. John's #221 restart/retest is reported work
   until he supplies the actual result; do not mark the Lots page fixed here.
2. **Resolve remaining defect dispositions.** Use the
   [defect summary](./TEST_DEFECT_LOG.md#2-summary), especially DEF-001,
   DEF-003 through DEF-008, DEF-010 through DEF-014, DEF-020/021/022 and DEF-026.
   Fixes with owner evidence are not all independently Verified. The reviewer
   records pass, a reproducible failure, or an explicit limitation/deferral.
   No unresolved security/data-integrity defect may be silently waived.
3. **Confirm the Storage/Inventory boundary.** John should supply whether an
   archived location is rejected for new lot placement/movement, with the test
   target, fixture, result and unchanged quantity/location checks. If missing,
   coordinate an owned isolated fixture with him; do not mutate his live lots.
4. **Decide the restoration legacy branch.** Archive rejects active lots,
   readiness requires one, and lot changes reject archived specimens. Therefore
   an ordinary sequential live fixture cannot produce a fully ready archived
   specimen. The [restoration guide](./CATALOG_RESTORATION_VERIFICATION.md)
   records isolated defensive coverage. The reviewer decides whether that is
   sufficient or an owned legacy/disposable database case is required. No
   automatic live waiver, inventory reactivation or weakened archive rule.
5. **Review actual museum imports and test data.** Validate the relevant approved
   template when available. Curator/owner decides archive versus separated
   test/demo retention of synthetic records; preserve history and audit. A
   reviewed import test does not authorize deleting or recategorizing records.
6. **Record named acceptance.** Both owners and at least one independent teammate
   complete the decision below after the critical workflows and failure/retry
   evidence are accepted and relevant regression checks are green. Produce one
   scoped final integration pass if the reviewer needs it; do not restart all
   passed historical tests without a reason.

## Independent black-box report intake

The forthcoming Claude report is not yet evidence in this record. When supplied,
map each result to CAT/STO IDs, the actual steps/input/expected/observed result,
environment/build, tester and date. Distinguish real observations from static
code review, mocked responses and proposed tests. Link reproducible defects to
existing IDs where possible; retain conflicting evidence for investigation.
A generated report does not itself establish independent human sign-off.

## Decision record

| Module | Kyer acceptance/date | Ivan acceptance/date | Independent reviewer/date | Result | Accepted limitations and evidence |
| --- | --- | --- | --- | --- | --- |
| Cataloging Management | Pending | Pending | Pending | Pending | Include REQ-4.4-21 Curator/SRS disposition; no blanket completion claim |
| Storage Location Management | Pending | Pending | Pending | Pending | Include John's combined restriction result and DEF-010 disposition |

No new test execution, data change, requirement amendment or acceptance status
is claimed by this documentation handoff. Local validation is link inspection,
register-count reconciliation and `git diff --check`.
