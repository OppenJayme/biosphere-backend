# BioSphere Offline Specimen Draft Sync Guide

This module implements the server-side portion of SRS Section 4.14 for new,
text-only `UNCATALOGED` specimen drafts. Browser caching, offline search, draft
retention, connectivity detection, and the visible sync states remain frontend
PWA responsibilities implemented with IndexedDB/Dexie and the service worker.

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
The current full frontend suite passes 414/414 in 69 files; TypeScript no-emit,
full lint (zero warnings/errors) and diff checks pass. Two tests were added in
this slice; the full count also includes previously merged work outside Offline.

Test source `17c3c325eb74adeeeda417c7acdaea71e3c6c1c1` is published for review in
[frontend PR #86](https://github.com/OppenJayme/biosphere-frontend/pull/86).
Opening the PR does not establish merge or independent acceptance.

This verifies local failure/recovery transitions using synthetic responses,
not real token expiry, re-login, backend authorization/receipt atomicity,
database concurrency, browser interruption or complete UI acceptance. OFF-003
stays In progress and DEF-019's shared-backend interruption pilot stays stopped.
Existing manual/browser evidence below is historical and remains separate.

## Supported boundary

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
