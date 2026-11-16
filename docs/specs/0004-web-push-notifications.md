# 0004. Web Push alerts for new submissions and visitor replies

**Date**: 2026-11-16
**Status**: In Progress

## Summary

Curators only learn about a new inquiry, a new visit request or a visitor's
email reply when BioSphere is open: the bell polls every 60 seconds while the
tab is visible. This spec adds standard Web Push to the PWA so a curator who
turns it on for a device gets a system notification for those three events even
when BioSphere is closed or in the background. Push is an extra delivery
channel for the existing in-system alerts (REQ-4.3-05/06); the bell stays the
source of truth.

## Context

- The SRS rules out a native app and SMS; BioSphere is a responsive site and PWA
  with a service worker (`public/sw.js` in the frontend).
- The bell feed is derived from records on each request, with per-curator
  read/dismiss state (`user_notification_state`). Nothing stores devices.
- Visitor replies are imported from the museum Gmail by `MailboxSyncService`
  (spec 0002) on an interval; new submissions are announced by
  `SubmissionNotificationsService.announce()`.
- REQ-4.3-08: notifications must not expose private visitor details to anyone
  unauthorized. Push travels through browser vendors' push services (Google,
  Mozilla, Apple, Microsoft) and can show on a lock screen.
- REQ-4.3-10: internal operational alerts stay in-system rather than email.

Push is not named in the SRS. It is recorded here as a team decision that adds a
delivery channel under REQ-4.3-05/06, not as a new requirement ID.

## Requirements

**User stories**:
- As a curator, I want my phone or computer to alert me when a visitor submits
  something or replies by email, so that I answer quickly without keeping
  BioSphere open.
- As a curator, I want to turn this on or off per device.

**Acceptance criteria**:
- **AC-1**: An active Curator can turn push on for the current browser; the
  backend stores that device for their account only. They can turn it off again.
- **AC-2**: When a General Inquiry or Visit Request is submitted, or a visitor
  reply is imported, every device registered by an active Curator receives a
  push within seconds of the event being saved.
- **AC-3**: The push message carries no data at all. The device fetches the
  curator's own feed through the authenticated frontend route and shows the
  alert's title and reference code only, never visitor names, emails or text.
- **AC-4**: Clicking the notification opens the related record (REQ-4.3-06).
- **AC-5**: An open BioSphere tab refreshes its bell when a push arrives.
- **AC-6**: A failed push never fails or delays the submission or the import.
  Devices the push service reports as gone (404/410), or that fail 5 pushes in
  a row (for example after a key rotation), are removed.
- **AC-7**: With `PUSH_NOTIFICATIONS_ENABLED` unset or false, or VAPID keys
  missing, nothing is sent, the config endpoint reports push as off, and
  registration returns 503.
- **AC-8**: Only https endpoints on known browser push services are accepted.

## Options considered

### Option 1: Server-Sent Events from Nest
**Pros**: no new table; instant while a tab is open.
**Cons**: does nothing when BioSphere is closed, which is the main gap; needs a
streaming proxy through Next.

### Option 2: Firebase Cloud Messaging SDK
**Pros**: familiar tooling.
**Cons**: a Google project and SDK on both sides; ties delivery to one vendor;
Web Push already works in every target browser without it.

### Option 3: Standard Web Push with data-free messages (chosen)
**Pros**: works with the tab closed; no third-party SDK or new npm dependency
(VAPID signing uses `node:crypto`); nothing about a visitor ever goes through a
push service; the device reads the real feed, so read/dismiss and privacy rules
stay in one place.
**Cons**: one new table; the service worker must fetch the feed before showing
the alert; iOS needs the PWA installed to the home screen (iOS 16.4+).

## Decision

**Chosen option**: Option 3. Defaults pending team confirmation: push only for
`NEW_INQUIRY`, `NEW_VISIT_REQUEST` and `VISITOR_REPLY`; any active Curator may
opt in per device (not limited to `CURATOR_ALERT_EMAILS`).

## Feature design

**Data model** (`20261116020000_add_push_subscription`):
`push_subscription(id uuid pk, user_account_id uuid fk -> user_account on delete
cascade, endpoint varchar(1000) unique, created_at, last_success_at,
failure_count)`. No encryption keys are stored because no payload is sent.
RLS enabled and forced; PUBLIC, anon and authenticated have no access; only the
backend role is granted access, matching `user_notification_state`.

**API surface** (all `@Roles('CURATOR')`):
- `GET /push/config` -> `{ enabled, publicKey }`.
- `POST /push/subscriptions` `{ endpoint }` -> registers this device for the
  caller. Re-registering an endpoint moves it to the caller (one browser, one
  signed-in curator). At most 10 devices per account; the oldest is dropped.
- `DELETE /push/subscriptions` `{ endpoint }` -> removes it if it is the caller's.

**Delivery**: `POST <endpoint>` with an empty body, `TTL: 3600`,
`Urgency: high` and `Authorization: vapid t=<ES256 JWT>, k=<public key>`.
Sends run in parallel with a 10 second timeout and are logged, never thrown.

**Triggers**: after `announce()` saves a submission; after a visitor reply's
import transaction commits.

**Security model**: the recipient account always comes from the session. VAPID
private key lives only in server env. Endpoint allowlist prevents the server
from being used to call arbitrary URLs.

**Configuration**: `PUSH_NOTIFICATIONS_ENABLED`, `VAPID_PUBLIC_KEY`,
`VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (a `mailto:` or https contact). Generate
keys with `npm run push:vapid-keys`.

**Critical test scenarios**: JWT verifies with the public key; endpoint
allowlist; registration ownership; flag off; 404/410 cleanup; a push failure
does not fail `announce()` or the import.

## Migration plan

**Strategy**: feature flagged, off by default.
**Phases**: review and merge with the flag off; apply the migration through the
approved process; set VAPID keys and the flag; rebuild the frontend.
**Rollback**: unset `PUSH_NOTIFICATIONS_ENABLED`. Stored devices can stay.
**Risks**: browsers expire subscriptions silently (handled by 404/410 cleanup
and re-registration on page load); Apple requires the installed PWA.

## Consequences

**Positive**: curators hear about new work with BioSphere closed; no visitor data
goes through push services.
**Negative**: one more table and three env vars to manage; a delivered system
notification stays on a device after another curator handles the record.
