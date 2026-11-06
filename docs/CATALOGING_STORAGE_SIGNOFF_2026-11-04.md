# Cataloging and Storage sign-off review - 2026-11-04

Owners: Kyer Jayme and Ivan, following the Kyer/Ivan ownership in `CLAUDE.md`.
Each owner's acceptance and an independent reviewer decision are **pending**.
This is the finite acceptance handoff for these two modules. It does not sign
off Inventory, FAQ, Offline, Audit, Reports or the entire project. Source PR
approval and a passing engineering test are evidence, not module acceptance.

## Five acceptance decisions - reconciled 2026-11-05

Snapshot: merged backend `51f6764`. This is a decision checklist using existing
evidence, not five new tests. Follow linked PRs/current register for later status.

| Decision | Evidence already available | What completes the decision |
| --- | --- | --- |
| 1. Identify the accepted release | Dated manual, SQL/HTTP and phone results below; newer backend fixes are merged | Record actual frontend source/build, backend source/build and target reference. Reuse earlier results with their scope; request only specific missing checks or approved limitation dispositions for this release. A source commit alone does not identify a running build. |
| 2. Reconcile duplicate policy | John records Sir Fidel's active-only approval in [#237](https://github.com/OppenJayme/biosphere-backend/pull/237), based on his November 5 statement; code already uses that policy | Review/integrate that decision and its provenance. #237 is open at this snapshot; do not repeat the already-answered user-preference question or invent a direct Curator signature. CAT-014 still needs its separate behavior/evidence disposition. |
| 3. Dispose of Cataloging evidence/defects | Core lifecycle, imports, restoration, phone and UI recovery already have the results linked below; #231 has source approval, #232 positive review | Owners/reviewer explicitly accept the applicable evidence, identify a reproducible remaining failure, or document an authorized limitation. Cover CAT-001/011/012/013/014/015/016 and relevant defect IDs; do not turn baseline-only or unpinned runs into deployed proof. Pending Reports [#238](https://github.com/OppenJayme/biosphere-backend/pull/238) is a separate owner-reviewed follow-up, not automatically merged or a new Cataloging test campaign. |
| 4. Dispose of Storage acceptance | STO-001/002/003 results plus John's merged #236 restriction evidence below | Reviewer accepts/rejects the combined STO-004 evidence and records DEF-010 disposition. Do not recreate or modify live Inventory lots to repeat the same owned check. |
| 5. Record named module acceptance | Existing register and this evidence handoff | Kyer, Ivan and an independent reviewer identify their accepted scope, dates, release and limitations in the decision record. No signatures, defect closures or module acceptance are inferred here. |

For decision 3, review existing dispositions rather than requeue every defect:
collection uniqueness (DEF-001), list/phone/preview (003/007), tags/media controls
and history (004/005/006/012/013/014), filters/pending feedback (008/011),
request failure/retry/ordering (020/021/022/026), and legacy archive reads
(031/032). A limitation is not permission to waive unresolved security or
data-integrity behavior. Storage uses DEF-010 separately. Other modules' defects
do not silently become Cataloging/Storage obligations.

### Reviewer response record

Record this in the decision section or existing review thread, not as a fabricated
test execution: reviewer/role/date; frontend and backend release/build/target;
CAT/STO cases and defect IDs reviewed; evidence used; any newly executed steps
and observations; accepted limitations versus unresolved failures; and the
explicit result (**accepted scope**, **changes required**, or **decision pending**).
Code approval alone is not a replacement. No message is sent by this handoff.

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
| CAT-014 | Recorded matcher/manual, request failure/retry and six independent component scenarios; DEF-031 service/SQL archive-indicator regression passed | The REQ-4.4-21 active-only scope was approved by Sir Fidel (reported by John on 2026-11-05). Review the [consistency repair](./SPECIMEN_DUPLICATES_GUIDE.md#archive-indicator-consistency-repair---2026-11-04) separately from that scope decision, plus live-result and ordering limits |
| CAT-015 | Local keyboard/detail checks plus six user-reported phone Chrome LAN/touch checks passed | Review existing phone evidence and accessibility limits; do not claim unspecified device/version details |
| CAT-016 | Incomplete restoration, cancel/error/reload and audit passed live; complete legacy restoration/retry now passes owned PostgreSQL plus existing isolated HTTP checks | Independently review the [November 5 SQL evidence and limits](./CATALOG_RESTORATION_VERIFICATION.md#owned-postgresql-legacy-restoration---2026-11-05); no live Inventory fixture or automatic full sign-off |
| STO-001/002/003 | Root/nested hierarchy, cycle rejection, valid/invalid editing and persistence passed | Review existing UI/backend evidence; no new Inventory fixture is needed for these cases |
| STO-004 | Unsafe archive rejection, post-merge active/archive display and isolated permission/edit/move protection passed; [John's Inventory restriction result](#inventory-restriction-result-for-sto-004---2026-11-05) passed on owned PostgreSQL | Review John's result and record independent disposition of DEF-010 |

## Remaining acceptance decisions, not an automatic new test campaign

1. **Identify the release being accepted.** Record frontend build/source, backend
   build/source and a private target identifier. Existing passing runs stay tied
   to their original environments. The supplied [backend report](./BACKEND_REPORT_INTAKE_2026-11-05.md)
   now records the affected #221 API/Lots-page local pass at `06545c0`; DEF-030
   retains its missing frontend/tester/deployment and related-consumer limits.
   Do not keep describing that successful local subcase as untested.
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

The supplied [backend progress report](./evidence/backend-progress-2026-11-05.pdf)
and [its attributed intake](./BACKEND_REPORT_INTAKE_2026-11-05.md) are now available.
They report backend `06545c0` checks, not whole frontend/mutation acceptance.
Map any additional report to CAT/STO IDs and actual input/expected/observed result,
environment/build, tester and date. Distinguish real observations from static
review, mocked responses and proposed tests. Link reproducible defects to
existing IDs; retain conflicting evidence for investigation.
A generated report does not itself establish independent human sign-off.

<a id="identified-release-read-only-checkpoint---2026-11-06"></a>

## Identified-release checkpoint - 2026-11-06

Executed by Codex through Playwright/Edge after the user manually signed in as
Curator. This is engineering execution evidence, not an independent teammate's
acceptance or an authorization to close all outstanding defects.

| Release item | Verified value |
| --- | --- |
| Backend source | `0a864d4bf6ab9c655c6ee0fbe2c0021f0d400b9a` |
| Frontend source | `30d6cc78137ebd37c22896e67d4f44b2e2d25f7d` |
| Frontend production build ID | `fg3bSJZZZz_Oe-dE_DpRs` |
| Execution target | User-confirmed configured hosted Supabase project; project identifier and connection configuration retained privately |
| Verification servers | Backend `127.0.0.1:43180`, frontend `127.0.0.1:43181`; existing ports 3000/3001 and browser contexts preserved |
| Build preparation | Both builds passed; reused existing dependencies, not a clean-install check. Frontend built with webpack. Private artifact inventories/hash manifest retained locally |

The first read-only preflight found 9 of 10 repository migrations applied and
the optional inquiry visit-reference column absent. After the user explicitly
confirmed the configured project as the update target, a guarded deployment
verified the pinned source, exact migration SQL, matching direct connection and
exactly one pending migration before running Prisma migrate deploy.
`20261103000000_add_inquiry_visit_reference` succeeded. The subsequent read-only
check found all 10 applied, none missing/unfinished, the new column present and
its format constraint validated. `TEMPORARY_ABSENCE` remains present. No business
records were edited by this deployment/check; the migration changes schema and
Prisma migration metadata. This does not establish institutional production
approval or an operational backup/recovery capability.
No verified backup or restore point was confirmed before this migration; none
is claimed retrospectively. The user authorized the additive schema change,
but that authorization does not demonstrate recoverability.

| Read-only check | Observed result |
| --- | --- |
| Cataloging queue and import workspace | Both loaded; import page shows upload/validation controls. No file submitted or import committed |
| Specimen status views | All active: 102, Uncataloged: 36, Cataloged: 66, Archived: 9. Sampled displayed row statuses matched their selected tabs; archived rows were separate from All active |
| Existing `TEST - INV Acceptance Beetle` | Details, revision history, Lots and inventory history, and media pages returned HTTP 200 without the page load-error messages checked |
| Selected-cover lookup | No retry/error control after the verified read-only cover action was allowed; this does not prove image lifecycle mutations or every stored image |
| Default Storage view | Archived toggle off; archived `TEST CABINET A` absent from navigation |
| Archived Storage selection | Toggle revealed archived history; selected test cabinet showed the read-only message and no Save changes/Move location/Archive location buttons |
| Reload and historical direct link | Selected archived cabinet and read-only state survived reload; a direct link containing only its selected ID automatically revealed history and remained read-only |

The final 13-entry browser result recorded zero local HTTP responses at or above
400 and zero blocked mutation requests. Those entries are: four specimen list
views (All active, Uncataloged, Cataloged, Archived); four existing specimen pages
(details, revision history, lots, media); the import workspace; default Storage;
archived Storage selection; archived selection after reload; and a historical
archived direct link. The seven-row table groups those checks and also notes the
queue/cover observations; it is not a separate thirteen-test suite or assertion
count. Browser local non-GET requests were
blocked except the reviewed build-specific `getSpecimenCoverPreview` read action.
No catalog, lot, storage or media mutation controls were submitted. Normal login
side effects and device-local read-cache activity are outside that statement.
Execution completed at 01:39 on November 6, Asia/Singapore (17:39 UTC November 5).

Harness corrections are retained with the local evidence: a nested-main locator,
the initial broad POST guard also blocking the read-only cover action, accessible
button whitespace, and waiting for the actual selected-ID navigation before
reload. Those initial harness failures are not reported as application defects.
The corrected Storage reload/direct-link checks passed.
Evidence custodian/contact: PR author **@OppenJayme**, on the local development
workstation. The private `acceptance-release-20261106` evidence folder contains
`build-manifest.json`, `database-preflight.json`, `migration-deployment.json`,
`browser-smoke-result.json`, and the associated harness scripts/logs. Request a
redacted copy from that custodian; the ignored local folder is not a durable
team backup and no credentials should be shared with reviewers.

Limits: this is a bounded read smoke, not new proof of write transactions,
authorization across roles, all legacy archive rows, image bytes, imports,
concurrency, mobile behavior, PWA recovery or the previously affected lot-history
specimen. Earlier scoped evidence remains applicable only within its documented
limits. The local verification timeout uses 30 minutes where configuration lacks
the new value; this is not Curator approval of a production idle-timeout policy.
No new product defect was established by this checkpoint. Case/defect dispositions
and both owners' plus an independent reviewer's acceptance below remain pending.

Before opening this evidence PR, develop advanced to `9ec3fc7` with #240/#241.
Those later changes include operational notification/offline-sync changes and
`20261105000000_extend_notification_state_types`. They are outside this pinned
checkpoint: the 10-migration result describes backend `0a864d4`, not that newer
release. The later migration was not applied, and newer code was not served by
these verification servers. This record must not be treated as its acceptance.
Follow-up coordinator: **@OppenJayme**, under Kyer/Ivan system-integration
ownership, to coordinate the notification migration with its module owner and
apply/verify it against the confirmed target **before starting/deploying the
#241 notification release**. No calendar date or completed deployment is
claimed; this review-fix PR does not apply that later migration. The next release
preflight must compare against its own source migration set, not reuse this
historical ten-migration result.

## Decision record

| Module | Kyer acceptance/date | Ivan acceptance/date | Independent reviewer/date | Result | Accepted limitations and evidence |
| --- | --- | --- | --- | --- | --- |
| Cataloging Management | Pending | Pending | Pending | Pending | REQ-4.4-21 active-only duplicate scope approved by Sir Fidel (reported by John on 2026-11-05); no blanket completion claim |
| Storage Location Management | Pending | Pending | Pending | Pending | John's restriction result supplied 2026-11-05 (see above); DEF-010 disposition still needed |

The original November 4 handoff did not claim new test execution, data changes,
requirement amendments or acceptance. The linked November 5 restoration evidence
is a later bounded addition; acceptance status remains unchanged. Original local
validation was link inspection,
register-count reconciliation and `git diff --check`.
