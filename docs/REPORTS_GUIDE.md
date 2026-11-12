# BioSphere Reports Guide

## Excel-only reports - 2026-11-12

The museum keeps reports, imports, exports and backups in Excel only (decision
for the 2026-11-12 re-presentation). Every report type is now generated as an
`.xlsx` workbook (`format: "XLSX"`); PDF, DOCX and CSV are no longer offered,
and requests for them are rejected with `400`. The `pdfkit` and `docx`
dependencies were removed.

Each workbook has a **Summary** sheet first (title, institution, period,
generation time and account, the confidentiality notice where it applies,
headings, notes and key figures in reading order), then one sheet per table,
named after its section heading. The detail table always appears with every
column, one field per column; the narrowed "printed" table that stacked two
fields per cell for portrait pages is replaced by it. Text that starts with
`=`, `+`, `-`, `@`, a tab or a carriage return is stored with Excel's quote
prefix, so it shows and stays as text and never runs as a formula.

Report history still lists earlier PDF, DOCX and CSV generations with their
recorded format. The PDF/DOCX letterhead and 12 pt print rules below describe
those earlier files only. The `assets/reports` logos are no longer read.

## Archive-read consistency - 2026-11-04

Consolidated active category, condition and lot quantity breakdowns now exclude
either archive indicator. The all-record total, period activity and the Inventory
report's existing status-filter behavior are preserved. After the November 5
follow-up below, current status counts also use effective archive membership
rather than raw stored status. The user authorized this John/Charles-owned follow-up;
[DEF-032](./TEST_DEFECT_LOG.md#def-032---timestamp-only-archives-leak-into-active-catalog-and-breakdowns)
records real SQL/public-builder evidence. No emitted file, shared report record,
upload, quantity or schema change was tested or performed by this fixture.

### Consolidated status consistency follow-up - 2026-11-05

John/MarQtie's [nonblocking #231 review follow-up](https://github.com/OppenJayme/biosphere-backend/pull/231#discussion_r4475936341)
identified one remaining difference: a timestamp-only archive still counted as
Uncataloged in the consolidated report while Dashboard/Cataloging treated it
as Archived. The public report-builder/owned PostgreSQL test reproduced 2
Uncataloged / 1 Cataloged / 2 Archived instead of 1 / 1 / 3. The overall total
was and remains 5; active lots/quantity remain 2/7.

Consolidated current-status counts now group active records by status and count
either archive indicator as Archived, using the shared predicates. The Inventory
Summary paragraph explains this interpretation. No record status or timestamp
is rewritten. Period activity counts are not reinterpreted as current-state
counts, and Inventory detail filtering is outside this narrow repair.

The existing six-case public-service/SQL suite passes with the strengthened
report expectation. It remains opt-in (`npm run test:archive-reads:db`), accepts
no external DB URL, and uses owned temporary PostgreSQL with synthetic data and
read-only application grants. This is builder-result verification, not a new
live browser/report-upload test, migration replay or concurrent-snapshot proof.
No module/defect acceptance is promoted by this owner check.

This module implements the reports and export portion of SRS Section 4.7
(REQ-4.7-04 to REQ-4.7-16) for the five approved core report types in §4.7.4,
plus the audit-log export the SRS Audit Logs page describes (Figure 20,
REQ-4.15-04).
Search and filtering of inventory tables (REQ-4.7-01 to 4.7-03) live in the
specimen search endpoints, not here. The module adds no tables: it reads
existing records and records every generation in `public.audit_log`.

## Access

Every route requires an authenticated, active `CURATOR`. Reports carry private
visitor details and internal storage locations (REQ-4.7-13), so none of them
are public or available to Developer accounts.

## Endpoints

- `GET /reports`: the report types with their allowed formats, periods,
  filter fields, and what the period applies to. Build the report picker from
  this instead of hard-coding it.
- `POST /reports`: generates one report and returns the file as the response
  body (`Content-Disposition: attachment; filename="..."`,
  `Cache-Control: no-store`). Limited to 20 requests per minute.
- `GET /reports/history`: generation history from the audit log, newest first.
  Filters `type`, `result` (`SUCCESS`/`FAILED`), `page`, `limit` (max 100).
- `GET /reports/summary`: totals for the Reports page stat cards: all-time
  count, this month's count, the most-generated type, and the last report.

## Report types

| `type` | Formats | Periods | Filters |
| --- | --- | --- | --- |
| `CONSOLIDATED_OPERATIONS` | XLSX | MONTHLY, YEARLY, CUSTOM | `remarks` |
| `INVENTORY` | XLSX | any | `specimenStatus`, `category`, `kingdom`, `phylum`, `taxonClass`, `taxonOrder`, `family`, `genus`, `species`, `conditionClass`, `storageUnitId`, `includeDescendantUnits`, `publicDisplay` |
| `INQUIRY_SUMMARY` | XLSX | any | `inquiryStatus`, `inquiryType` |
| `VISIT_REQUEST_SUMMARY` | XLSX | any | `visitStatus` |
| `QR_AR_EXHIBITS` | XLSX | any | `exhibitStatus`, `arEnabled` |
| `AUDIT_LOG` | XLSX | any | `auditModule`, `auditAction`, `auditResult` |

The Consolidated report is summary tables only, so its workbook has no detail
sheet. The workbook is a separate editable file; editing it never changes
BioSphere records (REQ-4.7-16).

The Consolidated report covers, for the period: specimens added, catalog
completions, specimens archived, lot activity and quantity adjustments,
inquiries by status and type, visit requests and visitors by status, exhibits
published, and the curator's remarks. Inventory totals, category and condition
breakdowns, and exhibit status counts are as of generation time.

For the other reports the period selects records by creation date: date added
(inventory), received (inquiries), submitted (visit requests), or created
(exhibits). Archived exhibits are excluded from exhibit reports. The Audit Log
Report selects entries by the time they were recorded; `auditModule` and
`auditAction` match exactly, ignoring case, and `auditResult` is `SUCCESS`,
`FAILED`, or `DENIED`. Each row shows the time (Philippine time), account and
role, module, action, result, affected record, and the entry's details as
`key: value` text shortened to 300 characters. Generating a report is itself
audited, so a new export includes earlier report generations.

## Request body

```json
{
  "type": "INVENTORY",
  "format": "XLSX",
  "period": "MONTHLY",
  "month": "2026-09",
  "family": "Papilionidae",
  "storageUnitId": "…uuid…"
}
```

- `MONTHLY` needs `month` (`YYYY-MM`), `YEARLY` needs `year`, `CUSTOM` needs
  `from` and `to` (inclusive `YYYY-MM-DD`, at most 10 years), and `ALL_TIME`
  needs nothing.
- Periods follow Philippine time (UTC+8), so September 2026 runs from Manila
  midnight on Sep 1 to Manila midnight on Oct 1.
- Text filters match exactly, ignoring case. `conditionClass` and
  `storageUnitId` must both match the same active lot. `storageUnitId` includes
  child units unless `includeDescendantUnits` is `false`.
- A filter that does not apply to the chosen report is rejected with a `400`,
  not ignored.

## Failures

Invalid requests return `400` with a message the UI can show, for example
"The Consolidated Museum Operations Report needs a monthly, yearly, or custom
period." A detail report that would exceed 10,000 rows is refused with a
message to narrow the period or filters, rather than exported incomplete.
Unexpected errors return `500` with a generic message and no file. Every
failure after body validation is audited with `status: FAILED`.

## Audit record

Each attempt writes one `audit_log` row: `module: "reports"`,
`action: "GENERATE_REPORT"`, `affected_record_type: "report"`, the acting
curator, and `details` holding `reportType`, `format`, `period` (type, label,
start, end), `filters`, `rowCount`, and `fileName`, or `error` on failure
(REQ-4.7-14). Remarks are recorded only as `true`, never their text.

## Output notes

The notes below on page layout, fonts, CSV encoding and printed columns apply
to PDF, DOCX and CSV files generated before 2026-11-12. Current output is
described in "Excel-only reports - 2026-11-12" at the top of this guide.

- Confidential reports (Inventory, Inquiry, Visit-Request, and Audit Log) carry a
  confidentiality notice on the first page and in every page footer or header.
- PDF and DOCX reports are A4 portrait. The first page has a letterhead with
  the University of San Carlos seal on the left, the BioSphere logo on the
  right, and "University of San Carlos / USC Biological Museum" between them.
  The logos are `assets/reports/usc-logo.png` and
  `assets/reports/biosphere-logo.png`, read from the repository root, so a
  deployment must include `assets/` next to `dist/`.
- No printed text is smaller than 12 pt, including table cells, headers,
  footers, and page numbers (`MIN_REPORT_FONT_SIZE`). The renderer tests check
  every font size in the generated PDF and DOCX.
- To fit portrait pages at 12 pt, the printed detail tables have five or six
  columns. Some related fields share one cell on two lines, and a few fields
  appear only in the CSV export:

  | Report | Printed columns | CSV only |
  | --- | --- | --- |
  | Inventory | Accession No., Specimen (scientific / common name), Status, Qty, Condition, Storage Location | Category, Collection, Family, Classification, Public Display, Date Added |
  | Inquiry | Received, Name / Organization, Email / Contact No., Type, Status | Reviewed By |
  | Visit Request | Submitted, Contact Person / Organization, Email / Contact No., Visitors, Status / Schedule | Reviewed By |
  | QR and AR Exhibits | Specimen / Accession No., Status, Published, AR Enabled (with asset count), Media | Public Slug, Created |
  | Audit Log | Recorded, Account / Role, Module / Action, Result, Details (with record type) | Record ID |

  The CSV export keeps every column, one field per column. The Report Scope
  box no longer repeats the reporting period, which is in the report header.
- A table short enough to fit on one page is not split across pages.
- CSV files are UTF-8 with a byte-order mark and CRLF line endings. Cells that
  start with `=`, `+`, `-`, `@`, a tab, or a carriage return get a leading `'`,
  so spreadsheet apps don't run them as formulas.
- PDFs use the built-in Helvetica fonts, which cover Latin-1 (including ñ and
  accented vowels). Characters outside it, such as emoji or ₱, print as `?`.
  Use DOCX when those characters matter.
- Reports are not stored. The history lists past generations; to get the file
  again, generate it again, and it will reflect current data.
