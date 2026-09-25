# BioSphere Specimen Bulk Import Guide

This module implements the CSV import slice of Cataloging Management (SRS
REQ-4.4-18 through REQ-4.4-23). It reuses the existing specimen-core creation
path (`public.specimen`, `public.specimen_revision_history`,
`public.audit_log`, `public.collection`) through Prisma and introduces no
database structures.

## Scope

Import creates the same core `UNCATALOGED` specimen record as
`POST /specimens`. Taxonomy, provenance, lots, media, and tags are outside
this slice, consistent with `docs/SPECIMEN_CORE_GUIDE.md`. The approved CSV
template is not yet frozen by the museum; the supported columns below mirror
`CreateSpecimenDto` and may be extended once a template is confirmed.

## Two-phase flow

Import is deliberately split into a read-only preview and an explicit commit
so nothing is saved until the curator has reviewed it (REQ-4.4-20), and so
commit provably operates on what was actually previewed rather than on
arbitrary rows a client happens to send:

1. `POST /specimens/import/preview` — `multipart/form-data` upload with a
   `.csv` file field named `file`. Parses and validates every row, flags
   possible duplicates, and returns the results plus a `previewId`. Nothing
   is persisted and no audit event is written.
2. `POST /specimens/import/commit` — JSON body of `{ previewId, rowNumbers?
   }`. Creates one specimen record for each targeted row using exactly the
   data that preview already validated for that row. Omitting `rowNumbers`
   commits every row the preview marked valid.

A `previewId` can only be committed by the curator who requested that
preview, and only within `PREVIEW_TTL_MS` (30 minutes) of the preview call;
after that, or from another account, commit responds `404 Not Found` and the
curator must re-run preview. There is no way to inject rows into a commit
that were never validated by a preview, and no way to bypass the duplicate
warnings a preview surfaced — the request simply doesn't carry row data,
only a reference to a preview that already carries it.

Both endpoints require an active BioSphere account with the `CURATOR` role.

Reviewed previews are cached in-memory, per backend process, keyed by
`previewId`. This is a deliberately lightweight choice for a review window
measured in minutes, not a durable store: it does not survive a process
restart, and it would not be shared if BioSphere ever ran more than one
backend instance. If either of those becomes a real requirement, this cache
should move to a shared store (e.g. a dedicated table or Redis) behind the
same `previewId` contract.

## Supported columns

Headers are matched case-insensitively and ignoring spaces/underscores/hyphens
(`Scientific Name`, `scientific_name`, and `scientificName` are equivalent):

| Column               | Maps to (`CreateSpecimenDto`) | Notes                                   |
| -------------------- | ------------------------------ | ---------------------------------------- |
| `collectionId`       | `collectionId`                 | Existing collection UUID                 |
| `accessionNumber`    | `accessionNumber`               | Nullable (REQ-4.4-03)                    |
| `specimenCategory`   | `specimenCategory`             |                                           |
| `scientificName`     | `scientificName`                |                                           |
| `commonName`         | `commonName`                    |                                           |
| `gender`             | `gender`                        | Normalized to `MALE`/`FEMALE`/`UNKNOWN`/`NOT_APPLICABLE` |
| `classificationStatus` | `classificationStatus`        |                                           |
| `remarks`            | `remarks`                       |                                           |

An unrecognized column is not an error; it is reported once in the preview's
`unmappedColumns` list so the curator can confirm nothing was silently
dropped. An empty cell is treated as "not provided," not as an empty string.

## Validation (REQ-4.4-20)

Every row is validated against the same `class-validator` rules as manual
specimen creation (max lengths, enum membership, non-empty when present) plus
two import-specific checks: a supplied `collectionId` must reference an
existing collection, and a row must have at least one recognized, non-empty
value — a row where every mapped column is blank (or where none of the
file's columns mapped to a supported field at all, which fails the whole
file up front with a clear message rather than one confusing error per row)
is rejected rather than silently treated as a valid, empty specimen. A row
with any validation error is marked `valid: false` and is excluded from a
commit call that omits `rowNumbers`.

The uploaded file is capped at `MAX_IMPORT_ROWS` (500) data rows and 5 MB.
Both bounds are a pragmatic implementation limit, not an SRS-specified number,
chosen to keep the duplicate-check queries and per-row commit loop bounded.

## Duplicate warnings (REQ-4.4-21/22/23, BR-09)

Duplicate detection is informational only. It never blocks a row, merges
records, or deletes anything — the curator decides. A row can receive a
warning when:

- its `accessionNumber` (case-insensitive) matches an active specimen already
  in the database, or another row in the same file;
- its `scientificName` **and** `commonName` together (case-insensitive) match
  an active specimen already in the database, or another row in the same
  file.

The same species is expected to have separate records for different physical
groups, collectors, donors, or storage assignments (BR-09), so this check
intentionally only warns rather than rejecting the row.

## Commit behavior

`POST /specimens/import/commit` creates each targeted row in its own Prisma
transaction, so one failing row (for example, a `collectionId` deleted after
preview) does not roll back the rest of the batch. The response reports a
per-row result:

- On success: the created `Specimen`.
- On failure: the row number and a safe error message — including when a
  requested row number was never part of that preview, or was part of it but
  marked invalid. Unexpected errors are logged server-side and returned as a
  generic message rather than leaking internal details.

Every created record is attributed to the authenticated curator and appends
a `CREATE_SPECIMEN`-equivalent `audit_log` entry with `action =
'IMPORT_SPECIMEN'`. Because the current schema has no `import_source` column
on `public.specimen`, the row number, the `previewId`, and a
server-generated `importBatchId` (shared by every row created by one commit
call) are recorded in the audit entry's `details` instead, so an import run
can still be traced later. Adding a dedicated import-source column would
require a reviewed Prisma migration.

Commit does not re-run duplicate detection. The curator has already seen the
preview's warnings and decided; re-blocking at commit time would contradict
REQ-4.4-22.

## Retry safety

Because each successfully-committed row is recorded against its `previewId`
for the life of that preview, retrying the exact same `POST
/specimens/import/commit` call (same `previewId`, same or omitted
`rowNumbers`) after a dropped connection or a lost response does **not**
create a second specimen for a row that already succeeded — that row's
result is simply reported again with its original `Specimen`. This makes the
common "the response never arrived, did it actually commit?" case safe to
resolve by just resubmitting the same request.

This safety is scoped to one preview's lifetime and to rows that actually
went through this endpoint successfully once; it does not protect against a
curator running preview twice on the same file and committing both previews
independently (that produces two previewIds with no relationship to each
other, so the usual duplicate-warning path — not this retry path — is what
catches it). If a curator is unsure whether a specific row committed and no
longer has the response (or the preview itself has since expired), the
reliable check is `GET /audit-logs?module=specimens&action=IMPORT_SPECIMEN`,
whose entries carry the row's `rowNumber` and `importBatchId` in `details`.

## Endpoints

- `POST /specimens/import/preview`
- `POST /specimens/import/commit`

## Deferred boundaries

This slice does not decide catalog completeness, enforce accession-number
uniqueness, support spreadsheet formats other than CSV, or auto-merge
possible duplicates. Those remain governed by the same boundaries documented
in `docs/SPECIMEN_CORE_GUIDE.md` and `docs/SPECIMEN_DETAIL_GUIDE.md`.
