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

- Audit export is the `AUDIT_LOG` report type in the Reports module
  (`POST /reports`), so its CSV, DOCX, and PDF output, row limit, and
  auditing match the other reports. See `REPORTS_GUIDE.md`.
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

## AUD-002 approved lifecycle traceability batch - 2026-10-23

After explicit approval, used the existing signed-in Edge session and real
curator UI on port 3000 with the prepared TEST specimen
`85f158c6-a73b-41ae-aa5c-9cac347d79de` (`TEST - INV Acceptance Beetle`,
accession `TEST-READY-20261023-A`). Its initial checklist was 8/8, status
Uncataloged and public eligibility off. No pending offline draft was eligible
to synchronize before the run, and the date/record-filtered audit baseline
contained none of these lifecycle actions for this fixture that day.

Exactly five approved form submissions were made, with state readback and
reload after each:

| Operation | Resulting status | Public eligibility | Successful audit action |
| --- | --- | --- | --- |
| Complete Cataloging | `CATALOGED` | Off | `COMPLETE_SPECIMEN_CATALOGING` |
| Enable eligibility | `CATALOGED` | On | `SET_SPECIMEN_PUBLIC_DISPLAY` |
| Disable eligibility | `CATALOGED` | Off | `SET_SPECIMEN_PUBLIC_DISPLAY` |
| Reopen with test reason | `UNCATALOGED` | Off | `REOPEN_SPECIMEN_CATALOGING` |
| Complete again | `CATALOGED` | Off | `COMPLETE_SPECIMEN_CATALOGING` |

- History contained exactly five new revisions relative to the pre-run snapshot:
  two Uncataloged-to-Cataloged, one Cataloged-to-Uncataloged, and the two
  false/true public-eligibility transitions.
- Exactly five successful lifecycle audits identified this specimen. Selected
  details matched module `specimens`, record type `specimen` and role `CURATOR`.
  Displayed actors matched across the revisions and audits. Audit metadata
  recorded the expected prior status or eligibility boolean.
- The reopening revision and audit both retained the exact reason:
  `TEST acceptance 20261023 - verify reopening audit and re-completion; no specimen fields changed.`
- A read-only follow-up matched all five audit timestamps to their corresponding
  revision transitions at displayed-minute precision. Raw audit timestamp and
  actor-UUID equality were not independently checked. Reload preserved the
  audit evidence; reads did not add duplicate lifecycle events.
- Non-lifecycle displayed core/taxonomy/provenance fields, collection and the
  entire lot display stayed unchanged across each transition: two active lots,
  total quantity 12. No Inventory, archive/restore or exhibit-publishing action
  was invoked. Public eligibility is not exhibit publication.

**Retained final state:** Cataloged, public eligibility off. The intended status,
eligibility and normal history/audit effects are not reverted. No unexpected
non-read request was forwarded or blocked, and the probe observed no page errors.
Temporary tabs were closed; the original signed-in Audit tab remained unchanged.
The write helper is disabled against accidental repetition; no credentials or
browser auth state were exported.

This closes the previously missing completion/reopening/public-eligibility
traceability subcases, not all acceptance. AUD-002 remains In progress for
OBS-001 disposition and independent sign-off; real concurrency, failed-write
rollback, actual mutation retries, role-denial behavior and complete restoration
are not proved here. OBS-001 is not closed by successful history navigation.
No application code changed; actual served build hashes were not independently
verified and no server was restarted. `git diff --check` passed; full
lint/unit/build suites were not rerun for this browser-evidence update.

## AUD-001 live Developer access checkpoint - 2026-10-24

The user manually signed into an existing Developer test account in the
separate headed session `biosphere-role-check-20261024`. A preflight verified
the restricted workspace and displayed Developer role before any denial checks.
An earlier login had been Curator, so that attempt stopped without running the
tests; no account role or account record was changed.

Read-only checks in a temporary tab passed:

- Direct Audit and known TEST specimen media-page navigation redirected to
  `/developer`. The final page showed no Audit/media workspace, retained test
  caption or private signed image; no signed-image request was observed.
- Same-origin `GET /api/offline/specimens` returned **403**, `Cache-Control:
  no-store`, and a message-only JSON body, not specimen records. This handler
  forwards the session to the backend specimen-list API; it is separate from
  an independently issued Audit or signed-media API request.
- No browser mutation request or probe page error occurred. The Developer
  landing tab was preserved; temporary tabs were closed. Credentials, browser
  auth state and account names were not exported.

**Remaining:** Security-audit persistence/correlation is not verified by this
checkpoint. The original curator tab still showed Audit, but a fresh read in
that context redirected to `/login`. The baseline audit helper consequently
timed out waiting for filters; a bounded login-state check identified the
missing authenticated curator view. No expiry/sign-out root cause is assumed,
no failed-audit defect is inferred, and no mutation was retried. Curator manual
reauthentication is needed before reviewing the `ACCESS_DENIED` entries.

These results establish live page-level Developer exclusion plus the specimen
refresh API's 403, not direct Audit API or signed-URL API denial, inactive-account
behavior, actual session-expiry policy or comprehensive authorization/security.
Normal login/denial events may be appended by the security-audit mechanism;
no museum data or account configuration was edited. AUD-001 remains In progress.
No runtime code or servers changed; `git diff --check` passed. Full app suites
were not rerun for these live checks against the existing served build.

### Curator denial-audit follow-up - 2026-10-24

After the user confirmed login, a fresh protected read identified the original
`biosphere-aud002` context as authenticated; the newly opened follow-up context
still redirected to login. Used only the authenticated original context. The
separate Developer window and both existing Curator tabs were left open.

Two independent GET/HEAD-only probe tabs queried `module=auth`,
`action=ACCESS_DENIED`, `result=DENIED` and the museum date 2026-10-24.
Both reads found the same six matching Developer GET-denial entries on the
first filtered page:

- Three for `/audit-logs`.
- One for `/specimens`.
- One each for the known TEST specimen detail and media paths.

Every matching entry had `ROLE_NOT_PERMITTED`, required role `CURATOR`, a
displayed actor, `user_account` attribution and a displayed timestamp. The
counts remained unchanged on the repeated query. Both probes recorded zero
non-read requests and closed only their temporary tabs. No account names,
credentials, headers or raw audit payloads were exported.

This verifies persisted denial evidence consistent with the earlier Developer
checks, including the specimen-list API denial. It does not establish exact
caller UUID, timestamp or request-ID correlation for each earlier browser
request; page navigation can trigger backend reads, so these entries are not
proof of independently issued direct Audit/media API tests. The previous
reauthentication prerequisite is satisfied for this review, but AUD-001 stays
In progress for remaining access/failure/boundary cases and independent sign-off.
No new defect was reproduced. Documentation-only verification:
`git diff --check`; application tests/build were not rerun.
