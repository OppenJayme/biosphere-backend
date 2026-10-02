# BioSphere Audit Log Guide

This module implements the protected audit-review portion of SRS Section 4.15
using the existing `public.audit_log` and `public.user_account` tables. It does
not change the database schema and does not implement backup or restoration.

## Access and immutability

- Both endpoints require an authenticated, active `CURATOR` account. This
  follows the curator Audit Logs interface described in the SRS and keeps audit
  information out of public and routine Developer interfaces.
- The module exposes only `GET` operations. It provides no create, update, or
  delete route for audit records (REQ-4.15-03).
- Audit records are ordered newest-first with the UUID as a stable tie-breaker.
- Reading audit history does not create another audit record, avoiding noisy
  recursive read events.

## Endpoints and filters

- `GET /audit-logs`
- `GET /audit-logs/:id`

The list endpoint supports `search`, `result`, `module`, `action`, `actorId`,
`affectedRecordType`, `affectedRecordId`, `from`, `to`, `page`, and `limit`.
String filters are case-insensitive. `from` and `to` are inclusive ISO 8601
timestamp bounds and must include `Z` or an explicit UTC offset. `search`
covers actions, modules, affected-record types, actor names, and exact UUID
identifiers. Page size is capped at 100.

Responses use camelCase and expose only fields backed by the approved schema:
the acting account summary when known, action, affected record/type, module,
structured metadata, result, and timestamp. The frontend's current dummy IP
address, device, category, and timeline fields are not returned because the
database does not record them. The API must not fabricate audit evidence.

## Security events (REQ-4.1-15, SRS 4.2.2 and 4.15.2)

Authentication attempts and denied access are recorded centrally by
`SecurityAuditService` (`src/auth/security-audit.service.ts`), called from the
login flow and the global guards, not from individual controllers. Entries use
`module = 'auth'` and `affected_record_type = 'user_account'`, with the
BioSphere account as both actor and affected record when it is known.

| Event | `action` | `result` | `details` |
| --- | --- | --- | --- |
| Successful sign-in | `LOGIN` | `SUCCESS` | `email`, `role` |
| Wrong email or password | `LOGIN` | `FAILED` | `email`, `reason: INVALID_CREDENTIALS`, `providerCode` |
| Valid credentials but no BioSphere account | `LOGIN` | `DENIED` | `email`, `reason: NO_ACCOUNT` |
| Valid credentials but inactive account | `LOGIN` | `DENIED` | `email`, `reason: INACTIVE_ACCOUNT` |
| Inactive or unlinked account using a still-valid token | `ACCESS_DENIED` | `DENIED` | `reason`, `method`, `path` |
| Signed-in role not allowed on the route, e.g. a Developer opening a curator route | `ACCESS_DENIED` | `DENIED` | `reason: ROLE_NOT_PERMITTED`, `role`, `requiredRoles`, `method`, `path` |

- Passwords, access and refresh tokens, and other secrets are never recorded.
  The attempted email is recorded, trimmed and lowercased, so failed sign-ins
  can be reviewed. `path` excludes the query string, which may carry personal
  data.
- A `FAILED` login has no actor (`user_id = null`) because the
  credentials did not identify an account.
- Requests with a missing, malformed, invalid, or expired token are **not**
  recorded: they cannot be attributed to an account and would flood the log.
  The login rate limit already bounds repeated sign-in attempts.
- Writing a security event never blocks or changes the response. If the audit
  write fails, the error is logged and the sign-in or denial proceeds as it
  would have.
- Filter these entries with `GET /audit-logs?module=auth`, optionally with
  `action=LOGIN` or `result=DENIED`.

## Deliberately separate work

- Audit export belongs to the Reports/Export slice so its CSV, DOCX, PDF, and
  printable behavior remains consistent with SRS Section 4.7.
- Logout, token refresh, and password changes are not audited yet because
  those endpoints do not exist (see REQ-4.1-05 and REQ-4.1-16). They should
  record through `SecurityAuditService` when they are added.
- Backup history is available separately through the protected, read-only
  `/backups/history` API documented in `BACKUP_HISTORY_GUIDE.md`.
- Backup creation, scheduling, failure notification, encrypted storage,
  restoration, and verification are not application CRUD. REQ-4.15-05 through
  REQ-4.15-12 require an approved deployment procedure. The final schedule,
  retention, recovery point, destination, and operator still require
  USC/DCISM approval.
- The database migration enables RLS. Production policies and database-role
  privileges must also preserve append-only access; this read API alone does
  not replace deployment-level hardening.
