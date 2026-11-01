# BioSphere Offline Specimen Draft Sync Guide

This module implements the server-side portion of SRS Section 4.14 for new,
text-only `UNCATALOGED` specimen drafts. Browser caching, offline search, draft
retention, connectivity detection, and the visible sync states remain frontend
PWA responsibilities implemented with IndexedDB/Dexie and the service worker.

## Owned accepted-write tab recovery - 2026-10-28

The explicitly approved real-UI/Nest/PostgreSQL case passes **1/1** in two
consecutive complete runs (25.7s and 26.8s). The first Nest transaction commits
one synthetic specimen while its HTTP adapter deliberately withholds the
successful response. Closing only that fixture tab leaves its draft in local
storage. A new tab on the same isolated origin/context recovers it as retryable
interrupted work. All entered fields remain unchanged; Retry is disabled while
offline. Reconnecting runs the real hook's automatic eligible-draft retry,
which returns the same draft/specimen IDs with `alreadySynchronized: true`.
The UI displays Synchronized and its Uncataloged cached record, with no Retry.

Final independent SQL postconditions are exactly **1 specimen, 1 receipt,
1 total audit and 1 successful sync audit**, correct curator attribution and
unchanged synthetic names/remarks. Public eligibility remains false. Adapter
observations require exactly two same-ID forwards, the first connection closed
before its 30-second hold deadline, and no hold expiry. A malformed POST is
rejected directly before any browser work/forwarding as a denial control.

Run `npm run test:offline:recovery` from the backend root with matching recovery
code in the sibling frontend checkout. Prerequisites match the containment
preflight: installed dependencies/pinned optional browser tools, Windows local
Docker, cached pinned image and Edge. This opt-in test does not run in ordinary
CI or accept an external database/application target. It creates its own tmpfs
database and minimal real Nest/auth/schema fixture, using synthetic identities.

The existing permanently read-only preflight adapter is unchanged. A separate
recovery adapter binds loopback, accepts only the exact expected synthetic core
payload and one draft UUID, permits at most two forwards, and uses a fixed owned
Nest destination/route/identity with redirect rejection. Cookies, authorization,
foreign origins/hosts and unknown routes are denied; browser interception adds
an exact-origin/method/path allowlist. Cache-list GET deliberately returns 503,
so the final cached card comes from the real successful sync path, not a fake
list response. No page-route teardown handler decides where a write goes.

Harness corrections are retained as evidence: initial local-save attempts were
blocked by the fixture CSP's prohibition of Zod's runtime schema compiler; the
disposable script policy now allows that compiler without changing production
CSP or network destinations. One early synchronization wait timed out without
adequate state diagnostics; its cause remains unestablished. Bounded synthetic
UI/state failure reporting was added; two complete runs then passed. A SQL
postcondition initially used nonexistent `public_display`; corrected to actual
`public_display_allowed` before accepting the pass. No application defect or
production fix is inferred from these harness failures; no assertion is skipped.

Both repositories' no-emit and touched-file lint checks pass. Owned containers
were absent after cleanup; original public login/root returned HTTP 200. No
manual application-server control or signed-in-window operation occurred.
The original backend listener's child changed during file activity (observed
41556 versus earlier 33092); frontend PID 16340 remained. Uninterrupted backend
process continuity is not claimed. No runtime, migration, Inventory, dependency
or shared-database changes; app suites/builds were not repeated for test tooling.

This closes the **bounded owned accepted-write/tab-retry evidence gap**, not
whole-module acceptance. DEF-019 stays Open because the historical shared-target
leak's cause and full Next/PWA containment remain unestablished; its old pilot
stays disabled. This facade replaces Next session/route middleware and does not
register the real service worker. Actual process death, provider expiry/re-login,
production deployment and independent acceptance remain separate. Normal
finally cleanup is not a process-crash guarantee. Next is review/merge and
independent acceptance of the agreed scope, not automatic expansion of tests.

## Offline UI containment preflight - 2026-10-28

The approved preflight passes **3/3** checks: adapter write denial without browser
interception; credential/origin/query-override rejection with independent backend
arrival counters; and a real offline-panel mount against an owned SQL/Nest
fixture. A protected audit GET provides a real backend positive control. The
browser canary records one allowed synthetic POST and zero blocked arrivals
over five samples/one second after its probe tab closes. The owned database
ends with **0 specimens, 0 sync receipts, 0 audits**. No draft is saved or
interrupted; no successful synchronization is claimed.

Run `npm run test:offline:containment` from the backend root with the matching
frontend checkout at `../biosphere-frontend`. This opt-in suite reuses the
offline-sync Docker profile and minimal Nest/auth/schema fixture described
below; it is excluded from normal unit/e2e discovery. The frontend root and
optional pinned browser dependencies must already be installed, along with
local Docker/cached image and Edge. See the frontend `tools/browser/README.md`
for the complete fixture/containment contract. No dependencies are installed by
this command; no application environment/credentials are copied.

The adapter has no write-forwarding branch. Only a fixed audit GET reaches the
owned backend; HTTP redirects are errors. Cache GET returns an explicit 503,
so no false cache-readback pass follows. Real React/hook/Dexie/sync modules run
in a new origin/context without Next authentication or PWA registration. The
synthetic identity provider and minimal auth/audit tables are not deployed
provider/RLS certification. Normal cleanup closes the owned browser session,
servers and exact-labelled tmpfs container; it is not a process-crash guarantee.

The first test initially failed because the adapter did not exist, then passed
after implementation. No application defect or production fix was introduced.
A later no-emit check caught a fixture header-array typing issue; its explicit
record type was corrected. Original application servers were not manually
restarted, but the existing Nest watcher again replaced its child during source
file activity (observed 33092 versus earlier 20060). Frontend PID 16340 remained;
uninterrupted backend process continuity is not claimed.

Validation: final preflight 3/3 (19.7 seconds); both repositories' no-emit and
touched-file lint checks pass. No owned offline container remained afterward;
public frontend login/backend root returned HTTP 200. Application suites/builds
were not repeated because production source and dependencies were unchanged.

**DEF-019 remains Open and OFF-003 In progress.** This establishes bounded
containment for this read-only fixture, not the historical leak's cause or
recovery from interrupted/accepted writes. The old shared-backend pilot stays
disabled. Agree a separate owned write/recovery slice before enabling writes;
real provider expiry/re-login, full Next/PWA behavior and independent acceptance
remain separate gates.

## Disposable PostgreSQL and HTTP verification - 2026-10-28

The approved backend slice passes **8/8** checks using real Nest controllers,
guards, services, Prisma and PostgreSQL. Only external identity-provider
responses are synthetic; account/role lookup and all mutation transactions use
the owned database. No AppModule, application dotenv configuration or existing
connection URL is loaded by this fixture.

Run explicitly on Windows with the documented local Docker Desktop Linux engine
and the helper's pinned PostgreSQL image already cached:

```powershell
npm run test:offline-sync:db
```

The helper's new `offline-sync` profile requires its own opt-in flag and creates
`biosphere_offline_sync_disposable` in a fresh randomly named/labelled container.
It retains generated credentials, loopback-only random ports, 384 MB/one CPU,
tmpfs storage/no host or persistent mounts, `--pull=never` and exact-owner
cleanup. The Nest test server also binds a random loopback port. This opt-in
suite is outside ordinary unit/HTTP/CI discovery; CI does not implicitly run Docker.

Setup applies the actual collection/specimen DDL, accession uniqueness migration
and offline-receipt migration. Shared minimal synthetic account/audit fixtures
supply dependencies, including two active curators.
Their synthetic provider UUIDs differ from their BioSphere account UUIDs, so
the attribution assertions also check the identity-to-account boundary.
The fixture role models
server-side Prisma access with BYPASSRLS; this is not deployed RLS certification
or a replay of the full historical schema.

| Case | Observed result |
| --- | --- |
| First acceptance | Trimmed, attributed Uncataloged/non-public specimen, matching durable receipt and readable success audit persist together. |
| Normalized same-ID retry | Original specimen returned; receipt identity/timestamp and success-audit count unchanged. |
| Changed-content conflict | 409; original specimen/receipt preserved and original-content retry remains valid. |
| Concurrent identical requests | An owned advisory-lock trigger confirms two transactions reached insertion before release; responses converge on one specimen/receipt/audit, with one first acceptance and one retry. |
| Owner separation | Two curators reuse the same draft UUID and receive distinct, correctly attributed specimens and receipts. |
| Audit failure | Actual INSERT permission denial rolls back specimen/receipt/audit; restoring the grant permits a safe first-acceptance retry. |
| Receipt failure | A trigger fault after audit insertion rolls back the prior specimen and audit too; removing it permits a safe retry. |
| SQL uniqueness | Duplicate owner/draft receipt rejected with 23505 even for a separate unreceipted SQL specimen fixture; original receipt unchanged. |

The concurrency barrier has a three-second observation deadline and is released
in finally; the trigger/function are removed after both requests settle. Failure
grants/triggers are restored/removed in finally. Expected PostgreSQL 42501 and
23514 Nest/Prisma error stacks remain visible, along with the VM-module warning;
they are intentional owned-fixture faults, not suppressed production failures.
The first fixture assertion used database field `status` for the public audit
response; it failed and was corrected to the API's `result` field. No production
bug or runtime change was needed to pass the slice.

This closes the bounded owner SQL/HTTP receipt-uniqueness, two-request concurrency
and rollback verification gap. It does not establish real Supabase sessions,
production migration/RLS/scale, full browser recovery, independent acceptance
or a full-stack disposable environment. OFF-003 stays In progress; DEF-019's
shared-backend tab-interruption pilot remains stopped. Shared records, Inventory,
ports 3000/3001 and signed-in browser windows are outside this fixture.

Validation: final offline database suite 8/8; existing offline service 8/8 and
isolated HTTP 4/4; existing collection database compatibility 16/16. TypeScript
no-emit and diff checks pass. Full lint has zero errors and seven pre-existing
unused-disable warnings; touched test files lint clean. Owned-container readback
found no retained offline-sync or collection test containers. Frontend PID
16340 remained on 3000. The existing Nest watcher logged file-change recompiles
and its backend child was PID 20060 on 3001 at the final check, rather than the
earlier PID 13188. Parent metadata traces it to the original watcher PID 20792.
No manual restart/stop command was issued for that backend; the exact triggering
file is unestablished. Do not claim uninterrupted backend process continuity.
No runtime source, authentication settings or application environment file was
edited. Public backend root and frontend login readiness both returned 200
after the observed watch restart; this is not a protected workflow retest.
No frontend suite/build or full backend campaign was repeated for this bounded
test-only change.

## Isolated frontend route-adapter checks - 2026-10-28

The agreed five-case adapter batch is implemented in frontend
`src/app/api/offline/specimen-drafts/route.test.ts`, source `77a84f2`, published
in [frontend PR #87](https://github.com/OppenJayme/biosphere-frontend/pull/87).
Tests call the real POST handler with native Request/Response objects and run
the real API client/ApiError and schemas. Session/config and backend HTTP
responses are synthetic; fetch and environment overrides are restored afterward.
No server, browser, real login/credential or shared record is used.

| Case | Observed result |
| --- | --- |
| Valid success | One JSON POST to the expected backend path with a synthetic bearer header; validated 200 result and no-store response. |
| Backend 401 | HTTP 401 and guidance preserved, no-store, unrelated backend fields omitted, no request replay. |
| Backend 403 | HTTP 403 and array-form guidance preserved, no-store, unrelated fields omitted, no replay. |
| Malformed backend 200 | Missing synchronized-specimen fields produce 502/no-store rather than a false success. |
| Unsupported offline fields | Publishing/quantity fields produce 400/no-store before token lookup or any backend fetch. |

Run from the frontend root:
`npm test -- src/app/api/offline/specimen-drafts/route.test.ts` (5/5 passed).
Full frontend suite: 419/419 in 70 files. TypeScript no-emit, full lint with
zero warnings/errors and diff checks pass. Existing runtime code passed all
five cases; no production fix or new application defect was established.

Direct handler invocation does not test a running Next server/middleware/proxy,
actual token expiry/re-login, backend authorization/receipt atomicity, database
concurrency or complete browser/security behavior. The earlier store/queue
checks remain a separate seam. OFF-003 stays In progress and DEF-019's shared
interruption pilot remains stopped. This completes the agreed five-case batch;
no runtime rebuild/browser rerun is needed for this test-only change.

## Isolated authorization recovery checks - 2026-10-28

The approved frontend sync/store seam now has two additional tests in
`src/features/offline/offline-sync.test.ts`. They use the real synchronization,
queue eligibility and store code with a uniquely named fake IndexedDB and an
injected synthetic HTTP responder. Each test deletes only its own fake database.
No browser, live login, backend connection or shared record is used.

- A synthetic 401 retains the same owner, client draft ID and text, records a
  retryable AUTH failure, and adds no accepted specimen to the local cache.
  A subsequent synthetic successful response through the eligible queue reuses
  exactly the same draft ID/payload, marks the draft synchronized and caches the
  Uncataloged/non-public result. Another owner's pending draft remains unchanged
  and receives no cache entry from this synchronization.
- A synthetic 403 retains the draft and permission guidance as a nonretryable
  AUTH failure. Running the automatic queue again sends no further attempt for
  that draft and leaves it and another owner's draft unchanged. No synchronized
  specimen is cached for the denied request.

Both tests passed against the existing implementation; no runtime fix or new
application defect was established. Run from the frontend root:
`npm test -- src/features/offline/offline-sync.test.ts` (9/9 focused checks).
That checkpoint's full frontend suite passed 414/414 in 69 files; TypeScript no-emit,
full lint (zero warnings/errors) and diff checks pass. Two tests were added in
this slice; the full count also includes previously merged work outside Offline.

Test source `17c3c325eb74adeeeda417c7acdaea71e3c6c1c1` was merged through
[frontend PR #86](https://github.com/OppenJayme/biosphere-frontend/pull/86).
Its PR CI and companion backend documentation PR #200 CI passed; both PRs are
merged. Independent acceptance remains separate.

This verifies local failure/recovery transitions using synthetic responses,
not real token expiry, re-login, backend authorization/receipt atomicity,
database concurrency, browser interruption or complete UI acceptance. OFF-003
stays In progress and DEF-019's shared-backend interruption pilot stays stopped.
Existing manual/browser evidence below is historical and remains separate.

## Supported boundary

### Live isolated session-loss and re-login recovery - 2026-11-01

The user authorized exactly one persistent synthetic specimen and a separate
spare-Curator browser session. Actual frontend `60ab28b`, production build
`KjnKPLGaaPM_cm9tgFdJ_`, and running backend `4de07c6` were used. This checks
local session loss, real frontend 401 handling, manual re-login and same-ID
recovery; it does not simulate or prove natural JWT expiry/provider revocation.

The user manually signed in and later signed back in with the spare account.
No password, cookie/token value or auth state was copied or exported. Inspection
of the installed Supabase SDK confirmed normal `signOut()` defaults to global
scope, so that action was not used. Only the isolated test context's cookies
were cleared; IndexedDB and the original account's browser were preserved.

The test accession was absent before any draft was created. The real offline
modal saved one text-only local draft. Reconnection with the test cookies gone
produced a real `/api/offline/specimen-drafts` 401 and the visible sign-in/retry
message. ID, owner partition and all eight core payload fields survived, with
recoverable AUTH failure and no server specimen ID. After manual same-account
re-login, a fresh protected workspace displayed that owner's retained draft and
automatically synchronized it: 200, `alreadySynchronized: false`. An explicit
identical request returned 200, `alreadySynchronized: true`, and the same server
ID. The synchronized local receipt, catalog row and success audit were read back.

Retained authorized fixture:

- Accession: `TEST-SESSION-20261101-A`.
- Name: `TEST - Session Recovery 20261101`.
- Client draft UUID: `3df63227-a7b7-4678-8798-86b3869bf5dd`.
- Specimen UUID: `dcb4fbcf-dfbe-4fbc-a852-0cd79e1d6fd7`.
- Observed: one matching catalog record; `UNCATALOGED`; public display false;
  no active lots; one matching `SYNC_OFFLINE_SPECIMEN_DRAFT` success audit whose
  details contain the original client draft UUID. No lot/storage/media operations
  were submitted. The synchronized local receipt remains in the test context.

**Result:** 28 functional assertions passed across retained-draft recovery,
authenticated sync, identical retry and catalog/audit readback. A separate
read-only probe confirmed the original account still accesses the protected
Cataloging queue, with its original dashboard URL preserved. Both account
windows remain open; the created login tab was closed after recovery. The test
context keeps its read-only guard after completion; the original account is
not subject to that guard.

**Diagnostic qualifications:** the context guard explicitly allowed only three
exact test-draft requests, with responses **401, 200, 200**, plus the user's
manual login submission. One additional `POST /api/offline/specimen-drafts`
attempt was blocked. Only its method/path were retained, not its payload or
timing; do not label its cause, prove independent server non-arrival, or claim
a zero-attempt clean run. The later readback caused no further blocked attempts.
The first recovery helper also stopped on a CSS selector whose attribute quotes
were stripped by command transport. Only readback resumed with an attribute
comparison; no draft/sync creation step was repeated. Console diagnostics showed
two HTTP 401 messages; there were zero browser page exceptions. These facts
remain in the record rather than being suppressed as a clean execution.

No application bug is established from that unclassified blocked attempt; its
disposition belongs in independent acceptance. Functional recovery evidence
does not close historical DEF-019 or its stopped shared interruption pilot.
There was no response hold, interruption, global sign-out, database migration,
quantity change or server restart. This is not independent acceptance, a full
Next/PWA/security evaluation, direct SQL receipt counting or concurrency proof.

Before turnover, Kyer/Curator must record the fixture's approved archive or
separated test/demo disposition, preserve audit/history, and verify exclusion
from real museum counts/reports. No cleanup was automatically performed. Ignored
scripts are in `.codex-tmp/session-recovery-20261101/`; shared documentation
contains no credentials or unrelated record contents. `git diff --check` passed;
no application suite/build was repeated for this live evidence update.

### OFF-004 read-only browser boundary checkpoint - 2026-10-31

Owner browser checks passed on local frontend source `60ab28b`, with on-disk
production build ID `KjnKPLGaaPM_cm9tgFdJ_`; no build/restart was performed.
Backend source remains `f4df176`. This is bounded browser evidence, not an
independent acceptance report or verification of pending repair branches.

The existing authenticated browser session was preserved. A temporary tab first
confirmed no eligible/interrupted local drafts, loaded the actual specimen
workspace with `selected=none`, and used target-scoped CDP offline emulation.
All non-GET/HEAD/OPTIONS requests were blocked by a read-only guard. Its eleven
assertions passed:

- No eligible/interrupted drafts before opening the workspace.
- Offline state disables the actual Sync now control.
- Cached specimens are populated and their rows contain no links, mutation,
  media, detail or form controls.
- New offline draft opens with exactly accession number, category, common name,
  scientific name, gender, classification status and remarks; no upload field.
- Cancel closes the modal without saving; all existing local draft content and
  states match the before-read in memory.
- Zero non-read requests and zero page errors in the final workspace run; the
  original signed-in page URL remains unchanged.

The fallback slice used a separately named, fresh credential-free Edge session.
It loaded the served `/offline.html` and explicitly registered the served
`/sw.js` in that disposable context. Four checks passed: the populated worker
cache contained only the fallback/favicon/allowed build-asset paths; fresh
offline navigation to `/specimens` rendered `BioSphere is offline`; that page
had no record table, form or workspace; zero non-read requests occurred. This
checks the real served worker, not automatic app registration or an
authenticated offline reload. No credentials/storage state were copied.

Diagnostic corrections are retained rather than counted as passing runs:
the initial combined attempt stalled during the fresh-context bootstrap and
was stopped by closing only its owned pages (execution-context-destroyed error).
Two workspace attempts blocked one `POST /specimens` each; inspection identified
the default selected-record cover-preview read as a Server Action using POST.
No POST was permitted and no mutation is inferred from its method. Clearing
selection excluded that unrelated read and produced the clean final run.
The first standalone fallback attempt used `Request.url()` instead of the
Cache API's `Request.url` property; correcting the diagnostic produced the
passing fallback run. No application defect or repair is claimed from these
diagnostic issues.

Cleanup confirmed only the original audit tab remained in its context, online,
with no extra context pages; the named fallback browser was closed. Existing
drafts were not saved/edited/removed, no sync was requested, and no shared
record or server configuration was changed. Ordinary online cache reads could
refresh the device-local read-only specimen cache. Scripts remain ignored at
`.codex-tmp/offline-boundary-20261031/`; no private draft content was published.

Subsequent isolated request checks in [backend #222](https://github.com/OppenJayme/biosphere-backend/pull/222)
and [frontend #98](https://github.com/OppenJayme/biosphere-frontend/pull/98) complete
the named unsupported-field matrix owner-side: twelve fields tested independently
at both nested and envelope levels, 24 new cases per side; full focused suites
pass 28/28 and 29/29 respectively. Each verifies field-specific 400 rejection
before receipt lookup/writes or credential lookup/forwarding. Changed-test lint
and whitespace checks pass. Both test-only suites use synthetic adapters.
Frontend #98 merged on 2026-10-31 at
`a7cbc17f59b5f77d8274156130263b2acdbe63cb`; backend #222 also merged on
2026-10-31 at `4de07c6fd42a0207f1c3d7ab4b9b20a7fd16e3f0`. The November 1
[merged-source checkpoint](./COMPLETION_HANDOFF.md#merged-backend-preparation---2026-11-01)
passes build, 100 import/offline HTTP and 18 compatibility assertions in an
isolated checkout. Neither suite proves a live rejected-request matrix or rollout.
OFF-004 remains **In progress** for independent/release acceptance. Actual expired-session re-login,
cross-account device access and full PWA/provider behavior are not proved.
DEF-019's shared-backend interruption pilot remains stopped. Do not repeat
these fifteen completed owner assertions as missing work. Documentation-only
validation: `git diff --check`; application suites/builds were not rerun.

### OFF-004 source and evidence reconciliation - 2026-10-31

Inspection used backend `f4df176` and frontend `60ab28b`; it did not execute
the application, repeat prior suites, or establish the served build's behavior.
This separates existing implementation/evidence from the remaining negative
acceptance matrix. No new defect was established and OFF-004 stays In progress.

| Boundary | Inspected implementation / existing evidence | Remaining acceptance distinction |
| --- | --- | --- |
| Text-only local draft | `OfflineSpecimenDraftModal` exposes core text/gender fields and explains the online-only features. `draftFromFormData` explicitly sets `collectionId` to null; the strict draft schema excludes inventory, media and lifecycle fields. | Check the real offline modal/control boundary on the chosen release build; source inspection alone is not that browser result. |
| Read-only cached records | `OfflineSpecimenPanel` renders cached identifiers/names/status with search and filters; cached rows offer no mutation or detail-navigation controls. Local draft Edit/Remove controls operate on the separate queue. | Verify cached rows cannot initiate media, movement, archive or publishing operations. Do not confuse removing a local draft/receipt with deleting a server specimen. |
| No synchronization while offline | Sync/Retry controls depend on connectivity; `synchronizeAll` and `retryDraft` also check `navigator.onLine` before calling sync functions. | Confirm no outgoing sync request from the offline controls on the selected browser/build. Network restoration and actual expired-session re-login remain distinct cases. |
| Frontend payload boundary | The real offline POST handler validates a strict top-level and nested schema before forwarding. The existing route test rejects `publicDisplay` and `quantity`, with neither backend fetch nor token lookup performed. | That executed test covers those two fields, not an individually executed media/taxonomy/provenance/lot/movement/archive/QR/report request matrix. Do not label the broader matrix Pass from schema inspection. |
| Protected backend boundary | The Curator-only controller uses nested `CreateSpecimenDto`; the application's ValidationPipe forbids non-whitelisted fields. The existing HTTP suite rejects `imagePath` and confirms no specimen/receipt creation. Backend core DTO permits an existing collection UUID; the browser draft form does not offer collection assignment. | Do not describe collection UUIDs as rejected by the backend. The image rejection is prior isolated HTTP evidence, not live role/session-expiry or every unsupported operation tested. |
| Fresh offline navigation / cache | `public/sw.js` caches only same-origin build assets, favicon and the record-free fallback. Protected HTML/navigation is network-first with the generic offline fallback; API/auth/data requests have no worker cache handler. Existing manual fallback/reconnect evidence is retained above/below. | Verify the chosen release build's cache contents and generic fallback without clearing another user's cache/session. This inspection supplies no new PWA, account-security or deployment acceptance. |

Next owner acceptance is one bounded read-only browser matrix for the real
offline draft, cached rows, disabled sync and fresh-navigation boundaries,
followed by the agreed independent review. Actual session expiry/account
changes and interruption use only a separately agreed safe target; DEF-019's
shared-backend interruption pilot remains stopped. Previously passing owned
SQL/HTTP, local isolation and lost-response recovery cases are not requeued.
Documentation validation: `git diff --check`; no credentials, servers, shared
records, local drafts or existing browser windows were changed.

- `POST /offline-sync/specimen-drafts` accepts one draft at a time after stable
  connectivity returns and the curator has authenticated.
- The payload contains a stable browser-generated `clientDraftId` UUID and the
  existing specimen-core creation fields under `draft`.
- The resulting server record is always `UNCATALOGED`, never public-display
  eligible, and attributed to the authenticated BioSphere curator account.
- Text is normalized and validated with the same `CreateSpecimenDto` used by
  normal specimen creation. A supplied collection UUID must exist.
- Images, taxonomy, provenance, lots, movements, quantity changes, imports,
  archiving, publishing, reports, and all other online-only operations are not
  accepted by this endpoint.
- The endpoint returns HTTP 200 for both first acceptance and safe retry. The
  `alreadySynchronized` field tells the client whether the receipt existed.

## Retry and conflict contract

The browser must generate `clientDraftId` exactly once when it creates the
local draft and retain that ID across every retry. The backend stores a
successful receipt in `public.offline_draft_sync` in the same transaction as
the specimen and audit event.

The database uniquely constrains `(created_by, client_draft_id)`. Therefore:

- retrying the same ID with the same normalized content returns the original
  specimen and does not create another record;
- retrying the same ID with different content returns HTTP 409 and does not
  overwrite either version;
- different curators may independently use the same randomly generated UUID;
- transaction and uniqueness contention is retried up to three times before a
  recoverable HTTP 409 is returned.

A SHA-256 payload fingerprint is stored only to detect accidental or unsafe ID
reuse. It is not authentication, encryption, or a replacement for the draft.
No secret or image content is stored in the receipt.

## Atomicity and audit

The specimen insert, successful `SYNC_OFFLINE_SPECIMEN_DRAFT` audit event, and
sync receipt commit atomically in one serializable transaction. If validation,
collection lookup, audit writing, or receipt writing fails, none of those
records commit. Failed drafts therefore remain local and the frontend should
display the server's safe validation/conflict message as `Sync Failed`.

## Frontend responsibilities

- Cache only previously synchronized specimen responses needed for offline
  viewing/searching.
- Store offline-created text drafts in IndexedDB and initially mark them
  `PENDING_SYNC`.
- Submit drafts only while online and authenticated; use `SYNCHRONIZING` during
  the request.
- On success, replace/refresh the local cached record with the returned
  specimen and mark the draft `SYNCHRONIZED`.
- On rejection or network failure, retain the draft, mark it `SYNC_FAILED`, and
  show an understandable reason. Never discard it automatically.
- Existing server specimens must remain read-only offline. Do not queue edits,
  media, cataloging, storage, lot, archive, account, report, backup, QR, or AR
  operations.
- Local cached data is not a server backup or confirmed server record until a
  sync response succeeds.

## Deployment requirement

Deploy migration `20260913000000_add_offline_draft_sync` before enabling the
frontend sync call. The migration adds only the receipt table, its uniqueness
constraints, foreign keys, index, and RLS enablement. Production database-role
permissions and RLS policies must remain consistent with the backend's
server-only Prisma access model.

## Acceptance and recovery evidence - 2026-10-17

### Manual reports

The tester confirmed cached viewing in an already-loaded offline workspace,
the record-free fallback after offline reload, and automatic online recovery.
Text drafts saved locally as pending, synchronized into one Uncataloged record,
retained local edits on synchronization, and survived reload/reconnection.
Repeating Sync now did not create another record. Removing a synchronized local
entry preserved its server record; discarding an unsynchronized draft did not
create a server record. The draft form exposed text-core fields only. Using
two accounts in the same browser profile, the tester reported no cross-account
local visibility and confirmed account A's draft became one synchronized
record after returning to A.

These are tester reports rather than an independently replayed browser session;
the exact running commits were not captured. In particular, clicking Sync now
after a draft is already synchronized is not proof of resubmitting a lost-response
request with the same draft ID.

### Automated verification

Executed on backend `825ac84` and frontend `3e3b4f8` without changing application
code, stopping running servers, or writing to the live database:

- `npm test -- --runInBand offline-sync.service.spec.ts`: 8/8 passed.
- `npm run test:e2e -- --runInBand offline-sync.e2e-spec.ts`: 4/4 passed.
- Frontend offline-sync and offline-filters Vitest suites: 10/10 passed.

Backend tests use mocked Prisma/Supabase dependencies. They cover original-record
reuse on same-content retries, changed-content conflicts, bounded contention
retries, invalid-input rejection, curator access checks, and attribution.
Frontend tests use fake IndexedDB and mocked fetch. They cover retained network
failures, concurrent local attempts, conflict editing restrictions, owner-scoped
cache handling, and recovery of a SYNCHRONIZING draft into a retryable failure.

The interrupted-state test does not itself retry the recovered draft through a
real backend. Full browser interruption after server commit but before response,
live concurrent database contention, session-expiry recovery, and the complete
HTTP error/pending UI matrix remain unverified. These passing suites are focused
regression evidence, not full offline-module or production-security sign-off.

## Live lost-response pilot - 2026-10-18

**Result:** Passed for the tested development workflow (OFF-003 partial live
verification). The user confirmed the development setup and signed into a
separate, nonpersistent Edge test session. No credentials were captured or
committed. Working-tree references were frontend `e43e7fc` and backend `064eb9d`;
the exact commits of the already-running application builds were not independently
verified. Both worktrees were clean when the test began.

The browser drove the existing offline workspace, not a mocked UI:

1. Save a new text draft while offline and observe Pending Sync.
2. Reconnect. Intercept only this test draft's POST to
   `/api/offline/specimen-drafts`; forward it to the real local application once
   with transport retries disabled.
3. Validate the successful response identifies a newly accepted specimen, then
   abort delivery of that response to the browser with a connection-reset error.
4. Confirm one local draft remains in retryable SYNC_FAILED state with the same
   client draft ID, despite the server having already accepted it.
5. Click that draft's Retry. Assert identical request content/client draft ID,
   `alreadySynchronized: true`, and the original server specimen ID.
6. Verify Synchronized locally, then read back through the protected same-origin
   specimen endpoint and find exactly one matching Uncataloged record with public
   display disabled.

Evidence: two matching POST attempts, no assertion failures, and one accepted
record named `TEST Offline Recovery 20261018 81f28bbb`:

- Specimen ID: `babb54f9-b08d-49f4-8786-a81d91dda0e1`
- Stable client draft ID: `b2042078-b346-40a3-8414-88c3b075d8d3`

The response interception was removed, connectivity restored, and only the pilot
browser session closed. The disposable development specimen remains for review;
no automatic deletion or archiving was performed. Temporary harness artifacts
remain ignored in the frontend tooling directory, not a committed CI test.
Application source, auth configuration, existing records and running servers were
not changed by this pilot.

This covers a real accepted-write/lost-response/retry chain, not process death,
browser closure during the write, live concurrent contention, session-expiry
recovery, or the full HTTP error matrix. It does not close all OFF-003 cases or
constitute full module/security acceptance.

## Browser simulated-401 retention check - 2026-10-22

**Result:** Passed for the tested frontend transport-error handling, supplementing
OFF-003. PR #171 was confirmed merged with successful CI. Checkout references:
backend `9e42a6c`, frontend `bc55ce7`; exact running build hashes were not checked.
This did not repeat the accepted-write/lost-response pilot above.

Used a temporary tab in the existing signed-in Edge context `biosphere-aud002`.
A read-only IndexedDB preflight found no pending, synchronizing or retryable
failed drafts that opening the workspace could accidentally synchronize. Created
one uniquely labelled text-only local draft through the actual form:
`TEST Offline AUTH 20261022 1a163b6bbd4`.

The probe tab intercepted only its offline-draft endpoint requests. For the
labelled draft, it returned a synthetic HTTP 401 without forwarding the request
to the application/backend. An unrelated draft request would have aborted the
diagnostic rather than been submitted. Real cookies/session remained intact;
the test did not sign out, expire a token, impersonate an account or fake success.

Observed through the real UI and read-only local draft inspection:

- The rejected draft showed **Sync Failed** and the fixed session-expired
  guidance, retained its common name/remarks, had failure kind `AUTH`, remained
  retryable and had no server specimen identifier.
- Reload retained its client draft ID and complete text payload. Opening Edit
  showed the saved name/remarks; Cancel left them unchanged.
- Once synchronization/cache refresh finished, Retry was enabled. Retrying
  produced an identical draft ID/payload; both observed attempts were answered
  with simulated 401, not delivered to the backend.
- A real protected specimen-list read found no record with the unique test
  name. This supplements the transport guard, not a direct database inspection.
- Removed only this disposable local fixture using **Remove locally → Yes,
  discard**, then verified its absence from IndexedDB. The removed synthetic
  text is not recoverable through that local queue; no museum/server record was
  deleted. Normal workspace reads could refresh the device-local read-only cache.

An initial diagnostic asserted Retry availability too early: the failure badge
had rendered while the normal cache-refresh operation guard was still active.
Its own fixture was cleaned up through the UI; a fresh preflight confirmed no
eligible draft remained. The helper was corrected to await the enabled control,
then the complete pilot passed. No application defect was established by that
diagnostic timing error, and no runtime code was changed.

Closed only the temporary tab, which removed its page-scoped interception. The
original signed-in audit tab/URL remained intact. Final preflight again found
no eligible drafts. No credentials, auth state, request headers or private museum
contents were exported. Local scripts remain ignored under frontend
`tools/browser/artifacts/offline-auth-preflight.txt` and
`tools/browser/artifacts/offline-auth-401-pilot.txt`.

**Limits:** This verifies browser/local-storage handling of a simulated 401 and
same-payload retry, not real token expiry, refresh/re-login, inactive accounts,
successful post-login sync, process death or live concurrency. There was no
server commit or backend idempotency exercise in this run. OFF-003 stays
**In progress**; real session-expiry/re-login and interruption cases still need
an approved disposable setup. Documentation-only verification: `git diff
--check`; application suites/build were not rerun for this evidence update.

## Browser simulated error-state matrix - 2026-10-22

**Result:** Six scoped cases passed, supplementing OFF-003 and the simulated-401
check above. PR #172 was confirmed merged with green CI. Checkout references
were backend `e40056d`, frontend `bc55ce7`; served hashes were not independently
verified. Existing Playwright session `biosphere-aud002` remained signed in.

Read-only preflight found no existing pending/synchronizing/retryable failed
drafts. A temporary tab awaited the normal mount-time auto-sync/cache refresh
before creating each of six disposable text-only drafts through the real UI.
Names used prefix `TEST Offline ERR 20261022 1a163c7cf5a`, suffixed by the status
below. Each draft request received its page-scoped synthetic response; none
was forwarded to the application/backend. Unexpected draft requests would
abort the diagnostic instead of being submitted.

| Simulated response | Retained failure kind | Retry enabled | Edit offered | Result |
| --- | --- | --- | --- | --- |
| 400, validation-message array | VALIDATION | No | Yes | Pass |
| 403, permission denied | AUTH | No | Yes | Pass |
| 409, conflict without a supplied message | CONFLICT | No | No | Pass |
| 429, rate limited | SERVER | Yes | Yes | Pass |
| 503, server unavailable | SERVER | Yes | Yes | Pass |
| 200, invalid success-response schema | UNKNOWN | No | Yes | Pass |

For each case, the visible **Sync Failed** message, persisted failure kind,
retry flag and actual Retry/Edit controls matched the expected behavior after
the operation/cache refresh finished. Client draft ID and complete text payload
remained unchanged; no server specimen ID was assigned. The 400 message array
displayed joined validation guidance; 409 displayed the fallback conflict
message. Internal diagnostic markers supplied in 403/429/503/invalid-response
bodies were not displayed. Invalid 200 data did not produce false synchronization.
There was exactly one intercepted request per case, six total, with no unexpected
draft requests. This checks control state, not a successful later retry.

Each labelled fixture was removed through **Remove locally → Yes, discard**;
read-only IndexedDB checks confirmed removal. These six synthetic local drafts
are no longer recoverable through their queues. No museum/server specimen was
deleted. A real protected specimen-list read found no matching test prefix;
final preflight found no eligible local drafts. Normal workspace reads could
refresh the device-local read-only cache. The temporary tab and its interception
were closed; the original curator audit tab/URL remained untouched. No credentials,
auth exports, headers or private museum data were included in shared evidence.
Ignored diagnostic: frontend `tools/browser/artifacts/offline-error-matrix.txt`.

No application defect was reproduced or runtime code changed. This is a real
browser/UI/local-storage exercise with **simulated HTTP outcomes**, not backend
validation, role denial, live throttling/outage, genuine server conflict or real
session expiry. It does not prove re-login/successful retry, process interruption,
database concurrency, full error/pending behavior or complete offline acceptance.
OFF-003 remains **In progress** for those gaps. Documentation-only verification:
`git diff --check`; no application suites/build were rerun for this evidence.

## Tab-interruption pilot stopped: test-isolation failure - 2026-10-22

The next OFF-003 diagnostic attempted to close a temporary tab while its draft
request was held locally, then reopen the workspace and retry against a
synthetic 503. Earlier local assertions observed retained `SYNCHRONIZING` state
after closure, recovery to retryable `NETWORK` failure, and unchanged retry
payload. **The final server-absence guard failed:** a disposable server specimen
had been created despite the intended page-scoped request interception.

See **DEF-019** in `TEST_DEFECT_LOG.md` for the full sequence and retained fixture
`99782144-b9cf-4dd0-ad7b-1d5ec0f18f17`. It remains Uncataloged with public display
off and a successful sync audit. Only its local draft was discarded; the server
record was not automatically deleted or archived. Original sign-in/tab remains
intact; no eligible local drafts remain. The precise transport path causing the
write has not been established, and no app authorization defect is inferred.

This run is **not an acceptance pass**. Do not repeat the ignored interruption
script against the shared running backend. Further interruption tests require
an explicitly confirmed disposable target and containment independent of the
tab being destroyed. The earlier 401/matrix fixture names were still absent
on readback, but that does not excuse or close the new isolation defect.
Actual browser/process death, accepted-write interruption, re-login and live
concurrency remain unverified. No runtime code was changed in this checkpoint.
