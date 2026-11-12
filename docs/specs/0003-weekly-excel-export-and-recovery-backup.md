# 0003. Weekly Excel export and a separate recovery backup

**Date**: 2026-11-11 (revised 2026-11-12 after the §4.15 owner's specification review)
**Status**: Proposed. Not approved for implementation. Six institutional decisions are pending (see the end).

## Summary

The USC Biological Museum Library set the backup policy for BioSphere on 2026-11-11: weekly, preferably on Saturday, exported as Excel files, with visitor data backed up together with inventory data. This spec proposes two separate jobs.

- **Weekly Excel export:** a workbook the Library can open and keep. It is checked for completeness, read only and access controlled.
- **Recovery backup:** the encrypted, off-provider copy (the existing Backblaze B2 tooling) that is actually used to restore the system.

The two run on separate schedules because they do different jobs. An Excel workbook is a record people can read, not a way to restore the system.

Nothing here is built yet. All values marked **proposed** are defaults to discuss. They are not approved policy. That covers the schedule time, retention, the recovery-point target and which visitor fields are included.

## Context

- **SRS §4.15** (REQ-4.15-12) leaves the backup schedule, retention, RPO, destination and operator to USC/DCISM approval. The Library's answer covers schedule and format only. Retention and operational ownership are still unconfirmed.
- **The current state.** BioSphere has a curator-only Backup History page (`src/backup`, table `backup_history`). The B2 recovery tooling under `scripts/recovery` passed synthetic trials only (`docs/B2_LIVE_SYNTHETIC_TRIAL_20261109.md`). Production capture and scheduling are not running. No Excel export exists. The reports module renders PDF, DOCX and CSV summaries, which are filtered reports, not complete exports.
- **Hosting.** Since 2026-11-11 BioSphere runs on the DCISM web server under pm2 (`docs/DEPLOYMENT_GUIDE.md`). The database, Auth and file storage are Supabase. The campus network blocks Postgres ports, so anything that reads the database has to run on the DCISM server (or off campus).
- **Personal data.** Inquiries and visit requests hold visitor names, emails, phone numbers, addresses, plate numbers and correspondence. They are curator-only data (REQ-4.9-15, NFR-SEC-10). The Library said visitor data is backed up together with inventory. That does not by itself approve every visitor field in a spreadsheet that can be copied off the system, so each personal field needs explicit approval (AC-2a).
- **Review conditions** from the §4.15 module owner: the first set (2026-11-11), and the specification review of `97e8b16`, which covered personal-data gating, recovery completeness, RPO wording, Excel integrity, download limits and scheduling reliability. All are addressed below.

## Requirements

**User stories**:
- As the Library, I want a weekly Excel copy of the inventory and approved visitor records, so that the museum keeps a readable record outside the application.
- As a curator, I want to download the latest weekly export and see whether each week succeeded.
- As the maintainer, I want to be told when an export fails or is missed, without the alert containing visitor data.
- As the system owner, I want a tested way to restore BioSphere, including sign-in and files, that doesn't depend on the Excel files.

### Acceptance criteria: Excel export

**Schedule and reliability**
- **AC-1**: An export runs once per week at the configured time. The **proposed** time is Saturday 18:00 Asia/Manila, after the museum's Saturday hours (08:00 to 11:00). Each run has a fixed **export date**: the Saturday it belongs to, in Manila time.
- **AC-1a (no duplicates)**: There is at most one COMPLETED export per export date. A unique partial index on `backup_history (backup_type, export_date) WHERE status = 'COMPLETED'` enforces this. A Postgres advisory lock held for the whole run stops two processes or two triggers from running at once. A second attempt while one is running ends with `LOCK_HELD` and doesn't write a file.
- **AC-1b (restarts)**: A run that is still IN_PROGRESS 30 minutes after it started is treated as interrupted (for example, the process restarted mid-run). It is marked FAILED with `INTERRUPTED`, and any partly uploaded object is removed. When the backend starts, if the latest export date has no COMPLETED export, it runs once ("catch-up"). Automatic retries stop after 3 failed attempts per export date, so a broken export doesn't loop. A curator can still start one by hand.
- **AC-1c (missed runs detectable without the scheduler)**: "Overdue" is worked out whenever someone reads Backup History or the Dashboard: no COMPLETED export within the last 8 days. It never depends on the scheduler having run. So a scheduler that silently stopped still shows as overdue to anyone who opens either page. Detection from outside BioSphere (for example, an external monitor polling a protected status endpoint) is open question 4.

**Content and privacy**
- **AC-2**: Each export is one `.xlsx` workbook with the worksheets and columns under Feature design. All rows come from one read-only, repeatable-read database transaction, so the sheets agree with each other.
- **AC-2a (personal-data gate)**: Every column that holds visitor personal data is marked **Personal** in the field table. A personal column is included only if it is listed in the export's **approved field set**. That set records who approved it, their role and the date: the Library or privacy owner, open question 6. Until an approval is recorded, the visitor sheets contain only the non-personal columns. The approved field set is shown on the About sheet of every workbook. Changing the set takes a reviewed code or configuration change, not a toggle in the UI.

**Integrity**
- **AC-3 (row completeness)**: Each worksheet's row count equals the count of its source query in the same transaction. The written file is read back, and its row counts must match too.
- **AC-3a (field coverage)**: Each worksheet's header row matches the spec's column list for that sheet after the AC-2a gate, in the same order. A missing, extra or renamed column fails the export.
- **AC-3b (relationships)**: Every reference ID in a child sheet exists in its parent sheet. Lots → Specimens and Storage units. Storage unit parent → Storage units. Preferred dates, Visitors and Vehicles → Visit requests. Correspondence → Inquiries or Visit requests. Inquiry ↔ Visit request links. The checks run on the read-back file, and any unmatched reference fails the export.
- **AC-3c (truncation)**: A cell longer than Excel's 32,767-character limit is cut at the limit and ends with "[truncated]". The number of cut cells, per sheet, is recorded in `backup_history` and on the About sheet. The read-back check confirms the counts match.
- **AC-3d (compatibility)**: The workbook opens without repair prompts in Microsoft Excel (the Library's version; to be confirmed), LibreOffice Calc and Google Sheets. Text with non-ASCII characters (ñ, é, ’, –) survives the round trip. This is checked by hand on the dev project for the first build and after any change to the writer. The automated read-back runs on every export.
- If any integrity check fails, the export is marked FAILED and isn't offered for download.
- **AC-8**: Text cells that start with `=`, `+`, `-`, `@`, tab or carriage return are written as text with a leading apostrophe, so a malicious form entry can't run as a formula. The workbook contains no macros.

**Storage, access and audit**
- **AC-4**: The workbook is stored only in a private Supabase Storage bucket, `weekly-exports`. It never goes into Git, a public bucket or an email attachment. Only the backend's service role can read or write the bucket.
- **AC-5**: Only curators can download. The backend sends the file directly in the response of an authenticated request (`GET /backup/exports/:id/file`, with `Cache-Control: no-store`). No shareable link is created. Developers can see each export's status, counts and failure code, but not the file. Signed-out users get 401; other roles get 403.
- **AC-5a (download audit)**: Every download writes two audit entries. `EXPORT_DOWNLOAD_STARTED` is written when the request is authorized. `EXPORT_DOWNLOAD_SENT` is written when the server has finished sending the file, or `EXPORT_DOWNLOAD_ABORTED` if the connection closes first. "Sent" means the server finished sending. It doesn't prove the curator's device saved or opened the file, and the spec doesn't claim that.
- **AC-6**: Each run records a `backup_history` row (type `WEEKLY_EXCEL_EXPORT`) holding: export date, status, start and end time, per-sheet row counts, cut-cell counts, file size, the file's SHA-256, the approved field set version, and on failure a fixed failure code. Records hold no row values, names, emails or raw error text.
- **AC-7**: When an export fails or becomes overdue, curators and the maintainer are told by a notice on Backup History and the Dashboard, and by an email to the maintainer address. The email contains only the export date, the failure code and a link to the page.
- **AC-9 (retention)**: Exports older than the **approved** retention are deleted from the bucket, and only after a newer export has completed. Their `backup_history` rows stay, marked as expired. **Until retention is approved (open question 1), nothing is deleted automatically.** The proposed value is 12 weekly exports.

### Acceptance criteria: recovery backup (the §4.15 tooling)

- **AC-10 (scope)**: The recovery backup runs on its own schedule. The **proposed** schedule is daily, encrypted, to B2. It never uses the Excel files as its source. Each recovery set contains:
  - the `public` schema: all application tables, enums, constraints, indexes, RLS policies, grants and `_prisma_migrations`
  - **Supabase Auth**: `auth.users` and `auth.identities`, enough for existing accounts to sign in again, or for an approved re-invite procedure if Supabase's restore rules don't allow that. Which one applies is decided and documented in the rehearsal.
  - all objects in the five private Storage buckets (specimen-media, exhibit-media, ar-assets, user-avatars, inquiry-attachments), with their bucket settings and storage policies
  - a **configuration manifest**: the names (never values) of every required backend and frontend env variable; the Supabase Auth settings (Site URL, redirect URLs, email templates, SMTP sender); the pm2, Apache and port setup; and the BioSphere version (git tag/commit) it was taken from
  - a manifest with per-table row counts and per-object sizes and hashes, used to verify a restore (AC-11)
- **AC-10a (secrets and keys)**: Secret values (database password, service role key, Brevo key, Gemini key, OAuth secrets) are not copied into the backup. Where each is kept and how it is reissued is written down in the recovery procedure. The **encryption key** for the backups is held by at least two named people, in a place separate from B2 and from the DCISM server. A restore must be shown to work using the escrowed copy of the key, not the copy on the operator's machine.
- **AC-10b (monitoring)**: Each recovery run records its result in `backup_history`. The same overdue rule as AC-1c applies: no verified recovery backup within 26 hours shows as overdue.
- **AC-11 (isolated restore rehearsal)**: Before go-live, and again after any change to the recovery tooling, one recovery set is restored into an **isolated** target: the dev Supabase project or a throwaway one, never live. After the restore, the following are checked and recorded with `docs/BACKUP_RECOVERY_REHEARSAL_TEMPLATE.md`:
  - every table's row count matches the manifest
  - a sample of Storage objects matches their recorded hashes, and all object counts match
  - `prisma migrate status` reports no pending or modified migrations
  - a test account signs in, or the documented re-invite procedure works
  - a copy of BioSphere pointed at the restored project shows a known specimen with its photo, a known visit request and its history
  - the time the restore took, and any manual steps needed

### Recovery point (RPO) wording

A daily recovery backup sets a **target** recovery point of about 24 hours. It is not a guarantee. The real amount of data that could be lost is the time since the last **verified** recovery backup. That time grows with every missed run, failed upload or failed check, and it is shown on Backup History so it can be seen. The same applies to the Excel export: its contents can be older than a week if exports fail. The overdue notices (AC-1c, AC-10b) exist so that a growing gap is noticed rather than assumed away.

## Options considered

### Option 1: Excel only (the Library's words, taken literally)

**Pros**: one job, simple, and matches the request exactly.
**Cons**: Excel can't bring the system back. Sign-in accounts, files, audit history and record links are lost. Up to 7 days of entries, or more after failed runs, can be lost. The workbook would sit in the same provider as the data it protects.

### Option 2: Weekly Excel export plus a separate encrypted recovery backup (chosen)

**Pros**: the Library gets its readable weekly record, and the system gets a real restore path with a shorter target recovery point. Each job can be tested on its own. It reuses the existing Backup History page and the B2 tooling.
**Cons**: two jobs to watch. The recovery side still needs owner decisions, key escrow and production scheduling.

### Option 3: Rely on Supabase's built-in backups

**Pros**: no work for the team.
**Cons**: no Excel. It depends on the Supabase plan, the team can't test a restore into an isolated target on its own terms, and everything stays with one provider and one account.

## Decision

Option 2, agreed in principle by the §4.15 owner on 2026-11-11. Implementation waits for approval of this revised spec and the institutional decisions listed at the end.

## Rationale

The Library asked for a format people can read, and the SRS asks for a backup that can be restored. One file can't do both well, so each job does one. A weekly export keeps a readable history the museum controls. A more frequent encrypted recovery backup keeps the target recovery point short.

## Feature design

### Scheduling

- **Proposed:** the backend schedules the export itself inside the running pm2 process. The `mailbox-sync` module already uses the same timer pattern. That needs no new crontab entry on the shared DCISM server. Duplicates, restarts and missed runs are handled by AC-1a to AC-1c.
- **Alternative:** a crontab line that calls a backend CLI command. The DCISM account already uses crontab for `@reboot pm2 resurrect`, but DCISM should confirm whether a weekly job is allowed (open question 4). The same lock and unique index apply, so in-process and cron runs can't both complete the same export date.
- The time is stored as `EXCEL_EXPORT_SCHEDULE` (proposed `SAT 18:00`) in `Asia/Manila`. The server runs in Singapore time (same offset), but the code must not rely on that.

### Workbook

File name: `BioSphere-export-YYYY-MM-DD.xlsx` (the export date). Path in the bucket: `weekly-exports/YYYY/`. Dates and times are written as text in Asia/Manila, `YYYY-MM-DD HH:mm`, so no spreadsheet app shifts them. IDs are kept so rows can be matched across sheets (AC-3b). Each sheet has a frozen header row.

Columns marked **(P)** hold personal data and are included only once approved (AC-2a).

| Worksheet | One row per | Columns |
|---|---|---|
| About | (summary) | Generated at, export date, BioSphere version, approved field set (who, role, date), per-sheet row counts, cut-cell counts, what is not included |
| Specimens | specimen (all statuses, archived included) | ID, accession number, category, scientific name, common name, sex, classification status, status, public display allowed, collection, tags, kingdom, phylum, class, order, family, genus, species, habitat, ecological role, conservation status, collector, donor, collection date, collection location, preservation type, preservation method, remarks, created, updated, archived |
| Lots | specimen lot | ID, specimen ID, accession number, storage unit ID, storage path, condition, quantity, storage notes, active, created, updated |
| Storage units | storage unit | ID, parent ID, full path, unit type, label, size, storage type, holds specimens, capacity, archived |
| Collections | collection | ID, name, specimen count |
| Inquiries | general inquiry | ID, reference code, type, status, linked visit request ID, has attachment, consent accepted, created, updated; (P) full name, email, contact number, organization, message |
| Visit requests | visit request | ID, reference code, status, visitor count, approved date, approved start, approved end, source inquiry ID, consent accepted, created, updated; (P) contact person, email, contact number, organization, address, purpose, miscellaneous details, additional notes |
| Preferred dates | preferred visit option | visit request ID, order, date, start, end |
| Visitors | listed visitor | visit request ID, visitor type; (P) name |
| Vehicles | listed vehicle | visit request ID, vehicle type; (P) plate number, brand, driver name |
| Correspondence | communication history entry | ID, inquiry or visit request ID, direction, type, delivery result, sent or received, recorded by (curator name, or "Visitor"); (P) recipient email, subject, message |

Collector and donor names on Specimens are museum provenance records, not visitor data. They are listed in open question 6 so the approver can confirm they belong in the export.

**Not included**, and stated on the About sheet:
- photos and other media files, attachments and AR assets (counts only)
- user accounts and sign-in data
- the audit log and revision history
- FAQ content
- the internal sync and notification tables

These belong to the recovery backup (AC-10).

**Writer**: no new dependency. `fflate` (already used by the specimen XLSX import) zips a minimal SpreadsheetML package with inline strings. `read-excel-file` (also already a dependency) reads the result back for AC-3 to AC-3c.

### Data model sketch

These extend `backup_history`, so Backup History lists exports next to recovery runs. All changes are additive and nullable:
- `export_date` DATE; unique partial index `(backup_type, export_date) WHERE status = 'COMPLETED'`
- `row_counts` JSONB, `truncated_counts` JSONB
- `file_bytes` BIGINT, `file_sha256` CHAR(64)
- `field_set_version` VARCHAR(50)
- `failure_code` VARCHAR(50), from a fixed list: `DB_READ_FAILED`, `COUNT_MISMATCH`, `FIELD_MISMATCH`, `RELATION_MISMATCH`, `WRITE_FAILED`, `UPLOAD_FAILED`, `READBACK_FAILED`, `LOCK_HELD`, `INTERRUPTED`
- `attempt` SMALLINT, `expired_at` TIMESTAMPTZ

The `weekly-exports` bucket is private, with no policies for `anon` or `authenticated`.

### API surface

| Endpoint | Method | Output | Auth | Errors |
|---|---|---|---|---|
| /backup/exports | GET | list: export date, status, row counts, size, failure code, overdue flag | curator, developer | 401, 403 |
| /backup/exports/:id/file | GET | the `.xlsx` file, `no-store` | curator | 401, 403, 404, 410 (expired) |
| /backup/exports/run | POST | `{ id }`, starts a run now | curator, 1 per 10 minutes | 409 (already running), 429 |

### Data loss explained (for the Library)

- **Excel export.** It is a snapshot at the weekly run. If the database were lost just before the next run, the latest Excel would be missing almost a week of entries, and more if recent runs failed. The Excel files can't restore photos, sign-in accounts or the audit trail. At most, catalog rows can be re-entered or re-imported with the existing specimen import.
- **Recovery backup.** Its target is about one day of entries at most. What can actually be lost is the time since the last verified recovery backup, which Backup History shows. It restores the database, sign-in accounts and files. Secrets are reissued as the recovery procedure describes.
- **Between backups.** Supabase keeps the live data. The backups protect against a lost project, a bad change or an account problem, not against everyday use.

### Security model

- The export runs only on the server, with the existing database connection and the service role.
- Nothing is sent by email except a failure or overdue alert without data.
- Downloads are curator-only, sent directly by the backend with no shareable link, and audited (AC-5a).
- Logs, `backup_history` and alerts carry counts, codes and hashes only. They never carry row values or raw error text, because a database error can quote a value.
- Personal columns are off until approved (AC-2a).
- Excel's own workbook passwords are weak, so the protection comes from access control. Once a curator downloads a file, it is outside BioSphere's control. Keeping it safe follows the museum's data handling, and the Library guide must say so.

### Configuration

- `EXCEL_EXPORT_ENABLED` (default `false`), `EXCEL_EXPORT_SCHEDULE` (proposed `SAT 18:00`), `EXCEL_EXPORT_RETENTION_WEEKS` (no default: unset means nothing is deleted), `BACKUP_ALERT_EMAIL`.
- The approved field set is a reviewed file in the repo (`src/backup/export-field-set.ts`), holding the approver, role, date and version. It is not an env variable.

## Build plan

1. Migration for the `backup_history` columns, the unique index and the private `weekly-exports` bucket, applied on the dev project first. Satisfies **AC-1a**, **AC-4**, **AC-6**.
2. Export service: snapshot transaction, sheet builders with the field-set gate, formula escaping, `fflate` writer, read-back checks (rows, headers, relationships, truncation), upload, history row. Unit tests on fixtures. Satisfies **AC-2** to **AC-3c**, **AC-8**.
3. Scheduler with advisory lock, catch-up, stale-run handling and an attempt limit, plus retention cleanup that only runs once retention is set. Satisfies **AC-1** to **AC-1b**, **AC-9**.
4. Endpoints: list, authenticated file download with audit entries, manual run, overdue calculation and alerts. Satisfies **AC-1c**, **AC-5**, **AC-5a**, **AC-7**.
5. Frontend: an Exports section on Backup History (list, status, overdue, Download for curators) and an overdue/failed notice on the Dashboard. Satisfies **AC-1c**, **AC-5**, **AC-7**.
6. Recovery side (§4.15 owner): include Auth, the configuration manifest and Storage policies; set up key escrow; production capture and schedule on the DCISM server; monitoring; isolated restore rehearsal. Satisfies **AC-10** to **AC-11**.
7. A short Library guide: what the workbook contains, how to download it, where to keep copies, and what it can't restore.

## Testing (dev project only)

Testing uses the dev Supabase project (`xmdzstsicsxremqrdyha`) with its dummy specimens and visit requests. Nothing runs against live until this spec and the institutional decisions are approved.

- **Completeness and coverage:** compare each sheet's row count with a direct SQL count. Compare each header row with the spec table (with and without personal columns approved). Change data during a run and confirm the sheets still agree (snapshot).
- **Relationships:** a fixture with an archived storage unit that still has a lot, a visit request referred from an inquiry, and an imported visitor reply. Every reference resolves in the file. Removing a parent row from the snapshot query in a test fails with `RELATION_MISMATCH`.
- **Truncation and characters:** a 40,000-character message is cut, marked and counted. Names with ñ, é and curly quotes survive the round trip. The file opens without repair in Excel, LibreOffice and Google Sheets.
- **Formula injection:** an inquiry message starting with `=HYPERLINK(...)` opens as text.
- **Personal-data gate:** with no approved set, no (P) column appears on any sheet, and the About sheet says so.
- **Restricted access:** signed out gets 401 and a developer downloading the file gets 403. No public or signed URL exists for the object. A completed download writes STARTED and SENT entries, and an aborted one writes STARTED and ABORTED.
- **Failure handling:** simulate a database timeout, a storage upload error, a count mismatch and a header mismatch. Each should leave a FAILED row with the right code, send an alert containing no data, and offer no download.
- **Scheduling reliability:** two runs started together give one COMPLETED and one `LOCK_HELD`. Killing the process mid-run leaves a row that becomes `INTERRUPTED` and is retried at startup. Stopping the backend over the scheduled time leads to a catch-up run. With the scheduler disabled, the overdue notice still appears after 8 days (tested by moving the clock in a test).
- **Retention:** with retention unset, nothing is deleted. With a 2-week setting, the oldest file is deleted only after a new export completes.
- **Recovery (separate, §4.15):** the AC-11 rehearsal into an isolated project, including Auth sign-in and the escrowed key.
- All results are recorded in `docs/` as an acceptance run, as done for earlier modules.

## Open questions: institutional decisions (all pending)

These stay open until the named owner answers. The spec's proposed values are not policy.

| # | Decision | Owner | Proposed for discussion | Status |
|---|---|---|---|---|
| 1 | Retention of weekly Excel exports, and of recovery backups | Library / system owner | 12 weekly exports; recovery retention set by the §4.15 owner | Pending |
| 2 | Operational owner who checks results and acts on alerts after handover | Library, with John as maintainer | n/a | Pending |
| 3 | Where curators keep downloaded copies (must be institution-owned) | Library | n/a | Pending |
| 4 | Whether DCISM accepts an in-process weekly job or wants cron, and whether an external monitor is wanted | DCISM admins, team | in-process | Pending |
| 5 | Recovery schedule, destination and B2 account owner, and who holds the escrowed key | §4.15 owner, system owner | daily to B2, two key holders | Pending |
| 6 | Which personal columns (P) the Excel may include, including full correspondence text, addresses and vehicle details, and confirming collector and donor names | Library / privacy owner | none until approved | Pending |

## Consequences

**Positive**: the Library gets the weekly Excel it asked for, checked for completeness and integrity, and only curators can get it. Restores, including sign-in and files, no longer depend on a spreadsheet. Data-loss exposure is shown instead of assumed.

**Negative / tradeoffs**: there are two jobs to watch. Files curators download leave BioSphere's access control. An in-process scheduler depends on the backend being up. The catch-up and the read-time overdue rule make that visible but can't prevent it. Personal columns stay off until approval arrives, so the first exports may be less complete than the Library expects.

**Neutral**: SRS §4.15 should record the Library's weekly Excel decision and the agreed retention once answered.
