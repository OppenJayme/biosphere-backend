# Backend progress report intake - 2026-11-05

Source supplied by Kyer: `BioSphere Backend Progress_11_5_2026.pdf`, six pages.
The document reports November 3-4 checks against backend develop `06545c0`,
a local build connected to hosted Supabase, with Curator/Developer access.
Its findings are attributed to the report, not newly executed or independently
reproduced by the integrating agent. No instructions in the report authorize
deployment, account policy changes, feature activation or shared database writes.

## Findings and disposition

| Finding | Evidence and current disposition | Next action / ownership |
| --- | --- | --- |
| DEF-030 lot-history failure | Pages 4-5 report 200, both retained history entries and a working Lots page for the affected accession. Added to the existing defect; no duplicate issue. Tester/frontend build and deployed target identity are not supplied. | John/Inventory reviews remaining control, report grouping and storage-history scope and records disposition. Preserve the reported local pass; deployment verification is separate. |
| Exhibit HTTP tests inherit local public URL | Pages 3-4 report three failures with local `PUBLIC_SITE_URL`; all 77 exhibit tests pass with the default URL. Source inspection finds default-URL expectations and no explicit test-local URL pin. Not reproduced in this intake. | Exhibit/test maintainer: pin configuration in the isolated test, preserve/restore environment as necessary and run with an alternate synthetic URL to verify independence. Do not change live settings. |
| Temporary tunnel URL in printed QR links | Page 4 reports a temporary tunnel configured locally. Expiry would invalidate printed destinations. The configured URL is not copied here or independently inspected. | Release owner verifies a permanent public destination before printing/deploying labels; no claim existing labels are broken. |
| Pending curator invitations appear Active | Pages 2 and 5 report eight ACTIVE accounts without invitation state. Not reproduced here and not proof those accounts bypass onboarding. | Voltaire/Auth: review invitation visibility contract and UI; keep separate from authorization. |
| Visit completed before approved date | Page 5 describes a test visit approved for November 11 but already Completed. It is a policy observation, not an established violation without an agreed date rule. | Charles/Visits obtains policy disposition before changing transitions. No existing visit edited. |
| Six unused lint suppressions | Pages 3 and 5 identify four test files and six warnings, no errors. Not rerun here. | Test maintainers may remove verified unused directives in a small cleanup; not a release blocker by itself. |
| Real backup/recovery absent | Pages 2 and 5 distinguish read-only history from operational backups, restores and alerts. Existing BAK-002 is Deferred, not a newly discovered defect. | Agree owner, safe backup procedure, artifact handling/retention and owned restore target before executing backup/recovery work. History metadata tests do not substitute for restoration. |

## Evidence qualifications

- The 93% and module percentages are the report's implementation estimates,
  using its done/partial/missing scoring. They are not acceptance percentages.
  A requirement-by-requirement calculation was not independently reconstructed.
- The report lists 703 unit passes, 440 initial HTTP passes and three initial
  HTTP failures, then a passing 77-case exhibit rerun. Retain this sequence;
  do not describe it as one uninterrupted 1,146-pass run. Seventeen opt-in live
  tests were skipped, and Docker database tests were not run by that reporter.
- The 210 figure comprises 140 signed-out plus 70 Curator calls; Developer
  checks are described separately. Protected 401/403 responses and local
  read-only success do not prove authorized mutations, provider delivery,
  deployed security configuration or production performance.
- The source predates merged #230 and pending #231/#232. It cannot certify
  their behavior. Their separate owned SQL evidence remains separately scoped.
- No existing defect becomes globally Verified and no module sign-off changes
  solely because this report says a module is code-complete. Named owners and
  reviewers decide acceptance from the combined evidence and stated limits.

## Finite closeout order

1. Review #231 archive-read repair and #232 complete legacy-restoration SQL
   evidence. At this intake both have green CI and no review comments; neither
   is merged. Ordinary CI does not run their opt-in Docker suites.
2. Finish the existing Cataloging/Storage sign-off decisions, including archived
   duplicate scope and John's Inventory-side storage restriction result. Reuse
   earlier successful evidence rather than restarting every test.
3. Repair the small exhibit-test configuration issue in its own scoped change,
   and route invitation/visit observations to their owners.
4. Resolve the operational backup/recovery scope and approval gates, then carry
   out the approved work. Do not enable features or run a shared restore merely
   to improve the report's percentage.

This intake is documentation and source comparison only. It performed no API
calls, browser changes, migrations, emails, record edits or server restarts.
