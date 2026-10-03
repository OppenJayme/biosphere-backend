# BioSphere Reports Guide

This module implements the reports and export portion of SRS Section 4.7
(REQ-4.7-04 to REQ-4.7-16) for the five approved core report types in §4.7.4.
Search and filtering of inventory tables (REQ-4.7-01 to 4.7-03) live in the
specimen search endpoints, not here. The module adds no tables: it reads
existing records and records every generation in `public.audit_log`.

## Access

Every route requires an authenticated, active `CURATOR`. Reports carry private
visitor details and internal storage locations (REQ-4.7-13), so none of them
are public or available to Developer accounts.

## Endpoints

- `GET /reports`: the five report types with their allowed formats, periods,
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
| `CONSOLIDATED_OPERATIONS` | DOCX, PDF | MONTHLY, YEARLY, CUSTOM | `remarks` |
| `INVENTORY` | PDF, CSV, DOCX | any | `specimenStatus`, `category`, `kingdom`, `phylum`, `taxonClass`, `taxonOrder`, `family`, `genus`, `species`, `conditionClass`, `storageUnitId`, `includeDescendantUnits`, `publicDisplay` |
| `INQUIRY_SUMMARY` | PDF, CSV, DOCX | any | `inquiryStatus`, `inquiryType` |
| `VISIT_REQUEST_SUMMARY` | PDF, CSV, DOCX | any | `visitStatus` |
| `QR_AR_EXHIBITS` | PDF, CSV, DOCX | any | `exhibitStatus`, `arEnabled` |

The Consolidated report is summary tables only, so it has no CSV export. Its
DOCX is a separate editable file; editing it never changes BioSphere records
(REQ-4.7-16).

The Consolidated report covers, for the period: specimens added, catalog
completions, specimens archived, lot activity and quantity adjustments,
inquiries by status and type, visit requests and visitors by status, exhibits
published, and the curator's remarks. Inventory totals, category and condition
breakdowns, and exhibit status counts are as of generation time.

For the other reports the period selects records by creation date: date added
(inventory), received (inquiries), submitted (visit requests), or created
(exhibits). Archived exhibits are excluded from exhibit reports.

## Request body

```json
{
  "type": "INVENTORY",
  "format": "PDF",
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
"The Consolidated Museum Operations Report is not available as CSV. Choose DOCX
or PDF." A detail report that would exceed 10,000 rows is refused with a
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

- Confidential reports (Inventory, Inquiry, and Visit-Request) carry a
  confidentiality notice on the first page and in every page footer or header.
- Tables with more than six columns use landscape A4 pages.
- CSV files are UTF-8 with a byte-order mark and CRLF line endings. Cells that
  start with `=`, `+`, `-`, `@`, a tab, or a carriage return get a leading `'`,
  so spreadsheet apps don't run them as formulas.
- PDFs use the built-in Helvetica fonts, which cover Latin-1 (including ñ and
  accented vowels). Characters outside it, such as emoji or ₱, print as `?`.
  Use DOCX when those characters matter.
- Reports are not stored. The history lists past generations; to get the file
  again, generate it again, and it will reflect current data.
