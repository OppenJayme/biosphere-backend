# BioSphere Offline Specimen Draft Sync Guide

This module implements the server-side portion of SRS Section 4.14 for new,
text-only `UNCATALOGED` specimen drafts. Browser caching, offline search, draft
retention, connectivity detection, and the visible sync states remain frontend
PWA responsibilities implemented with IndexedDB/Dexie and the service worker.

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
