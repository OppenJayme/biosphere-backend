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
