# BioSphere Specimen Bulk Import Guide

## Live XLSX selected-row commit and retry - 2026-10-30

With explicit permission to retain one synthetic record, the signed-in Curator
used the merged production UI/API on backend `f4df176` and frontend `60ab28b`
(build `KjnKPLGaaPM_cm9tgFdJ_`). No rebuild, migration or server restart was
needed. The workbook contained one `Specimens` sheet with literal headers
`accessionNumber,commonName,gender,remarks` and these two rows:

| Row | Accession | Common name | Gender | Result |
| --- | --- | --- | --- | --- |
| 1 | `TEST-XLSX-20261030-A` | TEST - XLSX Commit Retest 20261030 | UNKNOWN | Valid; selected and committed |
| 2 | `TEST-XLSX-20261030-INVALID` | TEST - XLSX Invalid Row 20261030 | BAD_VALUE | Invalid; disabled and unselected throughout |

The initial catalog search for `TEST-XLSX-20261030` showed no matching records.
One preview POST returned 201 with two rows, one valid and one invalid. The
table uses the accession as its primary label when present; checking for the
common name as an exact preview label initially returned zero. Inspecting the
row labels confirmed both expected accessions; this was a test-selector
correction before any commit, not evidence of lost common-name data.

The first **Import selected rows** completed with one successful / zero failed.
Read-only catalog and filtered audit pages then showed one specimen and one
successful `IMPORT_SPECIMEN` audit. Reselecting row 1 and explicitly committing
the **same retained preview** completed successfully again. Both submitted
argument objects were identical: the same preview ID and `rowNumbers: [1]`.
After retry, catalog search still returned exactly one valid record and no
invalid record; the specimen ID stayed
`585172b4-d99d-4f28-b765-65a5a12de24a`.

Full specimen details confirmed the approved common name and remarks persisted,
status `UNCATALOGED`, public display **Not eligible**, and **No active specimen
lots are assigned**. The audit page filtered by module `specimens`, action
`IMPORT_SPECIMEN`, result `SUCCESS` and the specimen UUID as search showed
one matching row before retry and **Showing 1–1 of 1** after retry. Structured details matched the original
preview ID, row 1 and `UNCATALOGED`. The fixture and its normal creation audit
remain in place; no lot, quantity, storage, publishing, archive or deletion
action was submitted. Initial creation is not assumed to produce field-edit
revision rows.

The narrow browser guard permitted only one preview and two exact commit
requests. It also intercepted two other non-read attempts during readback;
their destinations/bodies were not retained, so they are not classified as an
application defect or claimed as zero attempted writes. An early retry script
stopped before clicking because it expected zero intercepted requests; the
actual retry proceeded only after the first record/audit readback passed,
with the same exact request allowlist. No additional commit was allowed. Zero
page errors were counted. The final specimen page remains signed in under a
read-only guard. This browser guard is not independent full-stack containment.

**Result:** the bounded live XLSX selected-row commit/retry subcase passes. This
does not establish concurrent or cross-process/expired-preview retry behavior,
direct SQL postconditions, invalid-row direct-request rejection, suitability
of museum-provided workbooks, or whole-module acceptance. Earlier isolated
HTTP/parser regressions retain their own scope. No new reproducible application
defect was established and no existing defect status is promoted by this run.

## Merged local XLSX preview checkpoint - 2026-10-29

Backend #216/#217 and frontend #96 are merged. The controlled local refresh
serves backend `f4df1761b6326f282f865c7749093d2f0a338749` (PID 26116),
frontend `60ab28b98a2759d951ca4e716ebd359b6bc0f47f` (PID 39028), and frontend
production build `KjnKPLGaaPM_cm9tgFdJ_`. Exact merged lockfile installation,
Prisma client generation without migration and both production builds completed.
The installed backend `proxy-addr` is 2.0.8. Both app health/login checks returned
200; runtime Swagger describes CSV/XLSX preview support. Previous builds/source
references and private recovery logs remain outside Git.

After manual Curator sign-in, the actual merged UI/API previewed a synthetic
XLSX with a `Specimens` sheet and two rows. The real preview POST returned 201,
with **2 total / 1 valid / 1 invalid**. The valid row was selected, the invalid
gender and name remained visible, and its checkbox was disabled. Catalog search
for the unique synthetic prefix showed the no-matching-records state before
and after preview. This is UI readback, not a direct SQL postcondition.

The fresh browser guard allowed one same-origin preview POST and rejected other
non-read methods; observations were one preview, zero other non-read attempts
and zero page errors. No import commit, migration, lot/Inventory or public-
eligibility action was issued. This guard is defense in depth, not independent
full-stack containment. The temporary readback tab closed; the Curator preview
session remains open in read-only test mode. No cookies, tokens or signed URLs
were exported. Native OS chooser behavior was not evaluated by file selection.

Operational probe notes: the first backend readiness window expired;
subsequent independent HTTP checks returned 200. The frontend's first immediate
post-stop check still reported a listener; the next check confirmed release
before its build was moved. No application defect or particular root cause was
established from these probe events. The refreshed apps are healthy.

This completes the local rollout/preview checkpoint. Live XLSX commit/retry,
actual museum-template suitability, concurrency and whole-module acceptance
are not claimed. The already passing isolated/reviewer suites were not rerun
merely for this documentation update.

## Required-format gap confirmed - 2026-10-29

Historical pre-implementation checkpoint: the reviewed XLSX implementation and
subsequent XML repair are recorded under Scope below. This retained finding
does not mean the implementation is still absent from this feature branch.

The user's retained eight-decisions handoff (Oct 5, question 4) specifies CSV
and XLSX for the first release through the same preview/validation/commit
pipeline. Source inspection at backend `09c6696` confirms
`SpecimenImportService` still rejects filenames not ending in `.csv` with
`Only .csv files are supported for import.` The current CSV slice therefore
does not establish completion of that approved import scope.

Next implementation priority: bounded XLSX parsing into the existing row
pipeline, an explicitly selected data worksheet, literal/unambiguous values,
and the existing authorization, preview ownership, selected-row commit and
Uncataloged creation behavior. Do not add a second save path or execute workbook
formulas. Parser/dependency selection and resource limits require review before
implementation; no package was installed or runtime changed in this check.
Actual museum-template validation remains separate from synthetic format tests.
This records a required feature gap, not a regression of the working CSV preview.

This module implements the CSV/XLSX import slice of Cataloging Management (SRS
REQ-4.4-18 through REQ-4.4-23). It reuses the existing specimen-core creation
path (`public.specimen`, `public.specimen_revision_history`,
`public.audit_log`, `public.collection`) through Prisma and introduces no
database structures.

## Scope

### XML review repair - 2026-10-29

Voltaire independently reproduced the original 67 HTTP / 40 unit results, but
identified a blocking quadratic regex scan in `checkWorksheet` on malformed
unclosed tags. See [DEF-029](./TEST_DEFECT_LOG.md#def-029---xlsx-xml-guard-rescans-unclosed-tags-quadratically).
That regex scan has been removed. Pinned `saxes@6.0.0` (ISC, CommonJS and typed)
now performs strict event-based XML validation before the workbook reader.
Malformed XML and duplicate attributes reject immediately; worksheet range
checks follow parser events, even for nonstandard ZIP paths. Other XML parts
are validated without interpreting chart namespace prefixes as worksheet cells.
Additional limits are depth 64, 250,000 elements per XML part and 64 attributes
per element. Charts and external hyperlinks remain unsupported, with explicit
removal instructions instead of a misleading missing-cell-reference message.

The public HTTP malformed-tag regression failed before the repair and now
rejects within its two-second response budget, followed by a successful
protected specimen GET and no fixture writes. The affected HTTP suite passes
72/72 and import-service units 40/40; TypeScript/changed-file lint pass. This is
bounded synthetic HTTP evidence, not a universal latency guarantee or
independent acceptance of the fix. Voltaire subsequently approved `842f558` in
[his retest](https://github.com/OppenJayme/biosphere-backend/pull/216#issuecomment-6499454194),
reporting combined specimen/storage HTTP 77/77 and import units 40/40; see
DEF-029 for the bounded result. Frontend #96 then merged. Dependency
audit remains the recorded 13 existing advisories; no saxes/xmlchars advisory
is reported. OBS-005's separate security triage remains open.

### XLSX support checkpoint - 2026-10-29

XLSX rows now enter the existing preview/validation/commit pipeline; commit,
lot handling and duplicate rules are unchanged. Use a worksheet named exactly
`Specimens`, with text headers in its first row. Other sheets are not imported.
The existing CSV template supplies the same supported headers; it can be opened
in Excel, the sheet renamed and saved as `.xlsx`. No museum template or sample
facts are declared approved by this change.

Format accession numbers as **Text** before entry. Numeric accession cells are
rejected rather than reconstructing lost leading zeros or number formats.
Collection dates may be ISO `YYYY-MM-DD` text or date-only Excel cells, which
are normalized to ISO dates. Date/time cells and dates in other fields are
rejected. The normal future-date and row validation rules still apply.

Workbook limits: 5 MB uploaded, 20 MB total expanded ZIP entries, 128 archive
entries, and sheets within 501 rows (header plus 500 data rows) and 100 columns.
Remove unused formatted rows/columns if Excel's stored range exceeds these
bounds. Range checks apply to XML at arbitrary relationship target paths.
Formula cells (including cached results), spreadsheet error cells, XML
DOCTYPE/entities, external relationships, macro/embedded-object entries,
duplicate headers and unsafe/duplicate archive names are rejected. Only
literal input is accepted; spreadsheet formulas are never evaluated.

Dependencies are pinned to `read-excel-file@9.3.13` and `fflate@0.8.3` (MIT).
The reader's [documented named-sheet and numeric parsing API](https://gitlab.com/catamphetamine/read-excel-file/-/blob/master/README.md)
is used after bounded archive extraction and repackaging. This is resource
limiting, not an OS/process sandbox or unlimited hostile-file guarantee.

Verification: first XLSX HTTP workflow failed with 400 before implementation;
the affected Nest HTTP suite now passes 67/67 and existing import-service units
40/40. These use real services/controllers with synthetic auth/database
adapters and literal OOXML fixtures. Frontend format/rendered-form/handler and
transport checks pass 16/16; full frontend suite 445/445. Local TypeScript and
changed-file lint pass. No live import, shared record, migration, running-server
restart or actual museum-workbook acceptance is claimed. Deployment must pair
the backend support before exposing the frontend XLSX option.

Import creates the same core `UNCATALOGED` specimen record as
`POST /specimens`, plus, when the row supplies them, its taxonomy, provenance,
and one initial specimen lot. Media and tags are outside this slice. The
approved CSV template is not yet frozen by the museum; the supported columns
below may be extended once a template is confirmed.

## Two-phase flow

Import is deliberately split into a read-only preview and an explicit commit
so nothing is saved until the curator has reviewed it (REQ-4.4-20), and so
commit provably operates on what was actually previewed rather than on
arbitrary rows a client happens to send:

1. `POST /specimens/import/preview` — `multipart/form-data` upload with a
   `.csv` or `.xlsx` file field named `file`. Parses and validates every row, flags
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

Taxonomy columns (validated like `POST /specimens/:id/taxonomy`):
`kingdom`, `phylum`, `class` (or `taxonClass`), `order` (or `orderName`,
`taxonOrder`), `family`, `genus`, `species`, `habitat`, `ecologicalRole`,
`conservationStatus`.

Provenance columns (validated like `POST /specimens/:id/provenance`):
`collector`, `donor`, `collectionDate` (`YYYY-MM-DD`), `collectionLocation`,
`preservationType`, `preservationMethod`.

Lot columns (validated like `POST /specimens/:id/lots`):

| Column           | Notes                                                                 |
| ---------------- | --------------------------------------------------------------------- |
| `storageUnit`    | Also `storageUnitId` / `storageLocation`. A unit UUID, or its labels from the room down separated by `>`, `›` or `/` (`Zoology Room > Cabinet A > Drawer 1`). Leading levels may be left out when the rest names exactly one active unit. Labels ignore case. |
| `conditionClass` | Also `condition`                                                      |
| `quantity`       | Also `qty`. Whole number of at least 1; thousands separators allowed  |
| `storageNotes`   | Optional                                                              |

A lot needs `storageUnit`, `conditionClass`, and `quantity` together. The unit
must be active and configured to hold specimens. Problems with these columns
are row errors prefixed with `Taxonomy:`, `Provenance:`, or `Lot:`.

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

## Catalog readiness (REQ-4.4-06/07/08)

Every preview row carries `catalogReadiness`, evaluated with the same
`catalog-completion.policy.ts` rules as
`GET /specimens/:id/catalog-readiness`, using the values the row supplies:

- `requirementsMet`: `true` when the row supplies every catalog requirement.
- `checks`: each requirement with `key`, `label`, and `passed`.
- `missingRequirements`: labels of the requirements the row does not meet,
  for example `Collection date is recorded`.
- `resultingStatus`: the status the record will have after commit.

Missing requirements are **not** row errors and do not set `valid: false`:
BioSphere saves incomplete records as Uncataloged (REQ-4.4-06). The lot
requirement passes only when the row's lot columns validated and resolved to
an active unit that holds specimens. The preview total `catalogReadyRows`
counts valid rows with `requirementsMet: true`.

### Imported-record status (pending team decision)

Import always creates records as `UNCATALOGED`, including rows with
`requirementsMet: true`, so `resultingStatus` is always `UNCATALOGED`. A
curator then marks a ready record Cataloged with
`PATCH /specimens/:id/complete-cataloging`, the same verification step as
manual entry. This matches the existing rule that a record becomes Cataloged
only through an explicit curator action, never automatically.

Whether complete imported rows should instead become Cataloged at commit is
not yet decided for the pilot migration. Until the team and museum confirm
it, do not treat the current behavior as final. If automatic cataloging is
chosen, the change belongs in `SpecimenImportService.createRow` (complete
cataloging inside the row's transaction when `requirementsMet` is true) and
`resultingStatus` would then report `CATALOGED` for those rows.

## Duplicate warnings (REQ-4.4-21/22/23, BR-09)

Duplicate detection is informational only. It never blocks a row, merges
records, or deletes anything. The curator decides. Preview uses the shared
matcher described in `docs/SPECIMEN_DUPLICATES_GUIDE.md`, and each row
reports:

- `duplicateWarnings`: a row is flagged when its `scientificName` **and**
  `commonName` together match an active specimen or another row in the
  file. Accession-number clashes are row **errors**, not warnings (see
  `docs/ACCESSION_NUMBER_GUIDE.md`).
- `possibleDuplicates`: the existing records behind those warnings (id,
  names, status, confidence, and matched/differing fields), so the curator
  can open them before committing.

Import rows are matched on accession number and names, and a row's
`collector`, `donor`, `collectionDate`, and `collectionLocation` columns feed
the same collector/donor distinctions (BR-09) used for manual entry. Those
distinctions need a value on both records, so a row without provenance
columns is matched on accession number and names only. Gender is not treated
as a distinction: two rows that differ only in gender are still flagged. Physical grouping and storage assignment
are deferred (see the duplicates guide).

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

A row's taxonomy, provenance, and lot are created in the same transaction as
its specimen, through the same service methods as manual entry, so they get
their usual revision history and audit events (`CREATE_SPECIMEN_TAXONOMY`,
`CREATE_SPECIMEN_PROVENANCE`, `CREATE_SPECIMEN_LOT`). The lot's initial
`ADDITION` transaction records the reason `Imported from CSV row N (batch
<importBatchId>)`. If any part fails (for example, the storage unit was
archived after preview), the whole row is rolled back and reported as failed.

Each row's transaction runs under `SERIALIZABLE` isolation and is retried up
to three times on a serialization failure, so an imported lot cannot race
another lot create that differs only by condition case (see
`docs/SPECIMEN_LOTS_GUIDE.md`). A row that still conflicts is reported as
failed and can be committed again.

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

This holds for a genuine retry (the first request already finished) and for
two commit requests that overlap in time: the row's create is claimed by a
single in-flight promise the moment it starts, before the database call
completes, so a second request for the same `previewId`+row while the first
is still running awaits that same promise instead of starting its own create
— it cannot race the "was this row already committed?" check the way it
could if that check only looked at the finished result.

This safety is scoped to one preview's lifetime and to rows that actually
went through this endpoint successfully once; it does not protect against a
curator running preview twice on the same file and committing both previews
independently (that produces two previewIds with no relationship to each
other, so the usual duplicate-warning path — not this retry path — is what
catches it). If a curator is unsure whether a specific row committed and no
longer has the response (or the preview itself has since expired), the
reliable check is `GET /audit-logs?module=specimens&action=IMPORT_SPECIMEN`,
whose entries carry the row's `rowNumber` and `importBatchId` in `details`.

## Concurrency

Two commit requests for the same `previewId` and row are guarded against
racing each other into two creates: the moment a row's create starts, it is
claimed by a single in-flight promise (set synchronously, with no `await` in
between the check and the claim), so a concurrent request for that same row
awaits that promise instead of starting its own. This is what makes the
retry-safety above hold even when the two commit calls genuinely overlap in
time, not just when one has already finished.

## Performance

`scripts/benchmark-specimen-import.ts` measures a full-size, 500-row
preview + commit against a real Postgres database (no mocking), using the
production `SpecimensService`/`SpecimenImportService` code paths directly.
Run it against a disposable database — it creates and deletes real rows
(a fixture curator, a stub `auth.users` row, and the imported specimens).

It requires two separate opt-ins before it will open any database
connection: `RUN_LIVE_SPECIMEN_IMPORT_BENCHMARK=true`, and its own
`BENCHMARK_DATABASE_URL` — deliberately **not** the app's normal
`DATABASE_URL`, so it can never silently run against whatever database a
developer's `.env` happens to be configured for. Cleanup deletes by the
fixture curator's account id, not by a list of rows collected during a
successful run, so a partial failure anywhere still leaves the database as
it found it.

```bash
RUN_LIVE_SPECIMEN_IMPORT_BENCHMARK=true \
BENCHMARK_DATABASE_URL=postgresql://user:pass@localhost:5432/some_throwaway_db \
  npm run benchmark:specimen-import
```

```powershell
$env:RUN_LIVE_SPECIMEN_IMPORT_BENCHMARK = "true"
$env:BENCHMARK_DATABASE_URL = "postgresql://user:pass@localhost:5432/some_throwaway_db"
npm run benchmark:specimen-import
```

Measured locally against local Postgres 17: preview ~200-330ms, commit
~1.0-1.3s for 500 rows (roughly 2-2.5ms/row — each row is its own
transaction doing one insert plus one audit-log insert). Actual numbers will
vary by hardware and database latency; this isn't a committed SLA, just a
concrete baseline showing the per-row transaction design doesn't degrade
badly at the current row cap.

This lives as a standalone script rather than a `test/*.e2e-spec.ts` file
because Jest's `--experimental-vm-modules` mode — needed for Prisma's WASM
query-compiler dynamic `import()` — currently breaks loading `@nestjs/config`
in this repo's toolchain. That's a pre-existing issue: the already-shipped
`test/developer.e2e-spec.ts` live suite hits the identical `exports is not
defined` crash under the same flag, unrelated to this change. A plain Node
process has no such restriction, since dynamic `import()` from CommonJS
needs no special flag outside Jest's sandboxed module loader.

## Endpoints

- `POST /specimens/import/preview`
- `POST /specimens/import/commit`

## Deferred boundaries

This slice reports catalog completeness in the preview but does not change a
record's status, does not support legacy XLS or macro-enabled XLSM files, and
does not auto-merge possible duplicates. The column mappings are not final
until the museum approves the CSV template and they are validated against
representative museum data. Those remain governed by the same boundaries documented
in `docs/SPECIMEN_CORE_GUIDE.md` and `docs/SPECIMEN_DETAIL_GUIDE.md`.
