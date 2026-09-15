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

## Deliberately separate work

- Audit export belongs to the Reports/Export slice so its CSV, DOCX, PDF, and
  printable behavior remains consistent with SRS Section 4.7.
- Authentication denials and other cross-cutting security events require a
  centralized logging design rather than controller-specific duplication.
- Backup creation, scheduling, failure notification, encrypted storage,
  restoration, and verification are not application CRUD. REQ-4.15-05 through
  REQ-4.15-12 require an approved deployment procedure. The final schedule,
  retention, recovery point, destination, and operator still require
  USC/DCISM approval.
- The database migration enables RLS. Production policies and database-role
  privileges must also preserve append-only access; this read API alone does
  not replace deployment-level hardening.
