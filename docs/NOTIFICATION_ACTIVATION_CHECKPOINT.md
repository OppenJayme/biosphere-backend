# Notification activation checkpoint - 2026-10-28

## Current development deployment

The user explicitly authorized applying the exact notification migration,
verifying its protections, enabling the feature and refreshing the local apps.
Backend [#208](https://github.com/OppenJayme/biosphere-backend/pull/208), frontend
[#91](https://github.com/OppenJayme/biosphere-frontend/pull/91) and acceptance docs
[#209](https://github.com/OppenJayme/biosphere-backend/pull/209) are merged.
Notification PR CI passed, including the backend documentation-conflict repair.

Deployed source:

- Backend develop `edaf18cc21c1e999ea911cf5da764e36e865ea42`.
- Frontend develop `f3f38b281d3b475ccef3ef3c996e044706039de3`.
- Exact migration `20261028000000_add_user_notification_state`.
- SQL SHA-256 `4f76b4c28dc971f1c7882fc7285c0298011b16899c48f5b16939bcd6e8ea615e`.

## Database application and verification

Preflight compared runtime/direct database metadata identities, confirmed no
unfinished migrations and found the table/history entry absent with the flag off.
Only the reviewed transactional SQL was executed using the configured direct
connection. Prisma `migrate resolve --applied` then recorded that exact migration;
its finished, non-rolled-back entry and checksum were verified. No bulk pending
migration deployment or schema push was used.

The configured runtime connection verified:

| Protection | Result |
| --- | --- |
| Composite primary key and account foreign key | Present |
| Event-key and timestamp checks | Both present |
| RLS enabled and forced | Yes |
| PUBLIC, anon and authenticated table access | Denied |
| Client RLS policies | None |
| Actual private runtime role | Required privileges and RLS bypass verified |
| Exact Prisma migration history/checksum | Verified |

These are catalog/privilege checks, not an executed impersonation test of every
client role or a live two-curator API isolation test. Backend identity/ownership
checks remain necessary with the privileged runtime connection. No credentials,
connection strings, visitor content or authenticated request dumps were published.

## Local app refresh and live smoke check

Previous clean source revisions and generated builds were preserved locally
before switching the app checkouts to the merged revisions. Prisma generation,
Nest build and the actual-config frontend production webpack build passed.
The backend was first started with the flag off. An old orphaned backend child
still held port 3001; the first new start failed with EADDRINUSE. Its exact app
command was identified, that child alone was replaced, and the merged Swagger
PATCH route was then confirmed. No unrelated process was terminated.

After database verification, only `NOTIFICATION_STATE_ENABLED` was set to true
in the ignored local backend configuration. The rebuilt backend was restarted
with the flag true. The frontend runs on its existing loopback port 3000; backend
uses its existing port 3001. No public exposure or new tunnel was configured.

Live checks passed:

- Backend health and Swagger return 200; notification-state PATCH is present.
- Anonymous backend state mutation returns 401; anonymous frontend feed returns
  401; frontend login returns 200.
- The user manually signed a fresh Edge session in as Curator. Its real feed
  returns 200 with `stateManagementEnabled: true`, a numeric unread count and
  valid items. The real bell shows Mark as read and Dismiss controls plus the
  account-only/pending-work-unchanged notice.
- Database protections and migration history were reverified after activation.

No notification state or operational submission was changed by these smoke
checks. A read-only lookup found no existing Pending inquiry with both a TEST
name and reserved example-domain email; no real alert was selected for mutation.
No test inquiry, account or email was created. Browser windows remain open.
Recovery builds, startup logs and helpers remain private/ignored locally.

## Remaining acceptance and recovery

Activation and authenticated feed/control rendering are verified for this local
development deployment. The prior owned 8/8 SQL/API tests and seven synthetic
bell scenarios remain valid; they were not rerun merely to document deployment.
A live agreed test-alert/two-curator read/dismiss, reload and unchanged-source
check remains pending, as do independent notification acceptance, provider/proxy
behavior, full accessibility, dependency-advisory review and broader event types.
DASH-007 stays In progress; this does not establish production readiness or reopen
Voltaire's completed earlier three-suite batch.

If a problem occurs, disable the backend flag and restart that app to recover
legacy feed behavior. Keep the table/state and source records. Previous source
and builds were preserved for recovery; do not drop the table or blindly apply
other pending migrations. See the [implementation guide](./NOTIFICATION_STATE_GUIDE.md).
