# 0003. Weekly Excel export and a separate recovery backup

**Date**: 2026-11-11
**Status**: Proposed (for review with the §4.15 module owner before any code is written)

## Summary

The USC Biological Museum Library set the backup policy for BioSphere on 2026-11-11: weekly, preferably on Saturday, exported as Excel files, with visitor data backed up together with inventory data. This spec proposes two separate jobs. The first is a **weekly Excel export** that the Library can open and keep. It is complete, read only and access controlled. The second is a **recovery backup**: the encrypted, off-provider copy (the existing Backblaze B2 tooling) that is actually used to restore the system. The two run on separate schedules because they do different jobs. An Excel workbook is a record people can read, not a way to restore the system.

Nothing here is built yet. Kyer asked for the spec to be reviewed together before implementation, and the open questions at the end need answers from the Library or the system owner.

## Context

- **SRS §4.15** (REQ-4.15-12) leaves the backup schedule, retention, RPO, destination and operator to USC/DCISM approval. The Library's answer covers schedule and format only. Retention and operational ownership are still unconfirmed.
- **The current state.** BioSphere has a curator-only Backup History page (`src/backup`, table `backup_history`). The B2 recovery tooling under `scripts/recovery` passed synthetic trials only (`docs/B2_LIVE_SYNTHETIC_TRIAL_20261109.md`). Production capture and scheduling are not running. No Excel export exists. The reports module renders PDF, DOCX and CSV summaries, which are filtered reports, not complete exports.
- **Hosting.** Since 2026-11-11 BioSphere runs on the DCISM web server under pm2 (`docs/DEPLOYMENT_GUIDE.md`). The database and file storage are Supabase. The campus network blocks Postgres ports, so anything that reads the database has to run on the DCISM server (or off campus).
- **Personal data.** Inquiries and visit requests hold visitor names, emails, phone numbers, addresses, plate numbers and correspondence. They are curator-only data (REQ-4.9-15, NFR-SEC-10). An export must not widen who can see them, and logs, alerts and checks must not copy them.
- **Kyer's conditions** (2026-11-11), all covered below:
  - exact worksheets and fields
  - a private destination: no Git, public buckets or email attachments
  - proposed retention
  - the Saturday timezone
  - DCISM cron permission
  - failure reporting
  - completeness checks that don't expose visitor details
  - separate Excel and recovery schedules, with possible data loss explained
  - testing on the dev project first
  - acceptance criteria: completeness, restricted access, failure handling, an isolated recovery test, and results recorded.

## Requirements

**User stories**:
- As the Library, I want a weekly Excel copy of the inventory and visitor records, so that the museum keeps a readable record outside the application.
- As a curator, I want to download the latest weekly export and see whether each week succeeded.
- As the maintainer, I want to be told when an export fails or is missed, without the alert containing visitor data.
- As the system owner, I want a tested way to restore BioSphere that doesn't depend on the Excel files.

**Acceptance criteria** (Excel export):
- **AC-1**: An export runs every Saturday at 18:00 Asia/Manila. That is after the museum's Saturday hours (08:00 to 11:00), so the week's entries are in. If the server was down at that time, the export runs once when the backend next starts, if no completed export exists for that Saturday.
- **AC-2**: Each export is one `.xlsx` workbook with the worksheets and columns listed under Feature design. All rows come from a single read-only, repeatable-read database transaction, so the sheets agree with each other.
- **AC-3**: Completeness: the row count of every worksheet equals the count of its source query in the same transaction. The written file is read back, and its row counts must match too. If any count differs, the export is marked FAILED and isn't offered for download.
- **AC-4**: The workbook is stored only in a private Supabase Storage bucket, `weekly-exports`. No public URL, no Git, no email attachment. Only the backend's service role can read or write the bucket.
- **AC-5**: Only curators can list and download exports. A download uses a signed URL that expires in 60 seconds and writes an audit log entry. Developers can see each export's status, counts and failure code, but cannot download the file. Signed-out users get 401; other roles get 403.
- **AC-6**: Each run records a `backup_history` row (type `WEEKLY_EXCEL_EXPORT`) holding: status, start and end time, per-sheet row counts, file size, the file's SHA-256, and on failure a fixed failure code. Records hold no row values, names, emails or raw error text.
- **AC-7**: When an export fails, curators and the maintainer are told by an in-app notice on Backup History and the Dashboard, and by an email to the maintainer address. The email contains only the date, the failure code and a link to the page. If no completed export exists in the last 8 days, the same notice says the export is overdue.
- **AC-8**: Text cells that start with `=`, `+`, `-`, `@`, tab or carriage return are written as text with a leading apostrophe, so a malicious form entry can't run as a formula in Excel. The workbook contains no macros.
- **AC-9**: Exports older than the retention window are deleted from the bucket after a newer export has completed. Proposed window: the last 12 weekly exports (about 3 months), pending the Library's decision. Their `backup_history` rows stay, marked as expired.

**Acceptance criteria** (recovery backup, the §4.15 tooling):
- **AC-10**: The recovery backup runs on its own schedule, proposed daily. It covers the database and the five Storage buckets, encrypted, in B2. It never uses the Excel files as its source.
- **AC-11**: Before go-live, one recovery is rehearsed into an isolated target (the dev Supabase project or a throwaway one, never live). The results are recorded with `docs/BACKUP_RECOVERY_REHEARSAL_TEMPLATE.md`.

## Options considered

### Option 1: Excel only (the Library's words, taken literally)

**Pros**: one job, simple, and matches the request exactly.
**Cons**: Excel can't bring the system back. Files, accounts, audit history and record links are lost. Up to 7 days of entries can be lost. The workbook would sit in the same provider as the data it protects.

### Option 2: Weekly Excel export plus a separate encrypted recovery backup (chosen)

**Pros**: the Library gets its readable weekly record, and the system gets a real restore path with a shorter loss window. Each job can be tested on its own. It reuses the existing Backup History page and the B2 tooling.
**Cons**: two jobs to watch, and the recovery side still needs owner decisions and production scheduling.

### Option 3: Rely on Supabase's built-in backups

**Pros**: no work for the team.
**Cons**: no Excel. It depends on the Supabase plan, the team can't test a restore into an isolated target on its own terms, and everything stays with one provider and one account.

## Decision

Option 2. Kyer agreed on 2026-11-11, on condition that the spec is reviewed first.

## Rationale

The Library asked for a format people can read, and the SRS asks for a backup that can be restored. One file can't do both well, so each job does one. A weekly export keeps a readable history the museum controls. A daily encrypted recovery backup limits how much work can be lost.

## Feature design

### Scheduling (DCISM cron question)

- **Proposed:** the backend schedules the export itself inside the running pm2 process. The `mailbox-sync` module already uses the same timer pattern. That needs no new crontab entry on the shared DCISM server. The catch-up in AC-1 covers restarts and downtime.
- **Alternative if the team prefers an OS scheduler:** a crontab line that calls a backend CLI command. The DCISM account already uses crontab for `@reboot pm2 resurrect`, but we should still ask DCISM whether a weekly job is allowed. Either way, only one scheduler may be active, and the export takes a database advisory lock, so two runs can't overlap.
- The time is stored as `EXCEL_EXPORT_SCHEDULE` (default `SAT 18:00`) in `Asia/Manila`. The server runs in Singapore time (same offset), but the code must not rely on that.

### Workbook

File name: `BioSphere-export-YYYY-MM-DD.xlsx` (the Saturday's date, Manila). Path in the bucket: `weekly-exports/YYYY/`. Dates and times are written in Asia/Manila as `YYYY-MM-DD HH:mm`. IDs are kept so that rows can be matched across sheets. Every sheet has a frozen header row with readable column names.

| Worksheet | One row per | Columns |
|---|---|---|
| About | (summary) | Generated at, export date, BioSphere version, per-sheet row counts, what is not included (see below) |
| Specimens | specimen (all statuses, archived included) | ID, accession number, category, scientific name, common name, sex, classification status, status, public display allowed, collection, tags (comma separated), kingdom, phylum, class, order, family, genus, species, habitat, ecological role, conservation status, collector, donor, collection date, collection location, preservation type, preservation method, remarks, created, updated, archived |
| Lots | specimen lot | ID, specimen ID, accession number, storage location (full path, for example "Cabinet A > Shelf 2 > Box 3"), condition, quantity, storage notes, active, created, updated |
| Storage units | storage unit | ID, parent ID, full path, unit type, label, size, storage type, holds specimens, capacity, archived |
| Collections | collection | ID, name, specimen count |
| Inquiries | general inquiry | ID, reference code, type, status, full name, email, contact number, organization, message, has attachment (yes/no), linked visit request ID, consent accepted, created, updated |
| Visit requests | visit request | ID, reference code, status, contact person, email, contact number, organization, address, purpose, visitor count, miscellaneous details, additional notes, approved date, approved start, approved end, source inquiry ID, consent accepted, created, updated |
| Preferred dates | preferred visit option | visit request ID, order, date, start, end |
| Visitors | listed visitor | visit request ID, name, visitor type |
| Vehicles | listed vehicle | visit request ID, plate number, brand, type, driver name |
| Correspondence | communication history entry | ID, inquiry or visit request ID, direction, type, recipient email, subject, message, delivery result, sent or received, recorded by (curator name, or "Visitor" for imported replies) |

**Not included**, and stated on the About sheet:
- photos and other media files, attachments and AR assets (counts only)
- user accounts, passwords and sign-in data
- the audit log and revision history
- FAQ content
- the internal sync and notification tables

These belong to the recovery backup. Excel cells hold at most 32,767 characters. A longer value is cut at that limit and marked "[truncated]", and the About sheet shows how many cells were cut.

**Writer**: no new dependency. `fflate` (already used by the specimen XLSX import) zips a minimal SpreadsheetML package with inline strings. Tests read every workbook back with `read-excel-file` (also already a dependency), which is the read-back check in AC-3.

### Data model sketch

These extend `backup_history`, so Backup History lists Excel exports next to recovery runs. All changes are additive and nullable:
- `row_counts` JSONB: `{ "Specimens": 1234, ... }`
- `file_bytes` BIGINT, `file_sha256` CHAR(64)
- `failure_code` VARCHAR(50), from a fixed list: `DB_READ_FAILED`, `COUNT_MISMATCH`, `WRITE_FAILED`, `UPLOAD_FAILED`, `READBACK_FAILED`, `LOCK_HELD`
- `expired_at` TIMESTAMPTZ

The `weekly-exports` bucket is private, with no policies for `anon` or `authenticated`.

### API surface

| Endpoint | Method | Output | Auth | Errors |
|---|---|---|---|---|
| /backup/exports | GET | list: date, status, row counts, size, failure code | curator, developer | 401, 403 |
| /backup/exports/:id/download | POST | `{ url, expiresAt }`, 60 s signed URL | curator | 401, 403, 404, 410 (expired) |
| /backup/exports/run | POST | `{ id }`, starts a run now | curator, 1 per 10 minutes | 409 (already running), 429 |

### Data loss explained (for the Library)

- **Excel export.** It is a snapshot at Saturday 18:00. If the database were lost on a Friday, the latest Excel would be missing almost a week of entries. The Excel files can't restore photos, accounts or the audit trail. At most, catalog rows can be re-entered or re-imported with the existing specimen import.
- **Recovery backup (proposed daily).** At most about one day of entries is lost, and it restores the database and the files.
- **Between backups.** Supabase keeps the live data. The backups protect against a lost project, a bad change or an account problem, not against everyday use.

### Security model

- The export runs only on the server, with the existing database connection and the service role.
- Nothing is sent by email except a failure alert without data.
- Downloads are curator-only, short-lived and audit logged.
- Logs, `backup_history` and alerts carry counts, codes and hashes only. They never carry row values or raw error text, because a database error can quote a value.
- Excel's own workbook passwords are weak, so the protection comes from access control. Once a curator downloads a file, keeping it safe follows the museum's own data handling. The Library guide must say so.

### Configuration

- `EXCEL_EXPORT_ENABLED` (default `false`), `EXCEL_EXPORT_SCHEDULE` (default `SAT 18:00`), `EXCEL_EXPORT_RETENTION_WEEKS` (default `12`), `BACKUP_ALERT_EMAIL` (the maintainer's address).

## Build plan

1. Migration for the `backup_history` columns and the private `weekly-exports` bucket. Applied on the dev project first. Satisfies **AC-4**, **AC-6**.
2. Export service: snapshot transaction, sheet builders, formula escaping, `fflate` writer, read-back check, upload, history row. Unit tests on fixtures. Satisfies **AC-2**, **AC-3**, **AC-8**.
3. Scheduler with catch-up and an advisory lock, plus the retention cleanup. Satisfies **AC-1**, **AC-9**.
4. Endpoints, audit entry on download, failure and overdue alerts. Satisfies **AC-5**, **AC-7**.
5. Frontend: an Exports section on Backup History (list, status, Download for curators), and an overdue/failed notice on the Dashboard. Satisfies **AC-5**, **AC-7**.
6. Recovery side (Kyer): production capture and daily schedule on the DCISM server, and an isolated restore rehearsal. Satisfies **AC-10**, **AC-11**.
7. A short Library guide: what the workbook contains, how to download it, where to keep copies, and what it can't restore.

## Testing (dev project only)

Testing uses the dev Supabase project (`xmdzstsicsxremqrdyha`) with its dummy specimens and visit requests. Nothing runs against live until the review is done.

- **Completeness:** run an export on dev and compare each sheet's count with a direct SQL count. Change data during the run and confirm the sheets still agree (snapshot).
- **Formula injection:** put an inquiry message starting with `=HYPERLINK(...)` and confirm it opens in Excel as text.
- **Restricted access:** signed out gets 401 and developer download gets 403. Confirm the bucket object has no public URL, that a signed URL stops working after 60 s, and that the download is in the audit log.
- **Failure handling:** simulate a database timeout, a storage upload error and a count mismatch. Each should leave a FAILED row with the right code, send an alert containing no data, and offer no download. Stop the backend over a Saturday 18:00 and confirm the catch-up run.
- **Retention:** with a 2-week setting, confirm the third-oldest file is deleted only after a new export completes.
- **Recovery (separate):** restore the latest recovery backup into an isolated project and fill in the rehearsal template.
- Record all results in `docs/` as an acceptance run, as done for earlier modules.

## Open questions (need an answer before go-live)

1. **Retention.** How many weekly Excel exports should BioSphere keep (proposed 12)? How long should recovery backups be kept? *Library / system owner.*
2. **Operational owner.** Who checks the weekly result and acts on failure alerts after the team hands over? *Library, with John as maintainer.*
3. **Offline copies.** Should curators download each week's file to institution-owned storage (for example a museum-controlled drive)? If so, where? It must not be a personal account. *Library.*
4. **DCISM.** Is an in-process weekly job acceptable to DCISM, or do they want it registered as a cron job? *DCISM admins.*
5. **Recovery schedule and destination.** Daily to B2 as proposed, and whose account owns the B2 bucket? *Kyer, system owner.*
6. **Correspondence.** Should full message text be in the Excel, or only subject, date and direction? *Library, privacy notice owner.*

## Consequences

**Positive**: the Library gets the weekly Excel it asked for, the export is checked for completeness, and it stays curator-only. Restores no longer depend on a spreadsheet.

**Negative / tradeoffs**: there are two jobs to watch. Excel files that curators download leave BioSphere's access control. An in-process scheduler depends on the backend being up, which the catch-up only partly covers.

**Neutral**: SRS §4.15 should record the Library's weekly Excel decision and the agreed retention once answered.
