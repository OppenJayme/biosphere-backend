# BioSphere Backup History Guide

This module implements backup history plus scheduled and manual backup
execution for SRS Section 4.15 using the existing `public.backup_history`
table. It does not download, verify, or restore backups.

## Access and information boundary

- All backup endpoints require an authenticated, active `CURATOR` account.
- History is read-only through the API. Only `POST /backups/run` creates a
  row, and no endpoint rewrites or deletes backup evidence.
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

## Backup execution (proposal §8)

Per the client proposals of 2026-10-22, applied for the presentation and pending museum confirmation, the backend now runs backups itself:

- `POST /backups/run` (Curator, "Back up now") and the scheduler both call
  `BackupRunnerService.run`. It records an `IN_PROGRESS` history row, reads
  every `public` application table in one `REPEATABLE READ` transaction,
  stores the gzipped JSON snapshot (`biosphere-logical-backup/v1`) in the
  private Supabase Storage bucket `BACKUP_BUCKET` (default `system-backups`,
  created private on first use), then marks the row `COMPLETED` or `FAILED`
  and writes a `RUN_BACKUP` audit event. Only one run at a time (`409`).
  Supabase Auth (`auth` schema) and uploaded media files are not in the
  snapshot; Supabase's own backups cover them.
- Schedule: every four hours plus 5 p.m. Asia/Manila (00, 04, 08, 12, 16, 17,
  20). `BackupSchedulerService` runs only when `BACKUP_SCHEDULE_ENABLED=true`;
  enable it on exactly one instance.
- Retention after each run: every point for 48 hours, the newest point per day
  for 14 days, the newest per week for four weeks. Expired artifacts are
  removed from storage; their history rows stay with `artifactAvailable:
  false`.
- `GET /backups/policy` returns the schedule, whether the scheduler is on, the
  next run, retention, and the proposed targets (at most four hours of lost
  changes, restoration within 24 hours, both subject to restore testing).

## Still deferred

Restore execution and restore verification are not application features: a
restore is a supervised procedure from a snapshot file, to be written and
tested with the approved USC/DCISM deployment procedure identified in
`AUDIT_LOG_GUIDE.md`. Encryption beyond the private bucket and failure alerts
are also deployment decisions.

## Populated disposable PostgreSQL checkpoint - 2026-10-27

> Recorded on develop before backup execution was added on
> `feat/client-proposals-presentation`. Its statements that no job, scheduler
> or POST route exists describe the history-only API at that time.

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
