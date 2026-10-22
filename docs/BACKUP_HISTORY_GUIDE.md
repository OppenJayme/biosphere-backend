# BioSphere Backup History Guide

This module implements backup history plus scheduled and manual backup
execution for SRS Section 4.15 using the existing `public.backup_history`
table. It does not download, verify, or restore backups.

## Access and information boundary

- Both endpoints require an authenticated, active `CURATOR` account.
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
