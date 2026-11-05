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
| CAT-016 | Incomplete restoration, cancel/error/reload and audit passed live; complete legacy restoration/retry now passes owned PostgreSQL plus existing isolated HTTP checks | Independently review the [November 5 SQL evidence and limits](./CATALOG_RESTORATION_VERIFICATION.md#owned-postgresql-legacy-restoration---2026-11-05); no live Inventory fixture or automatic full sign-off |
| STO-001/002/003 | Root/nested hierarchy, cycle rejection, valid/invalid editing and persistence passed | Review existing UI/backend evidence; no new Inventory fixture is needed for these cases |
| STO-004 | Unsafe archive rejection, post-merge active/archive display and isolated permission/edit/move protection passed; [John's Inventory restriction result](#inventory-restriction-result-for-sto-004---2026-11-05) passed on owned PostgreSQL | Review John's result and record independent disposition of DEF-010 |

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
3. **Confirm the Storage/Inventory boundary.** John supplied the result on
   November 5: an archived location is rejected for new lot placement, movement,
   condition change and quantity increase, with quantities, locations and
   history unchanged. See the
   [Inventory restriction result](#inventory-restriction-result-for-sto-004---2026-11-05).
   The reviewer decides whether it satisfies the combined STO-004 criterion.
4. **Decide the restoration legacy branch.** Archive rejects active lots,
   readiness requires one, and lot changes reject archived specimens. Therefore
   an ordinary sequential live fixture cannot produce a fully ready archived
   specimen. The [restoration guide](./CATALOG_RESTORATION_VERIFICATION.md)
   records the November 5 owned legacy/PostgreSQL result alongside isolated HTTP
   and prior live incomplete restoration. The reviewer now decides whether this
   combined evidence is sufficient, with concurrency/browser limits stated. No
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

## Inventory restriction result for STO-004 - 2026-11-05

Supplied by John (Inventory owner, GitHub MarQtie). The rule lives in
`SpecimenLotsService.assertAssignableStorageUnit`, which every route that puts
specimens into a location calls: `create`, `move` (target unit),
`changeCondition` (the source unit, since a replacement lot stays there) and
`adjustQuantity` for increases only. Reductions skip the check on purpose, so a
legacy placement in an archived unit can still be emptied.

**Owned PostgreSQL run.** Target: backend develop `be0571f`, Prisma 7.10.1,
against a throwaway local PostgreSQL 17.6 cluster on loopback with every
`prisma/migrations` folder applied by `prisma migrate deploy`. It was not
Supabase, not a shared database and not a browser run. The fixture had one
Uncataloged synthetic specimen, active drawers A and C, archived drawer B, a lot
of 10 in A and a legacy lot of 5 in B. The public `SpecimenLotsService` was
called directly against real Prisma.

| Attempt | Result |
| --- | --- |
| Create a new lot in archived B | Rejected: "Archived storage units cannot receive specimen lots." |
| Move 4 of the A lot into B | Rejected, same message |
| Move all 10 of the A lot into B | Rejected, same message |
| Change condition on 1 of the B lot | Rejected, same message |
| Increase the B lot by 1 | Rejected, same message |

Before and after the five attempts, the lots (ID, unit, condition, quantity,
active), the lot-transaction count (0), the revision count (0) and the number of
lots in B (1) were identical. As controls, moving 2 out of B into active C and
reducing B by 1 both succeeded (B ended at 2, A stayed at 10, with 2
transactions and 2 revisions). Result: **all five rejection checks and both
control operations passed**. The cluster and the
temporary script were deleted afterwards; the script is not committed because
the repository's disposable-database helper needs Docker, which this machine
does not have.

**Committed regression.** `specimen-lots.service.spec.ts` now covers the move,
condition-change and increase routes into an archived unit, alongside the
existing create case. It fails when the archived check is disabled and passes
with it. Lot and import unit tests passed 87/87, and the lot and
storage-location HTTP tests passed 42/42.

Not covered: concurrent archive-while-moving, the frontend Lots page, and
deployed Supabase. Independent review of this result and of DEF-010 remains.

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
| Storage Location Management | Pending | Pending | Pending | Pending | John's restriction result supplied 2026-11-05 (see above); DEF-010 disposition still needed |

The original November 4 handoff did not claim new test execution, data changes,
requirement amendments or acceptance. The linked November 5 restoration evidence
is a later bounded addition; acceptance status remains unchanged. Original local
validation was link inspection,
register-count reconciliation and `git diff --check`.
