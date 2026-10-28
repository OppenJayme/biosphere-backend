# Per-curator notification state

Implemented for REQ-4.3-07 under the user's 2026-10-28 authorization to help the
notification module. Coordinate review with John/Charles and authorization
contracts with Voltaire. The earlier implementation hold is superseded for this
bounded slice; shared migration/deployment is still **not performed**.

## Behavior and API

Backend `NOTIFICATION_STATE_ENABLED` defaults off. With the flag absent/false,
GET retains its legacy feed, keys and ordering without reading the new table.
PATCH returns 503. Older frontend/backend combinations remain usable; the new
frontend hides state controls unless the API advertises the feature.

When enabled:

- `GET /notifications?limit=20` requires an active Curator. It adds
  `stateManagementEnabled: true`, `unreadTotal` and per-item `readAt`.
- `total` counts non-dismissed alerts before the limit. `unreadTotal` counts
  unread, non-dismissed alerts before the limit. These are separate from
  `pendingInquiries`, `pendingVisitRequests` and `emailFailures`, which still
  describe unresolved source work. Reading/dismissing does not resolve it.
- `PATCH /notifications/state` accepts exactly
  `{notificationId, state: "READ" | "DISMISSED"}`, returning `{updated: true}`.
  The recipient comes from authenticated account identity, never request data.
  Only keys in the current active feed are accepted; unavailable ones return
  404. Invalid keys/actions or extra recipient fields return 400.
- State belongs to one curator. Dismiss hides that alert for that curator only.
  Read leaves it visible with a Read label. Repeating either action preserves
  the first timestamps and cannot undo a dismissal. There is no bulk action,
  unread/restore action or automatic mark-read merely from following a link.
- Inquiry and visit keys retain their type/record UUID. Enabled email-failure
  keys use `SUBMISSION_EMAIL_FAILED:<audit-row-UUID>`, so two failures for one
  record/action are distinct events. Dismissing an old failure cannot hide a
  new one. Turning the flag off restores legacy failure keys/visibility.
- No inquiry, visit, timeline, original audit event, account role or email is
  changed by these actions. The state table stores account/event identifiers
  and timestamps, not visitor names, addresses or messages.

The Next route keeps tokens server-side, rejects cross-site/mismatched-origin
JSON mutations and injected recipient data, bounds payload size, validates the
backend acknowledgement and returns uncached, sanitized errors. The bell waits
for authoritative refreshed counts instead of applying optimistic changes.
Failures retain the feed and expose explicit refresh/retry controls with no
automatic replay. Pending actions disable other state buttons; older polling
responses are discarded after a newer action.

## Migration and rollout

Prepared migration:
`prisma/migrations/20261028000000_add_user_notification_state/migration.sql`.
Prisma client generation/build needs the updated schema; generate does not apply
the migration. Shared schema/environment has not been changed.

The migration is transactional. The table has an account/event composite primary key, account foreign key,
bounded event keys and timestamp constraints. Read/dismiss uses one atomic
upsert with database timestamps. Forced RLS and revoked public/anon/authenticated
access deny direct client reads/writes; only the private backend database role
is granted the required access. No client RLS policies are created. Server-side
account ownership checks remain required even with a privileged runtime role.

Deployment owner sequence:

1. Review/merge the paired code with the flag **off**; review this migration
   through the normal approved process. Do not blindly apply all pending
   migrations or point test commands at a shared connection.
2. Apply only through the separately authorized deployment process, then verify
   constraints, RLS and the actual private runtime role's access on the intended
   target. The disposable role/fixture does not certify deployment credentials.
3. Enable the backend flag only after those checks and an agreed two-curator
   acceptance check. Refresh/rebuild deployed code as required by that environment.
   Reverse-proxy origin/host behavior needs validation on its actual target.
4. Roll back feature behavior by setting the flag off; do not drop stored state
   or source records. Legacy feed visibility returns, while state is retained.

There is no automatic state retention/deletion job in this slice. Event history
can accumulate; deployment retention and production-scale query profiling remain
separate decisions. The source feed still derives from pending records rather
than becoming a durable general-purpose notification event store.

## Verification - 2026-10-28

Agreed seams: real Nest API/guards/services with PostgreSQL in a fresh owned
Windows Docker fixture, and the real bell with synthetic HTTP in a fresh Edge
session. External authentication is synthetic; no live museum records, email,
credentials, existing browser sessions or shared migration are involved.

- `npm run test:notifications:db`: **8/8**. Read persistence, recipient isolation,
  first/repeated dismissal and source preservation; later failure identity and
  uncapped counts; invalid/injected/unknown updates; signed-out/Developer/inactive
  denial; disabled behavior with the table temporarily renamed; real failed SQL
  write and successful retry; actual primary-key/check/RLS enforcement.
- Frontend `npm run test:notifications:browser`: **7 scenarios**. Read/dismiss
  and unchanged pending-work counts; server failure, transport loss and malformed
  acknowledgement with retained controls/explicit retry; pending double-click
  protection; delayed old response discarded; legacy/disabled controls hidden.
- Frontend route Request/Response tests: **7/7**, included in the full
  **426/426** suite (71 files); real API client/schema, synthetic session/config
  and remote HTTP. Includes rejected cross-site/recipient injection, safe
  401/403/404/503 feedback and malformed-success rejection.
- Backend unit **701/701** (53 suites); ordinary HTTP **381 passed**, **17 live
  Developer tests skipped** (28 passed suites, one skipped). Skips are not passes.
- Backend build, Prisma validation, no-emit and lint pass: zero lint errors and
  six existing unused-disable warnings. Frontend no-emit, full lint and isolated
  production webpack build pass, using synthetic build configuration only.

Red-first evidence: the first HTTP assertion lacked unread/state fields and the
first bell check lacked controls. A new direct-dismiss check caught a timestamp
constraint violation (23514); using database time corrected it. Legacy unit
coverage caught changed tie ordering while disabled; legacy ordering was
restored. These development failures were corrected before accepting results.
The intentional 42501 SQL-permission fault remains logged rather than suppressed.
The full HTTP suite still emits previously recorded missing-audit-adapter errors
under OBS-003; it does not prove denial persistence for those older fixtures.
The new SQL fixture has a real audit adapter.

Work was isolated in separate checkouts using installed dependencies; no original
server was manually stopped/restarted and no existing browser window was operated
on. Generated clients/builds and browser artifacts stay ignored. Owned containers
were absent after cleanup. Original frontend listener remained PID 16340;
backend listener observed PID 20856, so uninterrupted backend process continuity
is not claimed. No process-crash cleanup or real provider/session proof follows.

This is a reviewed implementation candidate with owner verification, not
deployment or independent acceptance. Broader sync/backup/specimen/storage/QR/AR
event integration under REQ-4.3-05/10 is still separate, as are OBS-002 polling
diagnostics, approved public content and the unreproduced public-form OBS-004.
