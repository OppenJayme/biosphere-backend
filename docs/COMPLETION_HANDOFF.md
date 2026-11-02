# BioSphere completion handoff - 2026-10-24

This is the remaining owner-scope work queue, not a new test plan, approval to
change shared data, or whole-project completion percentage. The acceptance
register and defect log remain authoritative. Reading this handoff promotes no
status and does not authorize migrations, account changes or teammate-owned work.

The [November 18 delivery plan](DELIVERY_PLAN_2026-11-18.md) sets the remaining
milestones, priorities and release completion criteria. Use its grouped queue
to schedule this handoff; historical passing checks do not become new work.

## Current next actions - 2026-11-02

This checkpoint supersedes older next-step wording below while preserving its
dated evidence. Do not turn every historical limitation into a new feature or
repeat an already-passing owner batch. Acceptance statuses still come from the
register and named owner/reviewer dispositions.

GitHub status refreshed on 2026-11-01 following WhiteBeard's review: frontend
[#97](https://github.com/OppenJayme/biosphere-frontend/pull/97) merged at
`f67a390ea2555e7da958a4d739336591953826ea` and
[#98](https://github.com/OppenJayme/biosphere-frontend/pull/98) at
`a7cbc17f59b5f77d8274156130263b2acdbe63cb`. Backend #220 merged at
`ef491c8e4aac89e0eba68f7e34f7108901b445b9` and #222 at
`4de07c6fd42a0207f1c3d7ab4b9b20a7fd16e3f0`. Backend #221 was approved
and merged at `175f81cc7b871a63cf54993b2a1b30de62a5a0a4`. Its seven owned
PostgreSQL/HTTP regressions and integrated build passed with Prisma 7.10.1.
Source integration does not establish that either running build was refreshed
or that the lot-history repair has been deployed or accepted live.

### Merged backend preparation - 2026-11-01

Merged backend `4de07c6fd42a0207f1c3d7ab4b9b20a7fd16e3f0` (#220 plus #222)
was prepared in the owned `.codex-tmp/merged-backend-20261101` checkout.
`package.json` and lockfile match the existing #220 dependency checkout exactly,
so its installed modules were reused through an owned-worktree junction; this
was not a new clean-install test. No `.env` was copied. Prisma generation used
an unreachable synthetic loopback datasource and produced Client 7.10.1 in the
isolated checkout. Installed Prisma/client/adapter are all 7.10.1; csv-parse is
7.0.3. The build output is isolated; the original checkout was not switched.

| Merged-source check | Result / scope |
| --- | --- |
| `node scripts/verify-csv-parser.cjs` | 10/10 fixed synthetic parser checks pass |
| `node scripts/verify-swagger-yaml.cjs` | 8/8 owned loopback Nest/Swagger/YAML compatibility checks pass |
| `node node_modules/@nestjs/cli/bin/nest.js build` | Pass; no application server started |
| Existing `specimens` and `offline-sync` HTTP suites | 100/100 pass through real Nest wiring with synthetic authentication/database adapters |
| Working tree / whitespace | Clean isolated source tree; `git diff --check` passes |

The initial version-readback command tried importing a package.json subpath
which adapter-pg does not export. Reading the installed package metadata as a
file corrected that diagnostic; Prisma generation itself had already succeeded.
No dependency or application repair was needed for the diagnostic error.

This is a merged-source integration checkpoint, not runtime rollout, a new
audit snapshot, full suite rerun, live import/sync, real session expiry or
independent module acceptance. No shared connection, migration, auth export,
record edit or existing browser/server operation was used. The original local
backend remains on source `f4df176`, and frontend checkout `60ab28b` still has
on-disk build `KjnKPLGaaPM_cm9tgFdJ_`. Preserve recovery assets before a controlled
backend refresh, then verify startup and agreed read-only routes. This dated
checkpoint excludes #221, so it cannot establish that `USC-BM-2026-0001` is
fixed. The later 7.10.1 lot-history SQL check passed in an owned fixture;
deployment and read-only live retest remain separate.

### Local backend startup checkpoint - 2026-11-01

The next authorized step started the verified backend build. Preflight found
neither port 3000 nor 3001 serving, so no existing server was stopped. Backend
PID `26144` serves merged `4de07c6` from
`.codex-tmp/merged-backend-20261101/dist/main.js`, using the original backend
working directory/configuration. The original `biosphere-backend` checkout,
its `f4df176` build and its dependencies remain in place for recovery; the
original entry-file SHA-256 is unchanged. No environment file was copied or
printed. Keep both the running worktree and its #220 dependency checkout while
this temporary launch is in use; deleting them would remove runtime files.

Startup logged success, backend stderr was empty, and actual read-only GETs
to `/` and `/docs-json` returned 200. The served OpenAPI document contains
the import-preview and offline-sync endpoints. The listener is `::` on 3001,
matching the existing backend bootstrap behavior; this is not described as a
new loopback-only deployment. No migration, specimen mutation or auth-state
change was requested. This smoke does not test protected requests, actual
import/sync writes, provider delivery or historical-row repair.

Because the frontend was also stopped, its existing unchanged production build
`KjnKPLGaaPM_cm9tgFdJ_` was started as PID `39036`, bound to
`127.0.0.1:3000`. No frontend rebuild or source update was performed. The first
login-page read timed out during startup; a bounded retry returned HTTP 200.
Both stderr logs remained empty. Original source worktrees were clean afterward.
No signed-in browser tab was navigated, closed, signed out or exported.

Private process IDs, entry hashes, startup logs and smoke results are retained
under `.codex-tmp/backend-refresh-20261101/`; do not commit those local recovery
artifacts. Recovery means stopping only the recorded backend PID after verifying
it still owns 3001 and launching the retained original `dist/main.js` from the
original backend directory; do not issue broad Node/port kills. There was no
previous running process to restore. Subsequent manual starts from the original
checkout still use its retained old build until that checkout is deliberately
updated. The local startup checkpoint is complete; protected acceptance and
#221's later rollout and live acceptance remain separate.

### Protected Curator read-only smoke - 2026-11-01

After the user manually signed in as Curator, 20 assertions passed through the
actual frontend `60ab28b` / production build `KjnKPLGaaPM_cm9tgFdJ_` and local
merged backend `4de07c6`. The prior browser session had closed; a new visible,
isolated Edge session `protected-smoke-20261101` was opened without copying
credentials or browser storage. Tests ran in one owned temporary tab under a
guard rejecting all non-GET/HEAD/OPTIONS requests and foreign origins.

| Protected page | Checked behavior |
| --- | --- |
| `/cataloging` | HTTP 200, Uncataloged queue and records section, no backend-unavailable fallback, correct import link |
| `/storage` | HTTP 200, storage hierarchy and record-details sections, no backend/permission fallback |
| `/audit-logs` | HTTP 200, populated audit rows and matching-count display, no error fallback |
| `/cataloging/import` | HTTP 200, CSV/XLSX file acceptance and Preview control, no selected file or reviewed commit action |
| Guard / cleanup | Zero non-read attempts, zero page errors, unchanged original signed-in URL; owned test tab closed |

The user-facing browser remains open and signed in for the next step. No file
was selected, preview/import submitted, draft saved, status changed, specimen
edited or shared migration run. No credentials, record contents or audit details
were exported. The original signed-in dashboard tab was not navigated. Script
and CLI artifacts are ignored; the diagnostic script is under
`.codex-tmp/protected-smoke-20261101/`.

This completes the agreed post-refresh protected read smoke. It is not full
Cataloging/Storage/Audit/import acceptance, an expired-session recovery test,
validation of frontend #97/#98's unrefreshed code, or #221's historical repair.
Existing relevant automated results remain scoped to their recorded targets;
no additional suite/build was rerun for this documentation update. Whitespace
validation: `git diff --check`. Continue exact missing acceptance cases instead
of another identical read-only smoke.

| Work | Current evidence | Next action / dependency |
| --- | --- | --- |
| Dependency repair | [Backend #220](https://github.com/OppenJayme/biosphere-backend/pull/220) is merged, including review follow-up `1220d31`. The merged build, 100 HTTP and 18 compatibility assertions pass; the local `4de07c6` backend is now started with passing public root/OpenAPI smoke and the original build retained. Recorded branch production audit is zero entries; eight low development entries remain; no new audit was performed. | Local startup is complete; continue required protected acceptance rather than repeating preparation/startup. This is a temporary verified-worktree launch, not an update of the retained original checkout or independent security acceptance. |
| Cataloging / Storage | Live XLSX selected commit/retry and 20 existing-event Audit assertions below are complete. Earlier lifecycle, date, media, phone and storage checks retain their recorded scope. | Finish only required unresolved acceptance cases or obtain explicit dispositions; coordinate Inventory fixtures. Museum-template suitability, remaining media/restoration/policy boundaries and independent module acceptance are not supplied by dependency tests. |
| Specimen lots | The reported `USC-BM-2026-0001` history failure was reproduced in owned PostgreSQL. [Backend #221](https://github.com/OppenJayme/biosphere-backend/pull/221) and [frontend #97](https://github.com/OppenJayme/biosphere-frontend/pull/97) are merged. Seven owned SQL/HTTP regressions and the integrated backend build passed on Prisma 7.10.1; earlier branch checks include backend 701 unit / 22 HTTP and frontend 450 tests. | The rollout owner must identify the intended target, check migration status and deployment-file checksums, then coordinate rollout and read-only retests of the affected specimen, a control, report grouping and storage history. DEF-030 remains Ready for retest. John owns Inventory acceptance; the repair does not enable new temporary-absence writes. |
| FAQ | Implementation and synthetic matcher/widget evidence exist; authoritative museum answers remain pending. Optional unanswered-question collection stays disabled. | Sir Curator supplies/approves the content-review answers; then use the normal approved workflow and bounded visitor acceptance. Do not invent facts or activate synthetic answers to fill the gap. |
| Limited offline | Owned SQL/HTTP and accepted-write/tab recovery, the 15 OFF-004 browser assertions and merged #222/#98 request matrix remain recorded. [Approved live session-loss recovery](./OFFLINE_SYNC_GUIDE.md#live-isolated-session-loss-and-re-login-recovery---2026-11-01) adds 28 functional checks: actual frontend 401, preserved local draft, manual re-login and same-ID 200/200 acceptance/retry, with one retained specimen/success audit. | Do not repeat completed owner request/browser/re-login checks as untested. Obtain independent acceptance and disposition of the one unclassified blocked extra attempt and retained fixture. Natural expiry/provider revocation and full PWA are unproved limits, not new features or an automatic repeat queue. DEF-019's historical shared interruption pilot stays stopped. |
| Audit / Backup and final handoff | Record/filter/form/pagination/reload owner checks and independent disposable Collection/Backup evidence already exist. Real backup/restore remains Deferred. | Address remaining required correlation/access/provider/timing cases or accepted limitations, then one pinned integration/demo round and named module sign-off. Preserve the distinction between metadata history and a real backup/restore. |

Practical sequence: backend #220/#221/#222 and frontend #97/#98 are merged.
The November 1 backend preparation and local startup predate #221. Do not call
the affected specimen fixed until the integrated repair is deployed and retested. Continue
the exact protected acceptance gaps using an agreed safe target. Check the
actual source/build and migration state before future rollout; a
merged PR alone does not update the running application. Review can proceed
while the team gathers FAQ facts and Inventory evidence. Do not add optional
tests or features simply to occupy that wait. Helping another module remains
coordinated with its owner; this list is not a whole-project completion percentage.

### Work selection while review is pending

The live XLSX commit/retry is already reconciled in this PR's CAT-013 register
entry. Its older wording in an unmerged working copy is not a new test gap.
The current finish work is grouped below; these are not promises of four tests,
four sessions, or complete module acceptance.

| Batch | Exact remaining work to select | Dependency / stopping rule |
| --- | --- | --- |
| Review and integration | Backend #220/#221/#222 and frontend #97/#98 are merged. The #221 compatibility checks passed in an owned fixture; the November 1 runtime predates that repair. | Confirm deployment target, migration status and checksums, then perform the agreed read-only rollout checks. Do not repeat passing suites without a relevant integration change. |
| Required owner acceptance | CAT-011 live media role/wrong-pair and failure boundaries; CAT-014 archived-match policy and remaining response-ordering scope; CAT-016 complete live restoration branch; OFF-004 negative boundaries and genuine expiry/re-login scope; remaining AUD-001 access/correlation boundaries and BAK-001 populated UI scope. | Reconcile each exact subcase with its guide/register before execution. Shared writes, account changes, provider-failure injection and interruption need an agreed safe setup. Prior synthetic, owned-SQL and manual passes are retained, not repeated or promoted to live proof. |
| External answers and owner decisions | Sir Curator's approved FAQ content; team disposition of FAQ normalized-question/alias collisions and archived specimen duplicate matches; John's Inventory fixture/placement evidence; reviewer disposition of DEF-011, OBS-001, OBS-005 and offline release limits. | Request only still-unanswered decisions. No invented museum facts, silently accepted limitations, or Inventory feature changes. Optional FAQ collection stays disabled; real backup/restore remains separately Deferred. |
| Final scoped release acceptance | Pin the served backend/frontend source and build; run one agreed role/workflow/demo round, reconcile the register and known limitations, and obtain named owner/reviewer sign-off. | Relevant repairs are integrated and required fixtures/content available. Record missing dependencies honestly; paper/manual alignment uses the accepted results rather than engineering test counts as stakeholder approval. |

While the listed inputs are unavailable, maintain the handoff or coordinate an
explicit teammate-owned task. There is no automatic new feature or additional
regression suite to start merely because a review is pending. This reconciliation
changes no acceptance status and authorizes no shared-data or runtime operation.

2026-10-29 update: DEF-017's isolated Inventory fixture passes 5/5,
including Developer 403 and authorized denial-audit readback, without the
missing-audit adapter error. Voltaire independently confirmed #214; it is
Verified for that isolated repair. This is
test-support evidence, not live audit persistence or full Inventory acceptance.
See the [defect entry](TEST_DEFECT_LOG.md#def-017---storage-inventory-denial-fixture-omits-security-audit-persistence)
for the exact scope and retest command. Earlier checkpoints below retain their
historical status.

The [merged local XLSX preview checkpoint](./SPECIMEN_IMPORT_GUIDE.md#merged-local-xlsx-preview-checkpoint---2026-10-29)
now records backend #216/#217 and frontend #96 integration, fresh local builds,
the actual two-row mixed XLSX preview, and before/after empty catalog readback
without an import commit. DEF-029 has independent repair acceptance; the local
proxy dependency is patched. The subsequently authorized [live XLSX commit/retry](./SPECIMEN_IMPORT_GUIDE.md#live-xlsx-selected-row-commit-and-retry---2026-10-30)
passes with one retained synthetic Uncataloged specimen, invalid-row exclusion,
the same ID and one successful import audit after retry. OBS-005's proposed
repair is in #220 (see the current checkpoint); its earlier 12-entry baseline,
actual museum-template suitability and wider module sign-off
remain separate. Do not
reopen the completed owner/reviewer suites simply because these gates remain.

2026-10-30 Audit follow-up: [11 live read-only existing-event assertions](./AUDIT_LOG_GUIDE.md#live-existing-event-filter-checkpoint---2026-10-30)
pass using that import's existing audit: record/module/action/result/type and
date filters, preview/row correlation and reload identity. No additional test
record was created. The subsequent [toolbar/actor-name/pagination follow-up](./AUDIT_LOG_GUIDE.md#live-toolbar-actor-search-and-pagination-follow-up---2026-10-30)
passes nine more assertions using 134 existing matching logs, with distinct
page UUIDs, stable Previous ordering and filter reset. Exact actor-ID/timestamp
boundaries, concurrent-pagination/request-ID/access/failure limits, OBS-001
disposition and independent acceptance stay separate; do not requeue the
completed filter/form/pagination subcases.

## Current public review closeout - 2026-10-29

2026-10-30 security follow-up: [OBS-005 dependency-path triage](./BACKEND_DEPENDENCY_TRIAGE_2026-10-30.md)
identified actual request-body/upload dependencies as the repair priority,
plus a critical development-only Handlebars finding. No dependency/runtime was
changed in that triage. The later #220 repair and CI are now recorded above;
do not requeue preparation of that patch or another passed Audit happy path.

Frontend #92/#93/#94 and backend #211/#212 are merged. Charles's corrected #212
review is Approved. The [combined checkpoint](./PUBLIC_SUBMISSIONS_GUIDE.md#merged-public-form-integration-checkpoint---2026-10-29)
records exact merge/CI identities, a CI-tested tree identical to merged frontend,
439 passing unit/regression cases, two canary contract checks and lint/build,
plus sixteen owner real-form/dialog groups using synthetic HTTP. These are
bounded implementation/integration results; the review batch is complete.

The explicitly authorized [frontend-only refresh](./PUBLIC_SUBMISSIONS_GUIDE.md#authorized-local-frontend-refresh---2026-10-29)
is complete on source `06d929e`, build `5goHqxvW38dPzuTeCRyHt`. Both actual public
dialogs pass the read-only keyboard/style smoke with zero non-read requests or
page errors. The previous build/source is preserved; backend PID 20884 and
existing browser windows were left unchanged. DEF-028 is Verified for its bounded
keyboard repair. This rollout creates no public submission or provider evidence.

Sir Curator's approved FAQ/public facts, remaining public workflow/provider and
release/accessibility acceptance remain separate inputs. The completed owner
keyboard and combined fixture batches are not reopened by those dependencies.
Do not invent facts or introduce a new feature merely to keep the queue busy.

## Closeout queue - 2026-10-27

### Current independent-review checkpoint - 2026-10-28

Recovery/containment integration is complete: backend [#205](https://github.com/OppenJayme/biosphere-backend/pull/205)
merged into `develop` at `e6ae2a516ade4c33000344b18ca2016b8f8067b4`,
frontend [#90](https://github.com/OppenJayme/biosphere-frontend/pull/90) at
`618d4380059d106ba820a36b20c4ce57c2069fbc`. Both integration PR CI runs passed;
fetched develop trees contain the intended fixtures. The earlier feature-branch
merges alone had not integrated all changes. This is source/CI verification,
not a rebuild or acceptance test of the running application.

Voltaire (GitHub Raidiniom, executed via Claude Code on his machine) supplied
[the completed independent report](https://github.com/OppenJayme/biosphere-backend/pull/206#issuecomment-6462407880)
on 2026-10-28. Both tested worktrees were clean:

- Backend: `e6ae2a516ade4c33000344b18ca2016b8f8067b4`.
- Frontend: `618d4380059d106ba820a36b20c4ce57c2069fbc`.
- Windows 11 Pro 10.0.26300; Node v22.14.0; Docker engine 29.8.2;
  Edge 156.0.4314.42. Dependencies installed from committed lockfiles.

| Independent command | Reported result | Exit |
| --- | --- | --- |
| `npm run test:collections:db` | 16/16 Pass | 0 |
| `npm run test:backup-history:db` | 16/16 Pass | 0 |
| `npm run test:duplicates:browser` | 6/6 Pass | 0 |

Both owned database containers and the temporary browser session were cleaned
up. No unexpected errors were reported. The intentional SQL 42501 rollback
injection and Node VM warning were expected. The initially missing PostgreSQL
image was pulled by the exact pinned digest, without substitution:
`postgres@sha256:eee6c6e1b0894fa4fe0075eb054af9fd1cf39a35321c2d4110626cfe506411fb`.

This completes the requested three-suite independent batch. No further answers
or repeated runs are required for that batch. DEF-025 is Verified for its narrow
test-harness repair. DEF-026 has independent six-scenario component evidence;
its separate live-result/release limits and CAT-014 acceptance remain explicit.
The earlier [#195 review](https://github.com/OppenJayme/biosphere-backend/pull/195#issuecomment-6461153540)
reported 13/13 existing HTTP checks and static review, with Docker not run at
that earlier checkpoint; do not retroactively assign the later SHAs to it.

This is acceptance of these isolated regressions, not whole-module sign-off,
shared database migration, production/provider/PWA verification or real backup
and restore. Approved FAQ/public content and Inventory-owned fixtures remain
separate inputs. New notification PRs were not part of the reviewed revisions
and do not reopen this completed batch. See the
[notification activation checkpoint](./NOTIFICATION_ACTIVATION_CHECKPOINT.md)
for the authorized local rollout: exact migration/protections, rebuilt apps and
signed-in feed/control smoke checks now pass. The subsequently authorized live
two-curator read/dismiss, reload, count and source-preservation check also passes
(six assertion groups). Independent notification sign-off remains pending; no
earlier suites were rerun for this documentation update.

2026-10-28 owned recovery follow-up: [the accepted-write/tab-close slice](./OFFLINE_SYNC_GUIDE.md#owned-accepted-write-tab-recovery---2026-10-28)
passes 1/1 in two consecutive complete runs. Real UI draft recovery and automatic
same-ID retry return the original specimen; owned SQL has one specimen, receipt
and success audit. This bounded evidence gap is closed owner-side. Harness
corrections and one earlier unestablished timeout are recorded in the guide.
DEF-019 remains Open for historical/full Next/PWA/independent limits; its shared
pilot stays stopped. Next is review/merge and agreed independent acceptance.

2026-10-28 containment follow-up: [the approved offline UI preflight](./OFFLINE_SYNC_GUIDE.md#offline-ui-containment-preflight---2026-10-28)
passes 3/3 using a fresh browser origin/context, real panel, owned SQL/Nest read,
permanently read-only adapter and independent arrival counters. No draft write
or interruption occurred; SQL specimen/receipt/audit counts remain zero. This
provides bounded fixture containment, not full Next/PWA or interrupted-write
acceptance. DEF-019 stays Open; the shared-backend pilot stays disabled. The
subsequent agreed owned write/recovery evidence is linked immediately above.

2026-10-28 offline database follow-up: [8 owned disposable PostgreSQL/HTTP
checks](./OFFLINE_SYNC_GUIDE.md#disposable-postgresql-and-http-verification---2026-10-28)
pass, including proven-overlapping same-ID transactions, owner separation,
receipt uniqueness and actual audit/receipt failure rollback with safe retry.
This bounded backend database gap is no longer unverified. It is not a full-stack
browser/provider target and does not clear DEF-019. Independent acceptance,
actual expiry/re-login and the stopped interruption gate remain separate.
No runtime source/shared database/Inventory edit. The existing backend watcher
recompiled and changed child PID during the task; no manual restart was issued.
The guide records this side effect rather than claiming process continuity.

2026-10-28 offline adapter follow-up: [the agreed five handler checks](./OFFLINE_SYNC_GUIDE.md#isolated-frontend-route-adapter-checks---2026-10-28)
pass (full frontend 419/419, clean lint/TypeScript). Real handler/API client/schema
code uses synthetic session/config/HTTP; no live backend, runtime or server
change. Published in frontend #87. Earlier frontend #86/backend #200 are merged
with successful PR CI. The local store/queue and adapter batches are complete;
do not extend those batches automatically or represent them as real expiry,
middleware, backend concurrency or independent acceptance evidence.

2026-10-28 offline follow-up: [two isolated authorization/recovery regressions](./OFFLINE_SYNC_GUIDE.md#isolated-authorization-recovery-checks---2026-10-28)
pass with the existing sync/store code (focused 9/9, current frontend suite
414/414). Synthetic 401 then success preserves the draft ID/content and another
owner; synthetic 403 preserves the draft and excludes automatic retry. This is
local-state coverage, not real expiry/re-login or backend concurrency evidence.
No runtime/server/login change; OFF-003 remains In progress and DEF-019 stays
stopped. Do not repeat these exact synthetic owner checks as if untested.

2026-10-28 upstream follow-up: a [bounded loopback GET-only pilot](./TEST_DEFECT_LOG.md#partial-upstream-timing-pilot---2026-10-28)
captured eight successful reads; catalog was the longest branch in both waves
(711/941 ms). The browser pilot timed out and two other GET paths were excluded,
so no full-flow pass, production benchmark or SQL cause is inferred. Temporary
helper/frontend listeners were stopped; original servers stayed running. Source
inspection identifies items/count and batched ancestor resolution as stages to
profile, without changing their behavior or declaring either the bottleneck.

2026-10-28 performance follow-up: [three production Apply/Clear request-timing
pairs](./TEST_DEFECT_LOG.md#production-request-timing---2026-10-28) show checked
UI readiness at 1149-1345 ms / 1062-1147 ms respectively on `b65c9dd`. Request
timing and service-worker differences are recorded, along with two rejected
diagnostic attempts and owned-tab cleanup. No code optimization or SLA claim;
DEF-011 remains In progress for upstream correlation/reviewer disposition.
Do not repeat those owner samples as if unmeasured.

Filter follow-up: the [missing nonblank Collection/Public eligibility reset,
history and reapply case](./TEST_DEFECT_LOG.md#nonblank-collection-and-eligibility-follow-up---2026-10-27)
passed on production `b65c9dd` without record changes. Do not repeat that owner
case as untested. Independent DEF-008 acceptance and DEF-011's controlled
performance/disposition work remain separate; this run supplies no latency claim.

DEF-026 follow-up: frontend #85 and backend #196 are merged with successful PR
CI. The frontend-only production refresh from `b65c9dd` passed, serving build
`-7vcfapNQNgHNQsAN6WHj`. The [no-save failure/invalidation/retry/clear retest](./TEST_DEFECT_LOG.md#merged-production-ui-checkpoint---2026-10-27)
passed with three synthetic POSTs aborted locally, zero other non-read requests
and zero page errors. Backend and the original signed-in tab/guard were
preserved; the old frontend build remains available for recovery. Independent
acceptance and successful live-result limits remain; another identical owner
transport-failure check is not the next task.

Physical-phone follow-up: the user reported all six [LAN/touch selection,
close, A/B switching, matching detail, Back and refresh checks](./TEST_DEFECT_LOG.md#user-reported-physical-phone-lan-check---2026-10-27)
passed on temporary frontend development source `e2b13bc`. That owner functional
gap is no longer untested. Browser is user-reported Google Chrome; phone OS,
model and browser version are unspecified. Independent/release/full-accessibility
acceptance remains. The task-owned LAN frontend was stopped,
preserving localhost desktop servers and the signed-in Edge session.

Backup History follow-up (user approved proceeding after initially choosing to
leave it pending): the original [14 populated disposable PostgreSQL/HTTP checks](./BACKUP_HISTORY_GUIDE.md#populated-disposable-postgresql-checkpoint---2026-10-27)
were extended to **16 passing checks** by the DEF-025 audit-timing repair.
Backend [PR #195](https://github.com/OppenJayme/biosphere-backend/pull/195)
is confirmed merged at `adb2404213a880c9c98c2bf7f7405bbcf23d41c9`.
Collection database checks also pass 16/16; existing combined HTTP regressions
pass 13/13. These are previously recorded owner results, not a new run or
independent acceptance. Real populated browser/provider evidence and
independent acceptance remain;
BAK-001 is In progress and BAK-002 real backup/restore remains Deferred. This is
synthetic metadata read verification, not a backup job or restore implementation.

This is the current task-selection summary. Older checkpoints below retain
their historical context; they do not reopen completed implementation work.
Backend PR #191 is confirmed merged and its PR CI succeeded. DEF-024 owner
verification passed the unchanged 25-case evaluation, 15 ordinary scope HTTP
regressions, 690 unit tests and 376 isolated HTTP tests. Independent acceptance
is still pending; see [policy, evidence and limits](./FAQ_CONTENT_REVIEW.md).

The agreed target remains a laptop-only demo, with no new paid service and
optional FAQ question collection disabled. Do not re-ask those settled choices.
This closeout section changes no acceptance/defect status and authorizes no
live writes, migration, server restart or backup/restore operation.

| Batch | Remaining work only | Owner / coordination | Exit condition |
| --- | --- | --- | --- |
| 1. Evidence and review baseline | Reconcile remaining register subcases against linked results; identify the build/revision actually tested. | Kyer; independent teammate to be named | A finite case list names exact gaps, reviewer and target; historical passes are not queued again without a relevant change. |
| 2. Cataloging closeout | Independent DEF-020/021/022 acceptance; remaining release/console/accessibility checks after the six owner phone checks passed; remaining media provider/failure cases, complete live restoration branch and stale duplicate-response ordering. Collection SQL/HTTP and configured-index checks are already recorded; identify the acceptance build/target and obtain independent review. Resolve archived-duplicate policy. | Kyer; deployment/database owner; teammate; John supplies any Inventory-owned fixtures | Critical/major requirements and important recovery paths have matching evidence; no data-integrity/security blocker remains. Isolated tests are not substituted for live provider/concurrency checks. |
| 3. Storage boundary | Independent hierarchy/archive/read-only acceptance; remaining placement/lot criteria coordinated with Inventory. | Kyer and John; Voltaire for shared access contracts | Storage-owned criteria pass; John supplies/accepts Inventory placement evidence. No lot/quantity/movement implementation absorbed into Cataloging. |
| 4. FAQ local visitor flow | Independently retest DEF-024; obtain authoritative answers/sources; settle outstanding duplicate-knowledge policy; verify approved active/inactive lifecycle and visitor answer/clarification/fallback/follow-up flow. | Kyer; curator/content approver; teammate | Real content is approved and visitor flow accepted within the documented bounded English contract. Synthetic test facts are never published. Hosted review collection stays outside this demo gate and disabled. |
| 5. Limited offline | Independent cache/draft/sync and negative-boundary acceptance; exact outstanding expiry/recovery/concurrency cases. Keep DEF-019 shared-backend interruption pilot stopped. | Kyer; independent reviewer; approved disposable-environment owner | Independent containment is established before interruption checks; required cases pass safely, or unsupported scope is explicitly decided without hiding a blocker. |
| 6. Audit and backup | Remaining live access/correlation/failure cases, populated backup-history evidence, OBS-001 disposition and independent review of repaired owner fixtures. Coordinate DEF-017 with John/Voltaire. | Kyer; independent reviewer; database/deployment owner; John/Voltaire for their fixture | Audit criteria pass without treating missing-adapter errors as evidence of persistence. Real backup/restore remains Deferred unless its procedure and disposable target are approved; any limited-demo acceptance explicitly records that limitation, not full restore acceptance. |
| 7. Defect disposition | Retest remaining exact UI defect checklists; agree performance/observation dispositions and identify accepted nonblocking deferrals. | Kyer and affected owner/reviewer | Each remaining item has evidence or an explicitly accepted disposition. No arbitrary latency promise or automatic promotion from Ready for retest to Verified. |
| 8. Release checkpoint and handoff | One agreed scoped integration/regression checkpoint after relevant changes; record owner and teammate acceptance per module. | Kyer and named independent reviewer | Apply the existing acceptance criteria; blockers are resolved, deferrals are explicit, and sign-off records revision, environment, scope and limitations. Only then claim the corresponding module/scope accepted. |

These are grouped batches, not eight tests or an estimate of eight sessions.
Execute only missing subcases. If a batch needs unavailable authority/data,
record its owner and dependency and continue unrelated safe work. Helping
teammates can proceed while external approvals are pending, but must not be
described as completion of the waiting module.

### Immediate sequence after the phone pass

1. Hand the existing collection/Backup audit-timing evidence to the first
   available independent reviewer. PR #195 being merged does not by itself
   establish that the reviewer ran its opt-in Docker checks. Record the actual
   commands/results and revision; do not rerun owner suites merely to fill time.
2. Obtain independent review/acceptance for DEF-026 using its six component
   scenarios and the merged production failure/retry evidence. Both PRs are
   merged and the owner production retest is complete. The pending-edit
   hypothesis below was reproduced and repaired; do not restart that investigation
   as if untested. Successful live-result limits and broader ordering gaps remain
   separate. Keep browser failure checks isolated from shared writes.
3. Keep curator FAQ answers and John's Inventory fixtures as external inputs.
   When supplied, execute only their missing acceptance cases. Until then,
   do not invent FAQ facts, activate synthetic answers, or absorb lot management.

This sequence records priorities only. No new test result, independent sign-off,
database change or release acceptance is claimed by this reconciliation.

Source inspection for step 2 (frontend `e2b13bc`, no browser requests):
`SpecimenDuplicateCheck.tsx` already ignores an older response after a newer
focus-out check increments its request counter. The current transport tests
exercise rejection/retry, but do not mount this component or prove response
ordering. One narrower case still needs a deterministic regression: start a
check for A, type B without leaving the input, then resolve A. The component
listens to `focusout`, not `input`, so typing alone does not invalidate its
counter. Verify whether A's outcome becomes visible for B and, if reproduced,
repair invalidation on edits while preserving warning-only saving and explicit
retry. This is a source-review hypothesis, not a reported browser reproduction
or a new defect disposition. No shared records or running servers were changed.

Subsequent approved component regression reproduced that hypothesis as
[DEF-026](./TEST_DEFECT_LOG.md#def-026---duplicate-result-remains-valid-after-typing-new-values).
The assertion failed before the production component was changed. Immediate
input invalidation now passes six synthetic mounted-component scenarios, and
the existing frontend Vitest suite passes 399/399. The repair is pushed in
[frontend PR #85](https://github.com/OppenJayme/biosphere-frontend/pull/85)
at `c55692e`; merge/deployment verification and independent acceptance remain
pending. Source inspection above remains
the historical hypothesis, not the current outcome. No app server or live data
was used; fresh headless fixture sessions were closed after each run.

### Inputs needed before acceptance execution

1. Reviewer availability confirmed by the user: Charles, John or Voltaire,
   depending on who replies first. Record the actual reviewer for each batch.
   Kyer/automation owner checks already exist; do not label another owner run
   as independent acceptance.
2. User reports some FAQ answers already exist; more may need requesting.
   Confirm their authoritative sources and approver before treating existing
   entries as approved. Use the [content sheet](./FAQ_CONTENT_REVIEW.md#real-museum-content-review-sheet);
   missing facts stay unapproved, never invented. The user plans to send the
   question list to Sir Curator and will relay answers; content-dependent work
   remains pending rather than inventing answers or activating test entries.
3. Local disposable FAQ and collection infrastructure is available, as verified below. A
   full-stack disposable BioSphere target for the remaining Cataloging/offline
   cases is NOT thereby established. Confirm its scope/containment before
   write/concurrency/interruption checks; never default to the shared database.
   Real backup/restore remains under its existing separate approval gate.

### Local database readiness - 2026-10-27

Read-only Docker checks confirmed the local Linux engine is running (28.4.0)
and the helper's pinned PostgreSQL image is cached. No download, database
connection, container creation/removal or migration was performed. No completed
FAQ SQL/HTTP/cleanup suite was rerun just to establish engine availability.

`test/support/disposable-faq-postgres.ts` creates a fresh owned container with
generated credentials, loopback-only random port, memory-backed storage and
ownership-checked cleanup. It accepts no existing database connection URL and
does not load the application `.env`. Its existing consumer covers FAQ review
tables plus minimal synthetic account/audit fixtures, not the full BioSphere
schema, Supabase providers or a copy of shared museum data.

An existing local Supabase stack with a different project identifier was also
visible. It was not inspected for credentials, connected to, modified or adopted
as disposable BioSphere infrastructure. Its identity, data and ownership are
not established by this check. Docker availability does not clear DEF-019's
full-stack isolation gate or authorize real backup/restore.

### Approved collection database slice - 2026-10-27

Following explicit user approval for collection HTTP and PostgreSQL seams,
the dedicated `collections` profile now supplies a fresh owned database for
the actual collection DDL/uniqueness migration plus minimal synthetic auth/audit
fixtures. [Sixteen SQL/HTTP checks passed](./COLLECTION_DATABASE_VERIFICATION.md),
including conflicts, concurrent writes, persisted audit readback, migration
refusal on legacy duplicates and atomic rollback on audit failure. Production
collection code and migration were unchanged. DEF-001 stays Ready for retest;
independent acceptance remains pending. The later metadata check below addresses
index presence on the configured target only. This does
not supply a full schema, browser/provider environment or OFF-003 containment.

The [independent collection review checklist and report template](./COLLECTION_DATABASE_VERIFICATION.md#independent-review-handoff)
are ready for the first available teammate on `test/cataloging-disposable-collections`.
Actual reviewer execution is pending; no independent result or shared deployment
approval is inferred from publishing this handoff for review.

### Configured collection index confirmed - 2026-10-27

The user separately approved a read-only metadata check. The backend-configured
`DATABASE_URL` target reports `uq_collection_name` unique, valid, ready and live,
with one `lower(btrim(collection_name))` key and no partial predicate. Transaction
read-only mode was confirmed; no collection/specimen records, migrations or
writes were involved. See the [exact metadata evidence and limits](./COLLECTION_DATABASE_VERIFICATION.md#configured-database-metadata-checkpoint---2026-10-27).
Independent acceptance, identification of the actual acceptance build/target and
any other deployment's verification remain separate; do not repeat shared-data
tests just because earlier dated notes still say index deployment was pending.

No additional product decision was needed merely to prepare this checklist.
Before executing any gated case, confirm its exact records, target, expected
side effects and approvals. The initial checklist-only update ran no tests;
the separately approved collection slice is recorded above. The next action is
named independent review and acceptance-target/build confirmation, followed by
teammate acceptance; this is not authorization for another broad test loop.

## Current checkpoint

- FAQ opt-in review is merged in backend #188/frontend #83 with successful PR
  CI. Approved disposable PostgreSQL migration/RLS, HTTP concurrency/rollback
  and real cleanup checks passed 13/13. See the [local evidence and remaining
  deployment gates](./FAQ_REVIEW_QUEUE_GUIDE.md#disposable-postgresql-checkpoint---2026-10-25).
  No shared migration, scheduler or live collection was enabled; do not treat
  this as hosted-environment or independent acceptance evidence.

- Opt-in unanswered FAQ review implemented on paired
  `feat/faq-opt-in-review-queue` branches: collection stays default-off, migration
  prepared only, no live collection. See [contract, isolated evidence and finite
  activation gates](./FAQ_REVIEW_QUEUE_GUIDE.md). Retention is now a 30-day working
  baseline, not unresolved user input or institutional approval. Deployment,
  real database/RLS/purge and independent acceptance are still required.

- Bounded FAQ context implemented on backend `4608b9f` / frontend `94293d1`:
  FAQ HTTP 29/29, backend unit 690/690, frontend 379/379, lint/type-check and
  thirteen-turn synthetic widget checks passed. Review paired branches; backend
  deployment first. This supports two explicit English follow-up prefixes with
  approved lexical evidence, not general semantic context. No live FAQ writes.
  See [context checkpoint](./FAQ_KNOWLEDGE_GUIDE.md#bounded-topic-follow-ups-checkpoint---2026-10-25).
- FAQ equal-score clarification/selection feature completed on backend `bafe427`
  and frontend `83ff93b`: FAQ HTTP 23/23, backend unit 690/690, frontend 378/378,
  lint/type-check and isolated real-widget checks passed. No live FAQ activation
  or browser ask forwarded. Review paired branches; deploy backend API first.
  Context, evaluated near-ties and unanswered review remain subsequent slices.
- P1 **DEF-022** merged in frontend #80; backend #185 documentation also merged.
  Both post-merge CI runs passed. Approved frontend production rebuild and
  blocked-save/retry verification passed on `9ea97c7`; backend was untouched.
  Owner checks complete; Ready for retest for independent acceptance and
  separate live-success limits. See the [merged checkpoint](./SPECIMEN_MEDIA_GUIDE.md#merged-metadata-repair-verification---2026-10-24).
- Move from the repeated owner-test loop to the [FAQ assistant next-step plan](./FAQ_ASSISTANT_NEXT_STEPS.md).
  This does not erase remaining release/sign-off gates or approve new policy.
- Frontend #78 and backend #181/#182 merged; their post-merge CI passed.
- Consolidated automated run: backend unit 690/690, isolated HTTP 337/337,
  frontend 366/366. The live Developer suite was explicitly excluded.
- The merged frontend was rebuilt and restarted on port 3000; backend 3001 was
  deliberately left alone. Both browser roles were preserved.
- DEF-020 owner browser failure/retry retest passed on the refreshed build.
  Independent acceptance and complete stale-response coverage remain pending.
- DEF-018 is Verified for its running Swagger declaration mismatch only.
- These results do not replace live provider/database evidence or teammate sign-off.

## Remaining work, grouped by completion gate

| Gate | Owner / coordination | Evidence needed to finish |
| --- | --- | --- |
| P1 CSV recovery: CAT-013 / DEF-021 | Independent reviewer, with Kyer supplying evidence | Frontend #79/backend #184 merged and CI passed; approved local production rebuild and two blocked-request retests passed on frontend `bf4e325`. Owner tests and deployment verification are complete. Obtain independent acceptance; do not repeat owner checks as if untested or infer real commit/concurrency proof. |
| P1 collection integrity: CAT-001 / DEF-001 | Kyer/backend; database/deployment owner | Local real SQL/HTTP checks pass 16/16; the separately approved metadata check confirms the required index on the backend-configured target. Obtain independent acceptance on an identified build/target; do not extrapolate to other deployments or authorize duplicate/reference cleanup. No shared migration is authorized here. |
| P1 browser behavior: CAT-014/015, DEF-020/003 | Kyer plus independent teammate / second-device tester | User-reported physical-phone LAN/touch checklist now passes in Google Chrome; phone OS/model/version unspecified. Obtain independent/release/full-accessibility acceptance, not another identical owner phone run. Duplicate failure/retry independent acceptance and stale in-flight ordering remain separate. |
| P1 diagnostic isolation: OFF-003 / DEF-019 | Kyer/test isolation; deployment owner for disposable target | Approve a disposable full-stack target and independently establish containment before repeating interruption tests. Keep the shared-backend pilot disabled and its retained evidence intact. Credential-free canary non-reproduction did not close this defect. |
| FAQ and duplicate business rules | Team/curator confirmation; Kyer implementation | The retained eight-decisions handoff already sets FAQ ambiguity/context/unanswered-review working directions; use the reconciled next-step plan rather than asking again. Algorithm/thresholds, language/context design, log retention, duplicate-question policy and isolated activation setup remain open. Archived specimen duplicate-match policy is separate. Do not activate arbitrary shared test answers. |
| Cross-module and live provider coverage | Kyer with John/Voltaire as appropriate | John supplies/approves Inventory/storage fixtures and placement evidence; Kyer tests Cataloging/Storage boundaries only. Complete the specified media role/wrong-pair/failure/accessibility and full restoration branches in an authorized setup. Isolated HTTP tests are supporting evidence, not provider/concurrency proof. |
| Audit/backup and final acceptance | Kyer, relevant test owners, deployment owner, independent reviewer | Resolve OBS-001 disposition, remaining audit access/failure/correlation cases and populated backup-history evidence. Fix/review fixture gaps without suppressing audit errors. Real backup/restore stays Deferred until procedure, storage/retention and disposable restore environment are approved. Record independent module sign-off. |

The table groups tasks; it is not six remaining individual tests or a claim that
every item is blocked. Safe scoped UI/negative checks and owner test-fixture work
may continue while other gates await decisions. Test only the missing subcase.

## Safe work versus approval gates

- Safe to plan next: independent no-save DEF-020 retest, second-device LAN
  checklist, remaining non-mutating UI/accessibility checks, and review of
  Kyer-owned Audit/Backup mock/readback regressions (DEF-015/016).
- Coordinate, do not absorb: DEF-017 belongs to John's Inventory fixture;
  dashboard duplicate visibility and OBS-002 polling behavior go to John/Charles,
  with Voltaire involved for shared authorization/security-audit contracts.
- Approval/environment required: database migration/concurrency writes, true
  session-expiry/inactive-account changes, live storage-failure injection, full
  offline interruption, FAQ activation and real backup/restore. Do not extract
  signed-in session tokens or add production API routes merely to test them.
- Retest remaining minor UI defects only against their exact checklists; do not
  mark them Verified because a related happy path passed. DEF-011 has pending
  performance/disposition evidence; no arbitrary response-time target is approved.

## Team messages ready to send

**Independent reviewer:** Please review the merged frontend DEF-020 fix using
the no-save duplicate checklist. Record commit/build, result and any remaining
stale-response gap. DEF-003 now has a reported owner phone/LAN checklist pass;
please review its remaining independent/release/accessibility limits rather than
calling the owner LAN actions untested. Please do not submit test specimen forms.

**John / Voltaire:** Please review DEF-017's missing security-audit fixture
adapter while preserving the real 403 guard and checking denial persistence.
John, coordinate the Inventory-owned storage/lot acceptance evidence with Kyer;
this handoff does not ask Kyer to implement Inventory behavior.

**Team / curator:** Please review only unresolved FAQ algorithm/threshold,
language/context and log-retention details, FAQ duplicate-question policy and
an isolated activation setup. Ambiguity/context/unanswered-review working
directions are already in the retained eight-decisions handoff. Archived
specimens' duplicate-match policy is separate; code behavior is not approval.

**Deployment owner:** Please confirm normalized collection-index deployment
and a safe database/concurrency verification procedure. Real backup/restore and
the blocked offline interruption test need approved disposable environments;
do not run them against the shared museum database.

## Finish line

Stop repeating already-passing owner happy paths. Re-run regression suites when
relevant code/dependencies change or for the agreed release checkpoint, not for
each documentation-only update. A module is accepted only when its critical and
major cases pass, security/data-integrity blockers are resolved, relevant failure
and retry checks pass, deferrals are explicitly accepted, and its owner plus an
independent teammate record sign-off. A green CI run alone is not acceptance.

Sources: [acceptance register and criteria](./ACCEPTANCE_TEST_PLAN.md),
[current defect dispositions](./TEST_DEFECT_LOG.md),
[duplicate policy limits](./SPECIMEN_DUPLICATES_GUIDE.md),
[FAQ lifecycle boundary](./FAQ_KNOWLEDGE_GUIDE.md),
[backup/deployment boundary](./BACKUP_HISTORY_GUIDE.md).
