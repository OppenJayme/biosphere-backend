# DCISM Cataloging and Storage — read-only engineering walkthrough

Date: November 12, 2026 (Asia/Singapore). Site: https://biosphere.dcism.org.
User manually authenticated as Curator in a fresh visible Edge session. This is engineering evidence for teammate review, not independent module acceptance or automatic defect closure. Exact running backend/frontend commit identities were not established.

## Scope and results

| Check | Observed result | Assessment |
| --- | --- | --- |
| Storage default view | Active tree visible; Show archived locations unchecked. | Passed for available data. |
| Storage archived toggle and refresh | Toggle enabled; URL retained archived=1; reload retained checked state. Archived group showed “No archived locations.” | Passed toggle/persistence; archived-record cases unavailable. |
| Storage child counts | Selected existing room displayed Active direct children 1 and Archived direct children 0; active child card displayed. | Passed available-data counts/labels. |
| Archived Storage badges, search exclusion, breadcrumbs, child cards and read-only controls | No archived location fixture existed. | Not verified; no fixture created. |
| Specimen selection | Switching from Crucifix crab to Fin whale changed selected details and full-detail link. | Passed. |
| GET filters | Search “Fin whale” plus gender MALE submitted both query values and produced the no-match state. | Passed request/control behavior; no full filter matrix attempted. |
| Clear all | Removed query parameters, cleared search and gender values, and restored 10 data rows (11 table rows including header). | Passed observed stale-value regression check. |
| Specimen details | Fin whale detail loaded recorded core details, taxonomy, provenance, lot summary, cover metadata and attached tag. | Passed read-only rendering. No lot adjustments or history compatibility claim. |
| Media page | Existing image loaded with positive naturalWidth after settling; cover marker and caption/order controls displayed. | Passed existing-image display only. |
| Tags page | Attached Main Gallery tag and 12 reusable suggestions displayed. | Passed read-only display only. |
| Revision history | Revision history heading loaded; no “could not be loaded” message observed. | Passed smoke scope; individual old/new entries not exhaustively compared. |
| Cataloging queue | Cataloging / Records awaiting catalog work loaded with 11 table rows including header; no load-failure message observed. | Passed smoke scope. |

## Safety and diagnostic limits

- No save, archive, import, upload, tag attachment/detachment, metadata update or other record mutation was attempted. No deployment, migration, credential export or server restart occurred.
- Browser request routing blocked non-GET/HEAD requests during Cataloging checks. The guard was explicitly reinstalled with a self-contained handler before entering Specimens.
- The selected-cover preview uses a POST Server Action and showed an error under this guard. This is a guard-induced limitation, not evidence of an application defect. The media-management page's existing image subsequently loaded through the allowed read path.
- An automation URL wait timed out because the selection URL includes #selected-specimen. Subsequent inspection confirmed the correct selected UUID and details. This was a test locator issue, not a selection failure.
- One inspection locator matched two nested main elements; narrowing to the first corrected the inspection. No application change resulted.
- Navigation URL completion can precede settled React content. Checks used subsequent settled DOM observations; early empty rows/reset-link results were not treated as product failures.
- No precise latency measurement or accessibility certification is claimed.

## Remaining acceptance work

1. Deployment owner confirms today's exact backend and frontend SHAs.
2. Reviewer assesses this evidence; archived Storage cases need an existing/approved isolated fixture before they can be accepted.
3. Collection-collision writes, import commit/retry, interrupted-save behavior, duplicate ordering, signed-link expiry/privacy and media write failures remain outside this read-only walkthrough. Refer to their existing isolated regressions and separately authorized evidence; this run does not replace them.
4. Independent Cataloging/Storage owner acceptance remains pending until the reviewer explicitly decides it. Do not mark all associated defects closed from this report.

Browser commands used the pinned local entry point: `node tools/browser/cli.mjs -s=dcism-signoff-readonly-20261112 run-code ...`. Only sanitized observations are recorded here; no passwords, session state, private signed URLs or visitor records are included. The signed-in browser was left open at the Cataloging queue for the user.
