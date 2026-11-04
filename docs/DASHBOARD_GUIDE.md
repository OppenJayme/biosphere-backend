# BioSphere Curator Dashboard Guide

## Archive-read consistency - 2026-11-04

The active category/possible-duplicate breakdowns and Cataloging queue now
require null `archived_at` as well as the relevant non-archived status. Historical
all-record totals, stored-status distributions, additions/trends and recent
history are unchanged. This is the user-authorized, John/Charles-owned downstream
[DEF-032 repair](./TEST_DEFECT_LOG.md#def-032---timestamp-only-archives-leak-into-active-catalog-and-breakdowns),
with owned PostgreSQL/public-service evidence; it is not whole-module acceptance.

`GET /dashboard/summary` gives the curator dashboard (SRS §4.3) its totals and
short lists in one request. Every number is computed in the database, so the
dashboard no longer downloads full specimen, inquiry, or visit-request lists to
count them in the browser. The module adds no tables and changes no records.

## Access

Authenticated, active `CURATOR` accounts only. Developer accounts get `403`.
Responses are sent with `Cache-Control: no-store`.

## Response

| Field | Meaning |
| --- | --- |
| `specimens.total`, `specimens.byStatus` | All specimen records, and counts for `UNCATALOGED`, `CATALOGED`, and `ARCHIVED` (REQ-4.3-01) |
| `specimens.addedThisMonth` | Records created since midnight on the 1st of this month, Philippine time |
| `specimens.byCategory` | Active (non-archived) records by specimen category, largest first. Blank categories count as `Uncategorized`; spellings that differ only in case are merged under the most common spelling |
| `specimens.addedByMonth` | Records created in each of the last 12 Philippine-time months, oldest first, as `{ month: "YYYY-MM", count }` |
| `specimens.possibleDuplicates` | Active records whose scientific name and category (ignoring case and surrounding spaces) match another active record. A review prompt only; the catalog's own duplicate check (REQ-4.4-21/22) is separate |
| `submissions.pendingInquiries`, `submissions.pendingVisitRequests` | Inquiries and visit requests still `PENDING` (REQ-4.3-02) |
| `exhibits.total` | Exhibit pages that are not archived |
| `exhibits.live` | Published pages whose specimen is Cataloged and approved for public display, so the QR link resolves |
| `exhibits.publishedUnavailable` | Published pages whose specimen is no longer eligible, so the QR link does not resolve |
| `exhibits.unpublished`, `exhibits.disabled` | Counts by status |
| `exhibits.pending` | Up to 3 most recently updated unpublished pages (`id`, `publicSlug`) |
| `catalogingQueue` | Up to 5 most recently updated Uncataloged records |
| `recentSpecimens` | Up to 7 most recently updated records of any status |

Queue and recent rows carry the specimen's identifiers, names, category,
status, public-display flag, `updatedAt`, and the storage path
(`Room › Cabinet › Drawer`) and condition of its largest active lot, or `null`
when it has no active lot.

## Not included

- Storage-unit lists and recent audit activity stay on their own bounded
  endpoints (`/storage-locations/search`, `/audit-logs`).
- Offline draft sync state lives in the curator's browser (IndexedDB), so the
  frontend reads it there, not from this endpoint.
- [Optional per-curator read/dismiss state](./NOTIFICATION_STATE_GUIDE.md)
  (REQ-4.3-07) lives on the notification API, not this summary endpoint.
  Its migration/feature activation remains separate; pending-work counts do
  not decrease merely because a notification is read or dismissed.
