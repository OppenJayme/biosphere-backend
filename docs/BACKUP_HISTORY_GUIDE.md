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

## Deliberately deferred operations

Backup scheduling, retention, encryption, storage destination, failure alerts,
restore execution, and restore verification remain deployment-level decisions.
They must not be added as ordinary application CRUD or inferred from this read
API. Their implementation requires the approved USC/DCISM deployment procedure
identified in `AUDIT_LOG_GUIDE.md`.
