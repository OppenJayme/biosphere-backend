# BioSphere Backup History Guide

This module implements the protected, read-only backup-history portion of SRS
Section 4.15 using the existing `public.backup_history` table. It reports what a
deployment-controlled backup process recorded; it does not create, download,
delete, schedule, verify, or restore backups.

## Access and information boundary

- Both endpoints require an authenticated, active `CURATOR` account.
- The module exposes only `GET` operations. No API client can insert or rewrite
  backup evidence through this module.
- Internal `storage_path` values are never returned. The response exposes only
  `artifactAvailable`, which indicates whether the job recorded an artifact.
- `creator` may be `null` because scheduled infrastructure jobs need not run as
  a BioSphere user.
- Results are ordered newest-first with the UUID as a stable tie-breaker.

## Endpoints and filters

- `GET /backups/history`
- `GET /backups/history/:id`

The list endpoint supports `search`, `status`, `backupType`, `creatorId`, `from`,
`to`, `page`, and `limit`. Search covers backup type, creator name, and exact UUID
identifiers. `from` and `to` are inclusive `startedAt` bounds and must contain
`Z` or an explicit UTC offset. Page size is capped at 100.

The default list and its counts exclude the reserved, case-insensitive
`SYNTHETIC_` namespace, including when a COMPLETED filter or text search is
applied. Rehearsal captures/restores/verifications remain diagnostic records in
the existing table: select their exact `backupType` (for example,
`SYNTHETIC_RESTORE`) to list them explicitly, or follow a protected detail/audit
link. Their type is retained unchanged rather than presented as an ordinary
backup capture. No new frontend field or shared database migration is required.
Synthetic failures and completions are also excluded from both real backup-alert
queries, so rehearsals neither create nor clear the Curator's operational alerts.

## Internal synthetic recorder - November 6, 2026

`RecoveryHistoryService` is an internal provider exported by `BackupModule`.
It adds no HTTP mutation route and is disabled unless
`RECOVERY_HISTORY_RECORDING_ENABLED=true` and a non-personal technical operator
slug is configured in `RECOVERY_HISTORY_OPERATOR_ID`. Leave both settings at
their template defaults outside the explicitly owned rehearsal environment.
No existing runner calls it yet; this is the recording contract for the next
adapter, not automatic persistence of the CLI's local ledger.

The trusted caller supplies exactly five fields to `start` and repeats the same
command for `finish`: lowercase UUIDv4 `attemptId` and `snapshotId`, `operation`
(`capture`, `restore`, `verify`), and lowercase SHA-256 hex
`configurationFingerprint` and `workspaceFingerprint`. The caller must generate
and retain these before execution. They identify the selected non-secret
configuration and owned source/target workspace; they are not hashes of
credentials and do not independently prove source ownership or snapshot integrity.
A configuration fingerprint is available before capture; a captured manifest
does not have to exist before the start can be recorded.

Each transition atomically writes history and an audit entry, using a
transaction-scoped PostgreSQL advisory lock per attempt and READ COMMITTED
isolation. Identical overlapping retries reuse the existing row/result with no
extra success audit. Pool acquisition has a 10-second budget and each interactive
transaction has a 30-second budget, including advisory-lock waits. Six-second
holders are covered for start and finish; longer contention can still fail and
requires an explicit same-ID retry, not an unbounded wait. A changed command, configured operator or terminal result
returns a conflict. A finish without a matching start is rejected. If the audit
write fails, the history insertion/update rolls back and an explicit same-ID
retry remains possible. A confirmed start may remain IN_PROGRESS after a crash;
this service does not implement a watchdog or infer success from missing events.

| Operation | Accepted successful outcome | History type |
| --- | --- | --- |
| capture | CAPTURED | SYNTHETIC_CAPTURE |
| restore | RESTORED_VERIFIED | SYNTHETIC_RESTORE |
| verify | VERIFIED | SYNTHETIC_VERIFY |

Successful terminal outcomes map to COMPLETED; FAILED plus a bounded uppercase
machine code maps to FAILED. The audit retains the precise outcome and synthetic
scope. CAPTURED does not mean a restore was verified. Start-audit SUCCESS means
the start was recorded, not that recovery succeeded. Actors/creators are null;
audit details identify the configured service operator rather than impersonating
a Curator. No path, URL, key, raw error or backup bytes are accepted. Artifact
availability remains false because no downloadable artifact is registered.

The service trusts internal runner outcomes; it is not a recovery executor or an
independent proof verifier. The CLI adapter, separate control-plane connection,
independent result ledger reconciliation, full Supabase/Auth rehearsal, alerts,
scheduling, custody approval and hosted activation remain pending. Recording
must not alter a restored target before its inventory verification. No schema
migration or shared database change is part of this slice. BAK-002 stays Deferred.

Run the approved, isolated recording/read boundary checks on Windows Docker:

```powershell
npm run test:recovery-history:db
```

The `recovery-history` profile accepts no supplied database URL and owns a fresh
loopback PostgreSQL fixture. It uses the real history SQL plus minimal synthetic
account/audit tables, grants its synthetic service role INSERT/UPDATE on history,
and verifies through the internal service and protected Curator HTTP reads.
The original 21 cases cover start/finish, replay/conflict, simultaneous requests, runtime
validation, default-off configuration, caller-object changes while pending,
audit-failure rollback, unrelated-history protection and 401/403 read denial.
The #249 review follow-up expands this to 25 cases with default-list separation,
real notification-feed reads and six-second start/finish audit-trigger delays.
It reproduced the old alert leak and five-second P2028 failures before repair.
The feed case checks all three rehearsal operations, real-failure persistence,
case-insensitive reserved types and a literal-prefix control (`SYNTHETICX_FULL`)
whose operational failure remains visible and clears only after its own success.
Existing populated-history reads separately pass 16 cases. These checks do not
establish hosted RLS, deployed authentication or production recovery readiness.

## Deliberately deferred operations

The [proposed backup/recovery procedure](./BACKUP_RECOVERY_PROCEDURE.md),
[approval record](./BACKUP_RECOVERY_APPROVAL.md) and
[rehearsal template](./BACKUP_RECOVERY_REHEARSAL_TEMPLATE.md) now make the
deployment work concrete, with a [one-page Curator checklist](./BACKUP_RECOVERY_CURATOR_CHECKLIST.md).
Revised November 5 for $0 recurring spend, automated routine operation, Supabase
Free and qualified technical help on demand, they do not assume an always-on
backup server or permanent administrator. No provider/destination ownership,
capacity or recovery objective is approved or measured here. They do not implement a runner or authorize shared exports,
restores, scheduling or retention deletion. BAK-002 remains Deferred until its
execution gates are satisfied; backup-history metadata is not restore evidence.

Backup scheduling, retention, encryption, storage destination, failure alerts,
restore execution, and restore verification remain deployment-level decisions.
They must not be added as ordinary application CRUD or inferred from this read
API. Their implementation requires the approved USC/DCISM deployment procedure
identified in `AUDIT_LOG_GUIDE.md`.

## Populated disposable PostgreSQL checkpoint - 2026-10-27

The user approved real Backup History HTTP reads with synthetic metadata and
authentication in an owned Docker database. This supplies populated database
evidence missing from the earlier empty browser run and mocked database tests.
No production service, database schema file or API contract was changed.

Run explicitly on Windows with the local Docker Desktop Linux engine and the
helper's pinned PostgreSQL image already cached:

```powershell
npm run test:backup-history:db
```

This opt-in suite is outside ordinary CI discovery; CI does not implicitly
require Docker Desktop. The existing helper's separate `backup-history` profile
requires its own opt-in flag, creates its own random container identity and
generated credentials, and uses `biosphere_backup_history_disposable`. It retains
loopback-only random ports, 384 MB/one CPU limits, tmpfs/no host or persistent
mounts, `--pull=never`, allowlisted Docker subprocess settings and exact-owner
cleanup. No existing connection URL is accepted; no AppModule/application `.env`
is loaded. Existing Supabase containers and ports 3000/3001/3002 are untouched.

Schema setup applies the actual `database/sql/015_backup_history.sql`, including
nullable creator support, plus minimal synthetic account/audit dependencies.
Only four synthetic history rows are seeded. Their COMPLETED/FAILED/IN_PROGRESS
statuses are test metadata, not evidence that any backup job ran. Stored paths
are invented strings; no dump, object, bucket or backup artifact is created/read.
The application role has SELECT only on history and uses the real Prisma adapter;
real Nest guards/controllers/services/validation execute, with only the external
identity-provider response synthetic. This is not the full historical schema,
hosted Supabase configuration or a production RLS certification.

### Results and limits

The original populated-history slice passed **14/14** disposable PostgreSQL/HTTP
cases. The later audit-timing follow-up below expands the suite to 16 cases.

| Check | Result |
| --- | --- |
| Populated list | Four stored rows, newest-first with deterministic UUID tie-breaking; exact public fields and no private storage paths. |
| Filters/search | Status, case-insensitive type, creator, creator-name search and exact UUID search select the literal expected identities/counts. |
| Combined predicates | Type/status/creator/search/date bounds all apply together rather than acting as alternatives. |
| Date bounds | Inclusive started-at boundaries agree across Z and +08:00; just-outside bounds exclude rows. |
| Pagination | Two non-overlapping pages split tied timestamps correctly; beyond-last page is empty with total retained. |
| Detail | All three statuses, nullable creator/completion time and recorded-artifact booleans return without storage-path fields. `artifactAvailable` does not verify that an artifact exists or is restorable. |
| Access | Signed-out/Developer list and detail requests return 401/403 without history data; both Developer denials are persisted and readable through the real curator audit API. |
| Missing/mutation routes | Unknown identity returns 404; POST/PATCH/DELETE remain absent, with unchanged history readback. |

The first tracer was red because its fixture module did not yet exist; fixture
implementation made it pass. A filter-table typing issue and unsafe-any lint
warning were corrected during development. These are harness development issues,
not application defects or defect closures. No new production defect was found.
The VM-module experimental warning is expected for the installed Prisma runtime.

Supporting checks: existing Backup History HTTP **5/5** and collection disposable
compatibility **16/16** pass; the latter retains its documented intentional
audit-permission failure injection. TypeScript no-emit passes and touched test
files lint clean. Full backend lint has zero errors and seven pre-existing
unused-disable warnings. Diff checks pass. Post-run Docker enumeration found no
retained owned backup-history or collection containers: their synthetic data was
removed by normal teardown; unrelated containers and the image cache remain.

BAK-001 stays **In progress**: actual populated browser/provider history and
independent teammate acceptance are not established by this HTTP fixture.
BAK-002 real backup/restore stays **Deferred** under its existing procedure,
storage/retention and disposable-restore approval gates. No job, scheduler,
real backup, restore or shared history mutation was authorized or performed.
The original slice used the isolation helper introduced by PR #193; both #193
and #194 are now merged. Do not repeat these tests for documentation-
only changes or present a synthetic COMPLETED row as a successful real backup.

### Denial-audit timing repair - 2026-10-27

Reviewer feedback on #194 led to [DEF-025](./TEST_DEFECT_LOG.md#def-025---denial-audit-tests-assume-immediate-background-persistence):
an immediate audit read can precede the guard's asynchronous insert. A real
300-ms PostgreSQL insert delay reproduced the failure before repair. The
test-only `expectAuditReadback` helper now polls the authorized audit GET within
a 2-second budget, preserving counts/actors/paths. It never retries the denied
operation, ignores missing events or accepts a 403 read as delayed persistence.
The helper's deadline is a test allowance, not a product performance promise.

Backup database checks now pass **16/16**: delayed-denial tests plus negative
controls for an absent event and forbidden readback. Collection database checks
pass **16/16** with the same real delay; existing HTTP regressions pass **13/13**.
No production Auth/Backup/Collection code, guards, logging policy or shared
database changed. BAK-001 remains In progress and real backup/restore Deferred.

### Independent disposable checkpoint - 2026-10-28

Voltaire's [report](https://github.com/OppenJayme/biosphere-backend/pull/206#issuecomment-6462407880) records 16/16 Backup History database/HTTP checks,
exit 0, on clean backend `e6ae2a516ade4c33000344b18ca2016b8f8067b4`.
Owned-container cleanup passed; no unexpected errors were reported. See the
[current handoff](./COMPLETION_HANDOFF.md#current-independent-review-checkpoint---2026-10-28)
for environment and exact pinned image. The requested independent batch is
complete. BAK-001 remains In progress for populated real-browser/provider
acceptance; BAK-002 real backup/restore stays Deferred. Synthetic history does
not establish real backup creation, artifact access or restoration.
