# BioSphere backend progress report

**Date:** 2026-11-05 · **Commit:** `develop` @ `be0571f` · **SRS:** v0.10, section 4 · **Compared with:** frontend progress report, 4 Nov 2026

## Result

**The backend meets 88.9% of the SRS requirements it is responsible for.** 151 of 170 backend requirements are Done, 10 are Partial and 9 are Not Started. Another 22 requirements have no backend behavior and are left out of the score.

Tests: **1734 passed, 24 failed, 12 inconclusive** across all 140 API operations. All 24 failures are real gaps or defects. The largest gap is backup and restore. The most urgent defect is in onboarding: a curator invited by a Developer gets full access before setting a password.

**The last progress report is not an accurate picture of the backend.** It claimed 95%; the verified figure is 88.9%, a gap of -6.1 points. It is a frontend report, so its sections do not measure the backend. See [Comparison with Last Progress Report](#comparison-with-last-progress-report).

### How the percentage is calculated

```
Module % = sum of weights of Done requirements / sum of weights of backend requirements x 100
Overall % = the same formula across all modules
Weight: High = 2, Medium = 1. Partial and Not Started earn 0. Frontend-only requirements are excluded.
Overall = 296 / 333 = 88.9%
```

A requirement is Done only when every test tagged to it passes, Partial when some pass and some fail, and Not Started when nothing exists. REQ-4.15-07 is scored Not Started by hand: one adjacent check passes, but no backups exist to protect.

## Module summary

| Module | Owner | Verified % | Weight done | Tests passed | Tests failed | Last report % | Alignment |
| --- | --- | --- | --- | --- | --- | --- | --- |
| §4.1 Authentication and accounts | Voltaire | 64.9% | 24/37 | 67 | 9 | 75% | Aligned |
| §4.2 Developer functions | Voltaire | 77.8% | 14/18 | 111 | 6 | 100% | Overstated |
| §4.3 Dashboard and notifications | Charles, John | 86.7% | 13/15 | 44 | 1 | 89% | Aligned |
| §4.4 Inventory and cataloging | Kyer, Ivan | 100.0% | 46/46 | 442 | 0 | 100% | Aligned |
| §4.5 Lots and quantities | John | 100.0% | 22/22 | 137 | 0 | 100% | Aligned |
| §4.6 Storage locations | Kyer, Ivan | 91.3% | 21/23 | 160 | 1 | 100% | Overstated |
| §4.7 Search, reports and export | John | 100.0% | 31/31 | 136 | 0 | 100% | Aligned |
| §4.8 General inquiries | Charles, John | 100.0% | 22/22 | 99 | 0 | 100% | Aligned |
| §4.9 Visit requests | Charles | 100.0% | 31/31 | 113 | 0 | 100% | Aligned |
| §4.10 Public website | Charles, John, Voltaire | 100.0% | 2/2 | 13 | 0 | 100% | Aligned |
| §4.11 FAQ assistant | Kyer | 100.0% | 16/16 | 134 | 0 | 100% | Aligned |
| §4.12 QR exhibits | Voltaire | 100.0% | 23/23 | 184 | 0 | 100% | Aligned |
| §4.13 WebAR | Voltaire | 100.0% | 13/13 | 11 | 0 | 100% | Aligned |
| §4.14 Offline drafts and sync | Kyer | 100.0% | 10/10 | 20 | 0 | 100% | Aligned |
| §4.15 Audit, backup and recovery | Kyer | 33.3% | 8/24 | 63 | 7 | 83% | Aligned |

Module test counts group each call by the module that owns its endpoint. Requirement rows below count a check once per tagged requirement, so they do not add up to the totals here.

### Progress by owner

| Owner | Verified % | Weight done | Modules |
| --- | --- | --- | --- |
| Voltaire | 81.7% | 76/93 | §4.1, §4.2, §4.10, §4.12, §4.13 |
| Charles | 97.1% | 68/70 | §4.3, §4.8, §4.9, §4.10 |
| John | 97.8% | 90/92 | §4.3, §4.5, §4.7, §4.8, §4.10 |
| Kyer | 84.9% | 101/119 | §4.4, §4.6, §4.11, §4.14, §4.15 |
| Ivan | 97.1% | 67/69 | §4.4, §4.6 |

A shared module counts in full for each owner. Owners come from `docs/ACCEPTANCE_TEST_PLAN.md` section 3. `CLAUDE.md` says ownership is not the latest Git author, so Git was used only as a cross-check. The acceptance plan has no line for §4.2 Developer functions; it is listed under Voltaire because it falls under their authentication and WebAR assignments, the 4 Nov report assigns it to them, and they wrote 17 of its 27 commits (GitHub `Raidiniom`). No module is Unassigned.

## How this was tested

Everything ran locally on a throwaway stack, and no shared data was touched.

| Item | Setup |
| --- | --- |
| Server | Current source compiled outside the repo, so `dist/` is unchanged; started from a folder with no `.env` |
| Database | Fresh Supabase Postgres 17 in Docker, stored in memory; all 10 repo migrations applied cleanly |
| Auth | Real GoTrue with real signed tokens, not mocks |
| Storage | Real Supabase Storage, with uploads confirmed in `storage.objects` |
| Email | Hardcoded Brevo URL redirected to a local sink, so sends and forced failures could be inspected; GoTrue mail went to Mailpit |
| Network | A preload script blocked every non-loopback connection; 0 attempts were recorded |
| Database checks | `pg` queries after each write confirmed the change reached the database |

Every route was called with no JWT, a garbage JWT, an expired JWT and a forged signature, and protected routes also with an inactive account and the wrong role. Every route that takes input then got unknown IDs, malformed IDs, bad queries or malformed JSON, and none returned a 5xx.

The repo's own suites also pass with hosted values overridden: **unit 715/715, e2e 445 passed and 17 skipped (the opt-in live Developer suite), `tsc` clean.** The e2e run used a 30-second timeout, so it says nothing about the 28 Oct QR test timing issue.

### What this does not prove

- **Hosted settings were not read.** Invite and reset expiry, email templates, signup settings and RLS on the hosted Supabase project are unverified.
- **Real Brevo delivery was not tested.** The backend's email path works, but BBT's delivery failure on the hosted environment may have its own cause.
- **The feature flags were turned on.** `FAQ_REVIEW_ENABLED` and `NOTIFICATION_STATE_ENABLED` were `true` for this run. `.env.example` has them off and your local `.env` does not set the notification flag, so REQ-4.3-07 answers 503 under that configuration.
- **Local GoTrue differs from hosted behavior in one way.** It stores a random hash for invited users, so the "password not set" guard could not be tested (T0819). The guard reads a provider-internal column (`auth.service.ts:140`), which is a risk at the next provider upgrade.
- **Nonfunctional requirements are out of scope.** SRS section 5 was not tested, so the 28 Oct response-time concern is still open.
- **The disposable `test:*:db` suites were not run.** Their pinned Postgres image is not on this machine. The stack here covers the same ground at the HTTP level but does not replace their concurrency checks.
- **Done means this test pass found no gap.** It is not acceptance sign-off. Every module's sign-off is still Pending, and REQ-4.4-21 is waiting on a Curator/SRS decision (CAT-014).

## Requirements by module

### §4.1 Authentication and accounts: 64.9%

| Requirement | Title | Priority | Status | Tests pass / fail | Owner | Note |
| --- | --- | --- | --- | --- | --- | --- |
| REQ-4.1-01 | Authenticate active curators | High | Done | 9 / 0 | Voltaire |  |
| REQ-4.1-02 | Separate credentials per curator | High | Done | 8 / 0 | Voltaire |  |
| REQ-4.1-03 | No public self-registration | High | Done | 2 / 0 | Voltaire |  |
| REQ-4.1-04 | Protected session after login | High | Done | 4 / 0 | Voltaire |  |
| REQ-4.1-05 | Logout and inactivity timeout | High | Partial | 3 / 1 | Voltaire | Logout works through Supabase. No inactivity timeout in the backend. |
| REQ-4.1-06 | Block unauthenticated access | High | Done | 521 / 0 | Voltaire |  |
| REQ-4.1-07 | Curator invites curator by email | High | Done | 15 / 0 | Voltaire | Curator path works end to end. See the inconclusive password-guard note. |
| REQ-4.1-08 | Curator activates or deactivates curator | High | Not Started | 0 / 2 | Voltaire | No route. Only developers can change status. |
| REQ-4.1-09 | Succession or handover | High | Partial | 1 / 1 | Voltaire | Separate account available; no handover operation. |
| REQ-4.1-10 | Email password recovery | High | Done | 4 / 0 | Voltaire | Runs in Supabase, proven on local GoTrue. Hosted template not read. |
| REQ-4.1-11 | Audit account actions without secrets | High | Partial | 2 / 2 | Voltaire | Invite and onboarding audited. Recovery, reset and password change are not. |
| REQ-4.1-12 | Inactive accounts cannot authenticate | High | Done | 141 / 0 | Voltaire |  |
| REQ-4.1-13 | Authenticate developers | High | Done | 1 / 0 | Voltaire |  |
| REQ-4.1-14 | Role separation | High | Done | 130 / 0 | Voltaire |  |
| REQ-4.1-15 | Record authentication attempts | High | Done | 7 / 0 | Voltaire |  |
| REQ-4.1-16 | Change own password | High | Not Started | 0 / 1 | Voltaire | No backend route or audit. |
| REQ-4.1-17 | No passwords in email | High | Done | 11 / 0 | Voltaire |  |
| REQ-4.1-18 | Password-change confirmation email | Medium | Not Started | 0 / 1 | Voltaire | Nothing sends it. |
| REQ-4.1-19 | Links expire and are single use | High | Partial | 9 / 1 | Voltaire | Single use proven. Approved expiry period not defined in the repo. |

### §4.2 Developer functions: 77.8%

| Requirement | Title | Priority | Status | Tests pass / fail | Owner | Note |
| --- | --- | --- | --- | --- | --- | --- |
| REQ-4.2-01 | Authenticate developer | High | Done | 1 / 0 | Voltaire |  |
| REQ-4.2-02 | Provision initial curator | High | Partial | 4 / 3 | Voltaire | Works, with three defects: no onboarding gate, 500 on a pending invitee, pending shown as Active. |
| REQ-4.2-03 | Status change with recorded authorization | High | Done | 11 / 0 | Voltaire |  |
| REQ-4.2-04 | Manage AR assets | High | Done | 14 / 0 | Voltaire |  |
| REQ-4.2-05 | Validate AR asset | High | Partial | 9 / 3 | Voltaire | Backend checks type, size, magic bytes, authorization. External-reference GLBs pass the API. |
| REQ-4.2-06 | No specimen record access | High | Done | 120 / 0 | Voltaire |  |
| REQ-4.2-07 | No routine curator modules | High | Done | 120 / 0 | Voltaire |  |
| REQ-4.2-08 | Developer surface limited | High | Done | 11 / 0 | Voltaire |  |
| REQ-4.2-09 | Audit developer actions | High | Done | 13 / 0 | Voltaire |  |

### §4.3 Dashboard and notifications: 86.7%

| Requirement | Title | Priority | Status | Tests pass / fail | Owner | Note |
| --- | --- | --- | --- | --- | --- | --- |
| REQ-4.3-01 | Specimen and category counts | High | Done | 4 / 0 | Charles, John |  |
| REQ-4.3-02 | Pending inquiries and visits | High | Done | 2 / 0 | Charles, John |  |
| REQ-4.3-03 | Sync state display | High | N/A | 0 / 0 | Charles, John | Frontend only: Client connection and sync state display |
| REQ-4.3-04 | Quick actions | High | N/A | 0 / 0 | Charles, John | Frontend only: Dashboard quick-action buttons |
| REQ-4.3-05 | In-system notifications | High | Partial | 5 / 1 | Charles, John | Feed has inquiries, visits, failed emails. No sync-failure source. |
| REQ-4.3-06 | Open record from notification | High | Done | 6 / 0 | Charles, John |  |
| REQ-4.3-07 | Mark read or dismissed | Medium | Done | 9 / 0 | Charles, John | Passes with NOTIFICATION_STATE_ENABLED=true. Defaults off; answers 503 otherwise. |
| REQ-4.3-08 | No private data in notifications | High | Done | 3 / 0 | Charles, John |  |
| REQ-4.3-09 | Email alerts for new submissions | High | Done | 3 / 0 | Charles, John | Email reached the local sink. Hosted Brevo delivery not tested. |
| REQ-4.3-10 | Internal alerts stay in-system | High | Done | 1 / 0 | Charles, John |  |

### §4.4 Inventory and cataloging: 100.0%

| Requirement | Title | Priority | Status | Tests pass / fail | Owner | Note |
| --- | --- | --- | --- | --- | --- | --- |
| REQ-4.4-01 | Create and save specimen | High | Done | 14 / 0 | Kyer, Ivan |  |
| REQ-4.4-02 | System specimen ID | High | Done | 3 / 0 | Kyer, Ivan |  |
| REQ-4.4-03 | Nullable accession number | High | Done | 3 / 0 | Kyer, Ivan |  |
| REQ-4.4-04 | Accession uniqueness | High | Done | 6 / 0 | Kyer, Ivan |  |
| REQ-4.4-05 | Three specimen statuses | High | Done | 5 / 0 | Kyer, Ivan |  |
| REQ-4.4-06 | Incomplete means Uncataloged | High | Done | 3 / 0 | Kyer, Ivan |  |
| REQ-4.4-07 | Cataloged only when complete | High | Done | 15 / 0 | Kyer, Ivan |  |
| REQ-4.4-08 | Identify missing fields | High | Done | 10 / 0 | Kyer, Ivan |  |
| REQ-4.4-09 | View and edit records | High | Done | 20 / 0 | Kyer, Ivan |  |
| REQ-4.4-10 | Archive instead of delete | High | Done | 10 / 0 | Kyer, Ivan |  |
| REQ-4.4-11 | Uncataloged and Archived not public | High | Done | 24 / 0 | Kyer, Ivan |  |
| REQ-4.4-12 | Specimen images | High | Done | 18 / 0 | Kyer, Ivan |  |
| REQ-4.4-13 | Images optional | High | Done | 2 / 0 | Kyer, Ivan |  |
| REQ-4.4-14 | Stored as entered by curator | High | Done | 15 / 0 | Kyer, Ivan |  |
| REQ-4.4-15 | Public-display flag | High | Done | 5 / 0 | Kyer, Ivan |  |
| REQ-4.4-16 | Flag does not publish full record | High | Done | 5 / 0 | Kyer, Ivan |  |
| REQ-4.4-17 | Creator, editor, archive metadata | High | Done | 12 / 0 | Kyer, Ivan |  |
| REQ-4.4-18 | Manual encoding | High | Done | 10 / 0 | Kyer, Ivan |  |
| REQ-4.4-19 | Spreadsheet or CSV import | High | Done | 15 / 0 | Kyer, Ivan |  |
| REQ-4.4-20 | Validate import rows | High | Done | 15 / 0 | Kyer, Ivan |  |
| REQ-4.4-21 | Duplicate warnings | High | Done | 8 / 0 | Kyer, Ivan | Works per the written rule. Curator/SRS disposition still open (CAT-014). |
| REQ-4.4-22 | No automatic merge or delete | High | Done | 7 / 0 | Kyer, Ivan |  |
| REQ-4.4-23 | Separate records for same species | High | Done | 7 / 0 | Kyer, Ivan |  |

### §4.5 Lots and quantities: 100.0%

| Requirement | Title | Priority | Status | Tests pass / fail | Owner | Note |
| --- | --- | --- | --- | --- | --- | --- |
| REQ-4.5-01 | Multiple lots per specimen | High | Done | 7 / 0 | John |  |
| REQ-4.5-02 | Lot location, condition, positive quantity | High | Done | 8 / 0 | John |  |
| REQ-4.5-03 | Calculated total | High | Done | 15 / 0 | John |  |
| REQ-4.5-04 | Partial move | High | Done | 4 / 0 | John |  |
| REQ-4.5-05 | Partial condition change | High | Done | 4 / 0 | John |  |
| REQ-4.5-06 | Total unchanged by moves | High | Done | 8 / 0 | John |  |
| REQ-4.5-07 | Merge into matching lot | High | Done | 4 / 0 | John |  |
| REQ-4.5-08 | Reject excess quantity | High | Done | 3 / 0 | John |  |
| REQ-4.5-09 | Authorized quantity changes only | High | Done | 14 / 0 | John |  |
| REQ-4.5-10 | Reasons recorded | High | Done | 18 / 0 | John |  |
| REQ-4.5-11 | Split and merge record | High | Done | 7 / 0 | John |  |

### §4.6 Storage locations: 91.3%

| Requirement | Title | Priority | Status | Tests pass / fail | Owner | Note |
| --- | --- | --- | --- | --- | --- | --- |
| REQ-4.6-01 | Storage unit types | High | Done | 21 / 0 | Kyer, Ivan |  |
| REQ-4.6-02 | Manage storage units | High | Done | 27 / 0 | Kyer, Ivan |  |
| REQ-4.6-03 | Parent-child hierarchy | High | Done | 17 / 0 | Kyer, Ivan |  |
| REQ-4.6-04 | Unit fields | High | Done | 17 / 0 | Kyer, Ivan |  |
| REQ-4.6-05 | Only holding units take lots | High | Done | 3 / 0 | Kyer, Ivan |  |
| REQ-4.6-06 | Move lot quantity | High | Done | 4 / 0 | Kyer, Ivan |  |
| REQ-4.6-07 | Move container | High | Done | 4 / 0 | Kyer, Ivan |  |
| REQ-4.6-08 | Derive room from hierarchy | High | Done | 2 / 0 | Kyer, Ivan |  |
| REQ-4.6-09 | Record lot movements | High | Done | 8 / 0 | Kyer, Ivan |  |
| REQ-4.6-10 | Storage kept off public outputs | High | Done | 4 / 0 | Kyer, Ivan |  |
| REQ-4.6-11 | Capacity warning | Medium | Done | 7 / 0 | Kyer, Ivan |  |
| REQ-4.6-12 | Reject cycles and invalid combinations | High | Partial | 2 / 1 | Kyer, Ivan | Cycles rejected. No allowed-type matrix, so a room can nest in a box. |

### §4.7 Search, reports and export: 100.0%

| Requirement | Title | Priority | Status | Tests pass / fail | Owner | Note |
| --- | --- | --- | --- | --- | --- | --- |
| REQ-4.7-01 | Search | High | Done | 12 / 0 | John |  |
| REQ-4.7-02 | Filter | High | Done | 33 / 0 | John |  |
| REQ-4.7-03 | Sort | High | Done | 4 / 0 | John |  |
| REQ-4.7-04 | Report options | High | Done | 7 / 0 | John |  |
| REQ-4.7-05 | Consolidated report | High | Done | 6 / 0 | John |  |
| REQ-4.7-06 | Consolidated report contents | High | Done | 10 / 0 | John |  |
| REQ-4.7-07 | Inventory report | High | Done | 11 / 0 | John |  |
| REQ-4.7-08 | Inquiry summary | High | Done | 4 / 0 | John |  |
| REQ-4.7-09 | Visit summary | High | Done | 4 / 0 | John |  |
| REQ-4.7-10 | QR and AR report | High | Done | 5 / 0 | John |  |
| REQ-4.7-11 | DOCX export | High | Done | 2 / 0 | John |  |
| REQ-4.7-12 | PDF and CSV output | Medium | Done | 12 / 0 | John |  |
| REQ-4.7-13 | Private data only in internal reports | High | Done | 5 / 0 | John |  |
| REQ-4.7-14 | Audit report generation | High | Done | 5 / 0 | John |  |
| REQ-4.7-15 | Validate report parameters | High | Done | 6 / 0 | John |  |
| REQ-4.7-16 | DOCX is a separate file | High | Done | 2 / 0 | John |  |

### §4.8 General inquiries: 100.0%

| Requirement | Title | Priority | Status | Tests pass / fail | Owner | Note |
| --- | --- | --- | --- | --- | --- | --- |
| REQ-4.8-01 | Public inquiry form | High | Done | 2 / 0 | Charles, John |  |
| REQ-4.8-02 | Minimum data collected | High | Done | 7 / 0 | Charles, John |  |
| REQ-4.8-03 | Validate inquiry | High | Done | 7 / 0 | Charles, John |  |
| REQ-4.8-04 | Store inquiry with consent | High | Done | 3 / 0 | Charles, John |  |
| REQ-4.8-05 | Curator view, search, reply | High | Done | 9 / 0 | Charles, John |  |
| REQ-4.8-06 | Inquiry statuses | High | Done | 12 / 0 | Charles, John |  |
| REQ-4.8-07 | Manual referral | High | Done | 5 / 0 | Charles, John |  |
| REQ-4.8-08 | Alert and email curator | High | Done | 2 / 0 | Charles, John |  |
| REQ-4.8-09 | Send and record replies | High | Done | 7 / 0 | Charles, John |  |
| REQ-4.8-10 | Inquiries not public | High | Done | 23 / 0 | Charles, John |  |
| REQ-4.8-11 | Record inquiry history | High | Done | 14 / 0 | Charles, John |  |

### §4.9 Visit requests: 100.0%

| Requirement | Title | Priority | Status | Tests pass / fail | Owner | Note |
| --- | --- | --- | --- | --- | --- | --- |
| REQ-4.9-01 | Public visit form | High | Done | 2 / 0 | Charles |  |
| REQ-4.9-02 | One or more schedules | High | Done | 12 / 0 | Charles |  |
| REQ-4.9-03 | Schedules as child rows | High | Done | 3 / 0 | Charles |  |
| REQ-4.9-04 | Collect request details | High | Done | 2 / 0 | Charles |  |
| REQ-4.9-05 | Optional vehicles | High | Done | 3 / 0 | Charles |  |
| REQ-4.9-06 | Validate request | High | Done | 10 / 0 | Charles |  |
| REQ-4.9-07 | Alert and email curator | High | Done | 1 / 0 | Charles |  |
| REQ-4.9-08 | Curator view and search | High | Done | 7 / 0 | Charles |  |
| REQ-4.9-09 | Visit statuses | High | Done | 14 / 0 | Charles |  |
| REQ-4.9-10 | Request more information | High | Done | 6 / 0 | Charles |  |
| REQ-4.9-11 | Send and record messages | High | Done | 7 / 0 | Charles |  |
| REQ-4.9-12 | Campus-entry summary | High | Done | 3 / 0 | Charles |  |
| REQ-4.9-13 | No direct ISMIS submission | High | Done | 4 / 0 | Charles |  |
| REQ-4.9-14 | Record visit history | High | Done | 18 / 0 | Charles |  |
| REQ-4.9-15 | Personal data restricted | High | Done | 20 / 0 | Charles |  |
| REQ-4.9.16 | Select schedule, keep the others | Medium | Done | 5 / 0 | Charles |  |

### §4.10 Public website: 100.0%

| Requirement | Title | Priority | Status | Tests pass / fail | Owner | Note |
| --- | --- | --- | --- | --- | --- | --- |
| REQ-4.10-01 | Home, Gallery, Visit, About | High | N/A | 0 / 0 | Charles, John, Voltaire | Frontend only: Static pages |
| REQ-4.10-02 | Plan Your Visit action | High | N/A | 0 / 0 | Charles, John, Voltaire | Frontend only: Navigation action |
| REQ-4.10-03 | No Events page | High | N/A | 0 / 0 | Charles, John, Voltaire | Frontend only: Page set |
| REQ-4.10-04 | Curated Gallery | High | N/A | 0 / 0 | Charles, John, Voltaire | Frontend only: Static Gallery content |
| REQ-4.10-05 | Visit guidance | High | N/A | 0 / 0 | Charles, John, Voltaire | Frontend only: Visit page content |
| REQ-4.10-06 | About content | High | N/A | 0 / 0 | Charles, John, Voltaire | Frontend only: About page content |
| REQ-4.10-07 | Static, not editable in app | High | N/A | 0 / 0 | Charles, John, Voltaire | Frontend only: Static frontend content |
| REQ-4.10-08 | No internal data exposed | High | Done | 13 / 0 | Charles, John, Voltaire |  |
| REQ-4.10-09 | Responsive layouts | High | N/A | 0 / 0 | Charles, John, Voltaire | Frontend only: Responsive layout |
| REQ-4.10-10 | Changes need redeployment | High | N/A | 0 / 0 | Charles, John, Voltaire | Frontend only: Frontend redeployment process |

### §4.11 FAQ assistant: 100.0%

| Requirement | Title | Priority | Status | Tests pass / fail | Owner | Note |
| --- | --- | --- | --- | --- | --- | --- |
| REQ-4.11-01 | Public FAQ assistant | High | Done | 8 / 0 | Kyer |  |
| REQ-4.11-02 | Manage FAQ knowledge | High | Done | 17 / 0 | Kyer |  |
| REQ-4.11-03 | Alternatives, keywords, categories | High | Done | 17 / 0 | Kyer |  |
| REQ-4.11-04 | Answers only from active entries | High | Done | 16 / 0 | Kyer |  |
| REQ-4.11-05 | No invented answers or transactions | High | Done | 7 / 0 | Kyer |  |
| REQ-4.11-06 | Fallback to General Inquiry | High | Done | 7 / 0 | Kyer |  |
| REQ-4.11-07 | No personal data | High | Done | 5 / 0 | Kyer |  |
| REQ-4.11-08 | Needs internet | High | N/A | 0 / 0 | Kyer | Frontend only: Browser connectivity |
| REQ-4.11-09 | Audit knowledge changes | High | Done | 2 / 0 | Kyer |  |
| REQ-4.11-10 | Scope notice | High | N/A | 0 / 0 | Kyer | Frontend only: Assistant UI wording |

### §4.12 QR exhibits: 100.0%

| Requirement | Title | Priority | Status | Tests pass / fail | Owner | Note |
| --- | --- | --- | --- | --- | --- | --- |
| REQ-4.12-01 | Exhibit lifecycle | High | Done | 28 / 0 | Voltaire |  |
| REQ-4.12-02 | Public approval required | High | Done | 3 / 0 | Voltaire |  |
| REQ-4.12-03 | Control public content | High | Done | 20 / 0 | Voltaire |  |
| REQ-4.12-04 | Unique public URL | High | Done | 19 / 0 | Voltaire |  |
| REQ-4.12-05 | Printable QR | High | Done | 6 / 0 | Voltaire |  |
| REQ-4.12-06 | Printable label | High | Done | 2 / 0 | Voltaire |  |
| REQ-4.12-07 | Outside public navigation | High | Done | 1 / 0 | Voltaire |  |
| REQ-4.12-08 | Restricted fields hidden | High | Done | 3 / 0 | Voltaire |  |
| REQ-4.12-09 | Safe unavailable state | High | Done | 12 / 0 | Voltaire |  |
| REQ-4.12-10 | Stable URL | Medium | Done | 5 / 0 | Voltaire |  |
| REQ-4.12-11 | Audit publication | High | Done | 9 / 0 | Voltaire |  |
| REQ-4.12-12 | Direct URL access | High | Done | 3 / 0 | Voltaire |  |

### §4.13 WebAR: 100.0%

| Requirement | Title | Priority | Status | Tests pass / fail | Owner | Note |
| --- | --- | --- | --- | --- | --- | --- |
| REQ-4.13-01 | AR for approved exhibits only | High | Done | 3 / 0 | Voltaire |  |
| REQ-4.13-02 | Curator selects for AR | High | Done | 4 / 0 | Voltaire |  |
| REQ-4.13-03 | Developer manages asset | High | Done | 10 / 0 | Voltaire |  |
| REQ-4.13-04 | AR action only when usable | High | Done | 5 / 0 | Voltaire |  |
| REQ-4.13-05 | Camera prompt timing | High | N/A | 0 / 0 | Voltaire | Frontend only: Browser camera prompt |
| REQ-4.13-06 | Page available without AR | High | Done | 2 / 0 | Voltaire |  |
| REQ-4.13-07 | AR exposes public data only | High | Done | 4 / 0 | Voltaire |  |
| REQ-4.13-08 | No automatic AR scoring | Medium | Done | 5 / 0 | Voltaire |  |
| REQ-4.13-09 | AR failure message | Medium | N/A | 0 / 0 | Voltaire | Frontend only: AR fallback message |

### §4.14 Offline drafts and sync: 100.0%

| Requirement | Title | Priority | Status | Tests pass / fail | Owner | Note |
| --- | --- | --- | --- | --- | --- | --- |
| REQ-4.14-01 | View cached records | High | N/A | 0 / 0 | Kyer | Frontend only: Browser cache |
| REQ-4.14-02 | Search cached records | High | N/A | 0 / 0 | Kyer | Frontend only: Browser cache search |
| REQ-4.14-03 | Create text-only draft | High | Done | 2 / 0 | Kyer |  |
| REQ-4.14-04 | Pending Sync state | High | N/A | 2 / 0 | Kyer | Frontend only: Client draft state |
| REQ-4.14-05 | Retain drafts | High | N/A | 0 / 0 | Kyer | Frontend only: Client draft retention |
| REQ-4.14-06 | Submit pending drafts | High | Done | 2 / 0 | Kyer |  |
| REQ-4.14-07 | Retain and explain failures | High | Done | 6 / 0 | Kyer |  |
| REQ-4.14-08 | Retries make no duplicates | High | Done | 4 / 0 | Kyer |  |
| REQ-4.14-09 | Connection states | High | N/A | 0 / 0 | Kyer | Frontend only: Client state display |
| REQ-4.14-10 | Records read-only offline | High | N/A | 0 / 0 | Kyer | Frontend only: Client read-only mode |
| REQ-4.14-11 | Other operations need internet | High | Done | 6 / 0 | Kyer |  |
| REQ-4.14-12 | Browser data is not a backup | High | N/A | 0 / 0 | Kyer | Frontend only: Client-side labelling |

### §4.15 Audit, backup and recovery: 33.3%

| Requirement | Title | Priority | Status | Tests pass / fail | Owner | Note |
| --- | --- | --- | --- | --- | --- | --- |
| REQ-4.15-01 | Record major actions | High | Partial | 22 / 2 | Kyer | All listed domains audited except backup and restoration. |
| REQ-4.15-02 | Audit entry contents | High | Done | 10 / 0 | Kyer |  |
| REQ-4.15-03 | Audit entries protected | High | Done | 2 / 0 | Kyer |  |
| REQ-4.15-04 | Search audit information | High | Done | 11 / 0 | Kyer |  |
| REQ-4.15-05 | Scheduled backup | High | Not Started | 0 / 1 | Kyer | No job, script or schedule in the repo. |
| REQ-4.15-06 | Record results, alert on failure | High | Partial | 6 / 1 | Kyer | History is readable. Nothing writes it or alerts on failure. |
| REQ-4.15-07 | Backups protected | High | Not Started | 1 / 0 | Kyer | No backups exist in the repo or deployment to protect. |
| REQ-4.15-08 | Restore from backup | High | Not Started | 0 / 1 | Kyer | No restore route or procedure. |
| REQ-4.15-09 | Log restorations honestly | High | Not Started | 0 / 2 | Kyer | No restoration exists to log. |
| REQ-4.15-10 | No admin dashboard needed | High | Done | 1 / 0 | Kyer |  |
| REQ-4.15-11 | Full backup and restore test | High | Not Started | 0 / 1 | Kyer | BAK-002 is Deferred. |
| REQ-4.15-12 | Approved backup plan | High | Not Started | 0 / 1 | Kyer | No approval recorded. |

## Defects found

| # | Severity | Requirement | Defect | Tests | Owner |
| --- | --- | --- | --- | --- | --- |
| 1 | High | REQ-4.2-02 | A curator invited through `POST /developer/curators/onboard` gets full curator access from the invite link before setting a password. The Developer path never sets the `onboarding_pending` flag that the curator path sets (`developer.service.ts:114`). | T0844 | Voltaire |
| 2 | Medium | REQ-4.2-05 | The API accepts and activates GLB models that reference external files. That check exists only in the frontend (`src/features/developer/glb.ts`); the backend checks extension, size and magic bytes. | T1298, T1299, T1300 | Voltaire |
| 3 | Medium | REQ-4.6-12 | No allowed parent-child type rules: a Room can be created inside a Box. Self and descendant cycles are correctly refused. | T0891 | Kyer, Ivan |
| 4 | Low | REQ-4.2-02 | Onboarding the email of a pending invitee returns 500 and says "invitation was sent". An existing active account correctly gets a client error. | T0842 | Voltaire |
| 5 | Low | REQ-4.2-02 | `GET /developer/curators` shows pending invitations as `ACTIVE`. Carried over from 28 Oct. | T0846 | Voltaire |

No code was changed in this run. Missing features are listed under [Work remaining](#work-remaining).

## Code to SRS map

### SRS requirements with no endpoint

| Requirement | Title | Status | Note |
| --- | --- | --- | --- |
| REQ-4.1-05 | Logout and inactivity timeout | Partial | Logout works through Supabase. No inactivity timeout in the backend. |
| REQ-4.1-08 | Curator activates or deactivates curator | Not Started | No route. Only developers can change status. |
| REQ-4.1-09 | Succession or handover | Partial | Separate account available; no handover operation. |
| REQ-4.1-10 | Email password recovery | Done | Runs in Supabase, proven on local GoTrue. Hosted template not read. |
| REQ-4.1-16 | Change own password | Not Started | No backend route or audit. |
| REQ-4.1-18 | Password-change confirmation email | Not Started | Nothing sends it. |
| REQ-4.15-05 | Scheduled backup | Not Started | No job, script or schedule in the repo. |
| REQ-4.15-07 | Backups protected | Not Started | No backups exist in the repo or deployment to protect. |
| REQ-4.15-08 | Restore from backup | Not Started | No restore route or procedure. |
| REQ-4.15-09 | Log restorations honestly | Not Started | No restoration exists to log. |
| REQ-4.15-11 | Full backup and restore test | Not Started | BAK-002 is Deferred. |
| REQ-4.15-12 | Approved backup plan | Not Started | No approval recorded. |

**Frontend only, no endpoint expected (22):** REQ-4.3-03, REQ-4.3-04, REQ-4.10-01, REQ-4.10-02, REQ-4.10-03, REQ-4.10-04, REQ-4.10-05, REQ-4.10-06, REQ-4.10-07, REQ-4.10-09, REQ-4.10-10, REQ-4.11-08, REQ-4.11-10, REQ-4.13-05, REQ-4.13-09, REQ-4.14-01, REQ-4.14-02, REQ-4.14-04, REQ-4.14-05, REQ-4.14-09, REQ-4.14-10, REQ-4.14-12.

### Endpoints with no SRS requirement

| Endpoint | Why it exists |
| --- | --- |
| `GET /` | Health/status root |
| `GET /faq/assistant/review-policy` | Opt-in FAQ review (team decision, off by default) |
| `POST /faq/assistant/review-submissions` | Opt-in FAQ review |
| `GET /faq/review-queue` | Opt-in FAQ review |
| `PATCH /faq/review-queue/{id}` | Opt-in FAQ review |
| `DELETE /faq/review-queue/{id}` | Opt-in FAQ review |
| `PATCH /specimens/{id}/restore` | Handoff decision Q3; SRS covers archive only |
| `GET /specimens/{specimenId}/tags` | Tags are not in SRS 4.4 |
| `POST /specimens/{specimenId}/tags` | Tags are not in SRS 4.4 |
| `PATCH /specimens/{specimenId}/tags/{tagId}` | Tags are not in SRS 4.4 |
| `DELETE /specimens/{specimenId}/tags/{tagId}` | Tags are not in SRS 4.4 |
| `GET /tags` | Tags are not in SRS 4.4 |

Report type `AUDIT_LOG` on `POST /reports` is also extra: SRS 4.7.4 approves five report types, and this is a sixth.

### All 140 endpoints

Columns count checks per endpoint: happy path, invalid input, database or storage confirmation, and auth matrix (missing, invalid, expired or forged JWT, inactive account, wrong role).

| Endpoint | SRS (REQ-) | No SRS reason | Happy | Invalid | DB | Auth | Failed |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `GET /` | 4.10-08, 4.8-10, 4.9-15 | Health/status root | 1 | 0 | 0 | 0 | 0 |
| `GET /audit-logs` | 4.15-02, 4.15-04 |  | 4 | 4 | 0 | 7 | 0 |
| `GET /audit-logs/{id}` | 4.15-02, 4.15-04 |  | 1 | 3 | 0 | 6 | 0 |
| `POST /auth/login` | 4.1-01, 4.1-04, 4.1-10, 4.1-12, 4.1-15, 4.15-01 |  | 1 | 6 | 4 | 0 | 0 |
| `GET /auth/me` | 4.1-01, 4.1-04, 4.1-05, 4.1-07, 4.1-12, 4.1-13, 4.1-17, 4.1-19, 4.2-01, 4.2-03 |  | 6 | 1 | 0 | 8 | 1 |
| `POST /auth/onboarding/complete` | 4.1-07, 4.1-11, 4.1-17, 4.1-19 |  | 1 | 1 | 1 | 1 | 0 |
| `GET /backups/history` | 4.15-06, 4.15-07 |  | 2 | 3 | 0 | 7 | 0 |
| `GET /backups/history/{id}` | 4.15-06 |  | 1 | 3 | 0 | 6 | 0 |
| `POST /collections` | 4.4-01, 4.4-18 |  | 1 | 4 | 1 | 6 | 0 |
| `GET /collections` | 4.4-01, 4.4-18 |  | 1 | 1 | 0 | 6 | 0 |
| `GET /collections/{id}` | 4.4-01, 4.4-18 |  | 1 | 3 | 0 | 6 | 0 |
| `PATCH /collections/{id}` | 4.4-01, 4.4-18 |  | 1 | 2 | 0 | 6 | 0 |
| `GET /dashboard/summary` | 4.3-01, 4.3-02 |  | 1 | 1 | 0 | 7 | 0 |
| `POST /developer/ar-assets` | 4.13-03, 4.2-04, 4.2-05, 4.2-09 |  | 1 | 10 | 4 | 6 | 2 |
| `PATCH /developer/ar-assets/{id}` | 4.13-03, 4.2-04, 4.2-05 |  | 1 | 3 | 0 | 6 | 0 |
| `DELETE /developer/ar-assets/{id}` | 4.2-04, 4.2-09 |  | 1 | 3 | 2 | 6 | 0 |
| `PATCH /developer/ar-assets/{id}/activate` | 4.13-03, 4.2-04, 4.2-05, 4.2-09 |  | 1 | 5 | 0 | 6 | 1 |
| `PATCH /developer/ar-assets/{id}/deactivate` | 4.13-03, 4.2-04 |  | 1 | 2 | 0 | 6 | 0 |
| `GET /developer/ar-exhibits` | 4.13-03, 4.2-04, 4.2-08 |  | 1 | 1 | 0 | 6 | 0 |
| `GET /developer/curators` | 4.2-02, 4.2-08 |  | 1 | 1 | 0 | 6 | 1 |
| `POST /developer/curators/onboard` | 4.2-02, 4.2-09 |  | 1 | 4 | 2 | 6 | 1 |
| `PATCH /developer/curators/{id}/status` | 4.1-12, 4.2-03, 4.2-09 |  | 2 | 7 | 2 | 6 | 0 |
| `POST /exhibits` | 4.12-01, 4.12-02, 4.12-03, 4.12-04, 4.4-11 |  | 1 | 7 | 1 | 6 | 0 |
| `GET /exhibits` | 4.12-01, 4.12-03, 4.12-04 |  | 2 | 2 | 0 | 8 | 0 |
| `GET /exhibits/public/{slug}` | 4.12-01, 4.12-03, 4.12-08, 4.12-09, 4.12-10, 4.12-11, 4.12-12, 4.13-01, 4.13-04, 4.13-06, 4.13-07, 4.4-11, 4.6-10 |  | 3 | 4 | 0 | 0 | 0 |
| `GET /exhibits/{id}` | 4.12-01, 4.12-03, 4.12-04 |  | 1 | 3 | 0 | 6 | 0 |
| `PATCH /exhibits/{id}` | 4.12-01, 4.12-03, 4.12-04, 4.12-09, 4.12-10, 4.4-11 |  | 2 | 5 | 1 | 6 | 0 |
| `PATCH /exhibits/{id}/ar` | 4.13-01, 4.13-04 |  | 1 | 3 | 0 | 6 | 0 |
| `PATCH /exhibits/{id}/ar-selection` | 4.13-02, 4.13-08 |  | 1 | 4 | 1 | 6 | 0 |
| `PATCH /exhibits/{id}/archive` | 4.12-01, 4.12-09, 4.4-11 |  | 1 | 2 | 1 | 6 | 0 |
| `PATCH /exhibits/{id}/disable` | 4.12-01, 4.12-09, 4.12-11 |  | 1 | 2 | 0 | 6 | 0 |
| `GET /exhibits/{id}/label` | 4.12-06 |  | 1 | 2 | 0 | 6 | 0 |
| `POST /exhibits/{id}/media` | 4.12-03 |  | 1 | 4 | 0 | 6 | 0 |
| `PATCH /exhibits/{id}/media/{mediaId}` | 4.12-03 |  | 1 | 3 | 0 | 6 | 0 |
| `DELETE /exhibits/{id}/media/{mediaId}` | 4.12-03 |  | 1 | 2 | 0 | 6 | 0 |
| `PATCH /exhibits/{id}/publish` | 4.12-01, 4.12-09, 4.12-11, 4.4-11 |  | 1 | 5 | 2 | 6 | 0 |
| `GET /exhibits/{id}/qr` | 4.12-04, 4.12-05 |  | 2 | 4 | 0 | 6 | 0 |
| `PATCH /exhibits/{id}/replace-url` | 4.12-10 |  | 1 | 3 | 0 | 6 | 0 |
| `PATCH /exhibits/{id}/unpublish` | 4.12-01, 4.12-09, 4.12-11 |  | 1 | 2 | 0 | 6 | 0 |
| `POST /faq/assistant/ask` | 4.11-01, 4.11-02, 4.11-03, 4.11-04, 4.11-05, 4.11-06, 4.11-07, 4.6-10 |  | 7 | 4 | 2 | 0 | 0 |
| `GET /faq/assistant/review-policy` | none | Opt-in FAQ review (team decision, off by default) | 1 | 1 | 0 | 0 | 0 |
| `POST /faq/assistant/review-submissions` | none | Opt-in FAQ review | 1 | 3 | 0 | 0 | 0 |
| `GET /faq/assistant/suggestions` | 4.11-01, 4.11-03, 4.11-04 |  | 1 | 2 | 0 | 0 | 0 |
| `POST /faq/entries` | 4.11-02, 4.11-03, 4.11-04, 4.11-09 |  | 1 | 3 | 3 | 6 | 0 |
| `GET /faq/entries` | 4.11-02, 4.11-03 |  | 2 | 2 | 0 | 7 | 0 |
| `GET /faq/entries/{id}` | 4.11-02, 4.11-03 |  | 1 | 3 | 0 | 6 | 0 |
| `PATCH /faq/entries/{id}` | 4.11-02, 4.11-09 |  | 1 | 3 | 1 | 6 | 0 |
| `PATCH /faq/entries/{id}/activate` | 4.11-02, 4.11-04 |  | 1 | 3 | 0 | 6 | 0 |
| `PATCH /faq/entries/{id}/archive` | 4.11-02, 4.11-04 |  | 1 | 2 | 1 | 6 | 0 |
| `PATCH /faq/entries/{id}/deactivate` | 4.11-02, 4.11-04 |  | 1 | 2 | 0 | 6 | 0 |
| `GET /faq/review-queue` | none | Opt-in FAQ review | 1 | 1 | 0 | 6 | 0 |
| `PATCH /faq/review-queue/{id}` | none | Opt-in FAQ review | 1 | 3 | 0 | 6 | 0 |
| `DELETE /faq/review-queue/{id}` | none | Opt-in FAQ review | 1 | 3 | 0 | 6 | 0 |
| `POST /inquiries` | 4.3-08, 4.3-09, 4.8-01, 4.8-02, 4.8-03, 4.8-04, 4.8-08, 4.8-10 |  | 1 | 8 | 4 | 0 | 0 |
| `GET /inquiries` | 4.8-05, 4.8-10 |  | 3 | 3 | 0 | 7 | 0 |
| `GET /inquiries/{id}` | 4.8-05, 4.8-10 |  | 1 | 3 | 0 | 6 | 0 |
| `PATCH /inquiries/{id}` | 4.15-01, 4.8-06, 4.8-11 |  | 2 | 4 | 2 | 6 | 0 |
| `GET /inquiries/{id}/history` | 4.8-09, 4.8-11 |  | 1 | 2 | 0 | 6 | 0 |
| `POST /inquiries/{id}/notes` | 4.8-06, 4.8-11 |  | 1 | 3 | 0 | 6 | 0 |
| `POST /inquiries/{id}/referral` | 4.8-06, 4.8-07 |  | 1 | 5 | 1 | 6 | 0 |
| `POST /inquiries/{id}/replies` | 4.8-09, 4.8-11 |  | 1 | 3 | 3 | 6 | 0 |
| `GET /notifications` | 4.3-05, 4.3-06, 4.3-07, 4.3-08 |  | 1 | 3 | 0 | 7 | 1 |
| `PATCH /notifications/state` | 4.3-07 |  | 2 | 3 | 2 | 6 | 0 |
| `POST /offline-sync/specimen-drafts` | 4.14-03, 4.14-04, 4.14-06, 4.14-07, 4.14-08, 4.14-11, 4.15-01 |  | 2 | 8 | 4 | 6 | 0 |
| `GET /reports` | 4.7-04 |  | 1 | 1 | 0 | 7 | 0 |
| `POST /reports` | 4.15-04, 4.7-05, 4.7-06, 4.7-07, 4.7-08, 4.7-09, 4.7-10, 4.7-11, 4.7-12, 4.7-13, 4.7-14, 4.7-15, 4.7-16 |  | 14 | 7 | 2 | 6 | 0 |
| `GET /reports/history` | 4.7-14 |  | 2 | 2 | 0 | 6 | 0 |
| `GET /reports/summary` | 4.7-04 |  | 1 | 1 | 0 | 6 | 0 |
| `POST /specimens` | 4.15-01, 4.4-01, 4.4-02, 4.4-03, 4.4-04, 4.4-05, 4.4-06, 4.4-17, 4.4-18, 4.4-21, 4.4-22, 4.4-23 |  | 3 | 7 | 6 | 6 | 0 |
| `GET /specimens` | 4.4-07, 4.4-08, 4.4-09 |  | 1 | 1 | 0 | 7 | 0 |
| `GET /specimens/accession-number-availability` | 4.4-04 |  | 1 | 2 | 0 | 6 | 0 |
| `POST /specimens/duplicate-check` | 4.4-21, 4.4-22, 4.4-23 |  | 1 | 2 | 0 | 6 | 0 |
| `POST /specimens/import/commit` | 4.15-01, 4.4-19, 4.4-20 |  | 1 | 3 | 3 | 6 | 0 |
| `POST /specimens/import/preview` | 4.4-19, 4.4-20, 4.4-21 |  | 2 | 4 | 1 | 6 | 0 |
| `GET /specimens/search` | 4.7-01, 4.7-02, 4.7-03 |  | 23 | 5 | 0 | 6 | 0 |
| `GET /specimens/{id}` | 4.4-04, 4.4-07, 4.4-08, 4.4-09, 4.7-01, 4.7-02, 4.7-03 |  | 25 | 11 | 0 | 6 | 0 |
| `PATCH /specimens/{id}` | 4.4-07, 4.4-08, 4.4-09, 4.4-10, 4.4-11, 4.4-17 |  | 1 | 5 | 2 | 6 | 0 |
| `PATCH /specimens/{id}/archive` | 4.4-10, 4.4-11, 4.4-17 |  | 1 | 3 | 1 | 6 | 0 |
| `GET /specimens/{id}/catalog-readiness` | 4.4-07, 4.4-08, 4.4-09 |  | 1 | 2 | 0 | 6 | 0 |
| `PATCH /specimens/{id}/complete-cataloging` | 4.4-05, 4.4-07, 4.4-08, 4.4-09, 4.4-13 |  | 1 | 3 | 1 | 6 | 0 |
| `GET /specimens/{id}/details` | 4.4-09 |  | 1 | 2 | 0 | 6 | 0 |
| `GET /specimens/{id}/possible-duplicates` | 4.4-21, 4.4-22, 4.4-23 |  | 1 | 2 | 0 | 6 | 0 |
| `PATCH /specimens/{id}/public-display` | 4.4-10, 4.4-11, 4.4-15, 4.4-16, 4.4-17 |  | 1 | 5 | 1 | 6 | 0 |
| `PATCH /specimens/{id}/reopen-cataloging` | 4.4-07, 4.4-11 |  | 1 | 3 | 1 | 6 | 0 |
| `PATCH /specimens/{id}/restore` | 4.4-10, 4.4-11, 4.4-17 | Handoff decision Q3; SRS covers archive only | 1 | 3 | 2 | 6 | 0 |
| `GET /specimens/{id}/revisions` | 4.4-07, 4.4-08, 4.4-09 |  | 1 | 2 | 0 | 6 | 0 |
| `POST /specimens/{specimenId}/lots` | 4.15-01, 4.4-14, 4.5-01, 4.5-02, 4.5-03, 4.5-07, 4.6-05, 4.6-11 |  | 3 | 10 | 3 | 6 | 0 |
| `GET /specimens/{specimenId}/lots` | 4.5-03 |  | 2 | 2 | 0 | 6 | 0 |
| `GET /specimens/{specimenId}/lots/history` | 4.5-11 |  | 2 | 3 | 0 | 6 | 0 |
| `GET /specimens/{specimenId}/lots/summary` | 4.5-03 |  | 1 | 2 | 0 | 6 | 0 |
| `GET /specimens/{specimenId}/lots/{lotId}` | 4.5-03, 4.5-11 |  | 4 | 9 | 0 | 6 | 0 |
| `POST /specimens/{specimenId}/lots/{lotId}/condition-changes` | 4.5-05, 4.5-06, 4.5-08 |  | 1 | 5 | 1 | 6 | 0 |
| `POST /specimens/{specimenId}/lots/{lotId}/movements` | 4.5-04, 4.5-06, 4.5-07, 4.5-08, 4.5-10, 4.5-11, 4.6-05, 4.6-06, 4.6-09 |  | 2 | 6 | 4 | 6 | 0 |
| `PATCH /specimens/{specimenId}/lots/{lotId}/notes` | 4.5-10 |  | 1 | 3 | 1 | 6 | 0 |
| `POST /specimens/{specimenId}/lots/{lotId}/quantity-adjustments` | 4.5-02, 4.5-09, 4.5-10 |  | 7 | 7 | 3 | 6 | 0 |
| `GET /specimens/{specimenId}/lots/{lotId}/transactions` | 4.5-11 |  | 1 | 2 | 0 | 6 | 0 |
| `POST /specimens/{specimenId}/media` | 4.4-12 |  | 1 | 5 | 2 | 6 | 0 |
| `GET /specimens/{specimenId}/media` | 4.4-12 |  | 1 | 2 | 0 | 6 | 0 |
| `GET /specimens/{specimenId}/media/{mediaId}` | 4.4-12 |  | 1 | 3 | 0 | 6 | 0 |
| `PATCH /specimens/{specimenId}/media/{mediaId}` | 4.4-12 |  | 1 | 3 | 0 | 6 | 0 |
| `DELETE /specimens/{specimenId}/media/{mediaId}` | 4.4-12 |  | 1 | 2 | 1 | 6 | 0 |
| `PATCH /specimens/{specimenId}/media/{mediaId}/cover` | 4.4-12 |  | 1 | 2 | 0 | 6 | 0 |
| `PUT /specimens/{specimenId}/media/{mediaId}/file` | 4.4-12 |  | 1 | 2 | 1 | 6 | 0 |
| `GET /specimens/{specimenId}/media/{mediaId}/signed-url` | 4.4-12 |  | 1 | 2 | 0 | 6 | 0 |
| `POST /specimens/{specimenId}/provenance` | 4.4-14 |  | 1 | 5 | 1 | 6 | 0 |
| `GET /specimens/{specimenId}/provenance` | 4.4-14 |  | 1 | 2 | 0 | 6 | 0 |
| `PATCH /specimens/{specimenId}/provenance` | 4.4-14 |  | 1 | 2 | 0 | 6 | 0 |
| `GET /specimens/{specimenId}/tags` | 4.4-09 | Tags are not in SRS 4.4 | 1 | 2 | 0 | 6 | 0 |
| `POST /specimens/{specimenId}/tags` | 4.4-09 | Tags are not in SRS 4.4 | 1 | 4 | 0 | 6 | 0 |
| `PATCH /specimens/{specimenId}/tags/{tagId}` | 4.4-09 | Tags are not in SRS 4.4 | 1 | 2 | 0 | 6 | 0 |
| `DELETE /specimens/{specimenId}/tags/{tagId}` | 4.4-09 | Tags are not in SRS 4.4 | 1 | 3 | 0 | 6 | 0 |
| `POST /specimens/{specimenId}/taxonomy` | 4.4-14 |  | 1 | 3 | 1 | 6 | 0 |
| `GET /specimens/{specimenId}/taxonomy` | 4.4-14 |  | 1 | 3 | 0 | 6 | 0 |
| `PATCH /specimens/{specimenId}/taxonomy` | 4.4-14 |  | 1 | 3 | 0 | 6 | 0 |
| `POST /storage-locations` | 4.15-01, 4.6-01, 4.6-02, 4.6-03, 4.6-04, 4.6-12 |  | 8 | 5 | 2 | 6 | 1 |
| `GET /storage-locations` | 4.6-01, 4.6-02, 4.6-03, 4.6-04 |  | 1 | 1 | 0 | 7 | 0 |
| `GET /storage-locations/occupancy-summary` | 4.6-11 |  | 1 | 1 | 0 | 6 | 0 |
| `GET /storage-locations/search` | 4.6-01, 4.6-02, 4.6-03, 4.6-04 |  | 1 | 2 | 0 | 6 | 0 |
| `GET /storage-locations/{id}` | 4.6-01, 4.6-02, 4.6-03, 4.6-04, 4.6-11 |  | 3 | 7 | 0 | 6 | 0 |
| `PATCH /storage-locations/{id}` | 4.6-02 |  | 1 | 4 | 1 | 6 | 0 |
| `PATCH /storage-locations/{id}/archive` | 4.6-02 |  | 1 | 4 | 1 | 6 | 0 |
| `GET /storage-locations/{id}/capacity-check` | 4.6-11 |  | 1 | 3 | 0 | 6 | 0 |
| `GET /storage-locations/{id}/children` | 4.6-01, 4.6-02, 4.6-03, 4.6-04 |  | 1 | 2 | 0 | 6 | 0 |
| `GET /storage-locations/{id}/inventory` | 4.6-02, 4.6-11 |  | 1 | 3 | 0 | 6 | 0 |
| `GET /storage-locations/{id}/lot-movements` | 4.6-09 |  | 1 | 3 | 0 | 6 | 0 |
| `PATCH /storage-locations/{id}/move` | 4.6-07, 4.6-12 |  | 1 | 4 | 2 | 6 | 0 |
| `GET /storage-locations/{id}/movements` | 4.6-07 |  | 1 | 2 | 0 | 6 | 0 |
| `GET /storage-locations/{id}/path` | 4.6-08 |  | 1 | 2 | 0 | 6 | 0 |
| `GET /tags` | 4.4-09 | Tags are not in SRS 4.4 | 1 | 1 | 0 | 6 | 0 |
| `GET /user-accounts` | 4.1-02, 4.1-07, 4.1-14 |  | 1 | 1 | 0 | 7 | 0 |
| `POST /user-accounts/invitations` | 4.1-02, 4.1-07, 4.1-09, 4.1-11 |  | 2 | 5 | 2 | 6 | 0 |
| `POST /visit-requests` | 4.15-01, 4.3-09, 4.9-01, 4.9-02, 4.9-03, 4.9-04, 4.9-05, 4.9-06, 4.9-07 |  | 1 | 11 | 5 | 0 | 0 |
| `GET /visit-requests` | 4.9-08, 4.9-15 |  | 3 | 2 | 0 | 7 | 0 |
| `GET /visit-requests/{id}` | 4.9-08, 4.9-15 |  | 1 | 3 | 0 | 6 | 0 |
| `PATCH /visit-requests/{id}` | 4.9-09, 4.9-14, 4.9.16 |  | 4 | 4 | 2 | 6 | 0 |
| `PATCH /visit-requests/{id}/approve-schedule` | 4.9-09, 4.9-11, 4.9-14, 4.9.16 |  | 1 | 4 | 2 | 6 | 0 |
| `GET /visit-requests/{id}/campus-entry-summary` | 4.9-12, 4.9-13 |  | 1 | 3 | 0 | 6 | 0 |
| `GET /visit-requests/{id}/history` | 4.9-09, 4.9-14 |  | 1 | 2 | 0 | 6 | 0 |
| `POST /visit-requests/{id}/messages` | 4.9-10, 4.9-11, 4.9-14 |  | 1 | 3 | 2 | 6 | 0 |
| `POST /visit-requests/{id}/notes` | 4.9-10, 4.9-11, 4.9-14 |  | 1 | 3 | 0 | 6 | 0 |

## How each conflict was settled

The progress reports and the BBT disagree in these places. BBT ran on 27-28 Oct through the UI against the hosted database. This test ran on 5 Nov through the API. What the code does today decides each one.

| Requirement | Progress report says | BBT says | Code does today | Settled |
| --- | --- | --- | --- | --- |
| REQ-4.3-07 mark read or dismissed | 4 Nov: §4.3 gap is only the bell's feed; 6 Oct: no read state | Fail (BB-DSH-07): no control | Read and dismiss work per curator and leave records untouched, with the flag on | **Done.** Shipped 28 Oct (#208), the same day BBT finished. Off by default |
| REQ-4.3-09, 4.8-08, 4.9-07 email alerts | 4 Nov: §4.8 and §4.9 at 100% | Fail (BB-DSH-06): alert email failed | Sends to active curators only, records failures honestly | **Done** in code. BBT's failure was delivery in that environment. Retest on hosted Brevo |
| REQ-4.4-20, 4.4-21 import preview | 4 Nov: §4.4 at 100% | Fail (BB-IMP-02): same-species row not warned | Same scientific and common name warns. Same species alone reports nothing, as the written duplicate rule requires | **Done.** BBT expected more than the rule. The rule itself still needs Curator disposition |
| REQ-4.6-11 capacity warning | 6 Oct: warnings exist; 4 Nov: §4.6 at 100% | Fail (BB-SPC-08): no warning shown | API returns `capacityWarning` with the excess | **Done** for the backend. Check whether the frontend displays it |
| REQ-4.2-05 AR validation | 4 Nov: §4.2 at 100% | Pass (BB-AR-04, 05) | API accepts and activates external-reference models | **Partial.** Both overstated it: BBT saw the frontend's error message, not a backend check |
| REQ-4.2-02 onboarding | 4 Nov: §4.2 at 100%, yet lists pending shown as Active | Pass (BB-DEV-01) | Three defects on the Developer path | **Partial** |
| REQ-4.6-12 parent-child rules | 6 Oct: no type matrix; 4 Nov: §4.6 at 100% | Pass (BB-STO-03, cycles only) | Still no matrix | **Partial.** The 4 Nov 100% is wrong for the backend |
| REQ-4.1-08, 4.1-09 activation, handover | 4 Nov: no screens; 6 Oct: no routes | Fail (BB-USR-04) | No curator route; Developer-only status change | **Not Started** and **Partial.** Sources agree. Invitations exist, so 4.1-09 has one half |
| REQ-4.1-16, 4.1-18 change password | 4 Nov: no page | Fail (BB-USR-05) | No route, audit or confirmation email | **Not Started.** Sources agree |
| REQ-4.15-05, 4.15-06 backup | 4 Nov: history only, §4.15 at 83% | Not Verified (BB-AUD-04) | Read-only history; nothing writes it | **Not Started** and **Partial.** The 83% is a frontend figure |
| REQ-4.4-19 XLSX import | 7 Oct: XLSX rejected | Pass (BB-IMP-01, 03), and BB-IMP-04 expected non-CSV files to be refused | XLSX preview works | **Done.** Added 29 Oct (#216), after BBT. BB-IMP-04 needs updating |
| REQ-4.4-10 restore | 6 Oct and 7 Oct: no restore route | Archive Pass (BB-SPC-19); restore not covered | Restore works and keeps public display off | **Done.** Added 21 Oct; the SRS does not require it |
| REQ-4.5-11 lot history | 28 Oct: 500 on `TEMPORARY_ABSENCE` | Not covered | History returns that row | **Done.** Fixed 2 Nov (#221) |
| REQ-4.4-01 duplicate collections | 6 Oct: accepted (DEF-001) | Not covered | Case and padding variants get 409 | **Done** |

## Comparison with Last Progress Report

**Report compared:** BioSphere frontend progress report, 3-4 Nov 2026 ([link](https://claude.ai/artifact/H59jkW2x9ReBWv76nvJ1af)), the link you provided. No Progress Report exists in the repo or `/docs`, and this is the latest one found. It claims 95%.

**Limits of this comparison:**

- **It is a frontend report.** It scores each section's frontend share, so a gap here does not mean the frontend score is wrong.
- **It has no requirement rows.** Requirement statuses are inferred: a section at 100% counts as Done, and a section below 100% counts as Done except for the gaps it names (for example REQ-4.1-08). This is why Not in report is 0.
- **Other reports have no backend percentage.** The 28 Oct System Test Report covers the backend at `edaf18c` but gives counts only. The 6 Oct "11 of 16 complete" counted code that exists, and the 7 Oct review already called that overstated.

### Verdict

**Not accurate for the backend.**

| Measure | Value |
| --- | --- |
| Overall % claimed | 95% (frontend) |
| Actual overall % now | 88.9% (backend) |
| Gap | -6.1 points |
| Same claims scored with the backend formula | 95.5%, so 6.6 points above actual |

| Category | Requirement rows | Module rows |
| --- | --- | --- |
| Aligned | 158 | 13 |
| Overstated | 11 | 2 |
| Understated | 1 | 0 |
| Not in report | 0 | 0 |
| Not applicable (frontend only) | 22 | 0 |

The overall gap is modest, but it hides where the risk is. §4.15 is the clearest case: its status is Aligned because both are Partial, yet the report says 83% and the backend is 33.3%.

### By module

| Module | Report status | Report % | Verified status | Verified % | Gap | Alignment |
| --- | --- | --- | --- | --- | --- | --- |
| §4.1 Authentication and accounts | Partial | 75% | Partial | 64.9% | -10.1 | Aligned |
| §4.2 Developer functions | Done | 100% | Partial | 77.8% | -22.2 | Overstated |
| §4.3 Dashboard and notifications | Partial | 89% | Partial | 86.7% | -2.3 | Aligned |
| §4.4 Inventory and cataloging | Done | 100% | Done | 100.0% | +0.0 | Aligned |
| §4.5 Lots and quantities | Done | 100% | Done | 100.0% | +0.0 | Aligned |
| §4.6 Storage locations | Done | 100% | Partial | 91.3% | -8.7 | Overstated |
| §4.7 Search, reports and export | Done | 100% | Done | 100.0% | +0.0 | Aligned |
| §4.8 General inquiries | Done | 100% | Done | 100.0% | +0.0 | Aligned |
| §4.9 Visit requests | Done | 100% | Done | 100.0% | +0.0 | Aligned |
| §4.10 Public website | Done | 100% | Done | 100.0% | +0.0 | Aligned |
| §4.11 FAQ assistant | Done | 100% | Done | 100.0% | +0.0 | Aligned |
| §4.12 QR exhibits | Done | 100% | Done | 100.0% | +0.0 | Aligned |
| §4.13 WebAR | Done | 100% | Done | 100.0% | +0.0 | Aligned |
| §4.14 Offline drafts and sync | Done | 100% | Done | 100.0% | +0.0 | Aligned |
| §4.15 Audit, backup and recovery | Partial | 83% | Partial | 33.3% | -49.7 | Aligned |

### Rows that differ

| Requirement | Title | Report (inferred) | Verified | Alignment |
| --- | --- | --- | --- | --- |
| REQ-4.1-09 | Succession or handover | Not Started | Partial | Understated |
| REQ-4.1-11 | Audit account actions without secrets | Done | Partial | Overstated |
| REQ-4.1-19 | Links expire and are single use | Done | Partial | Overstated |
| REQ-4.2-02 | Provision initial curator | Done | Partial | Overstated |
| REQ-4.2-05 | Validate AR asset | Done | Partial | Overstated |
| REQ-4.6-12 | Reject cycles and invalid combinations | Done | Partial | Overstated |
| REQ-4.15-01 | Record major actions | Done | Partial | Overstated |
| REQ-4.15-06 | Record results, alert on failure | Done | Partial | Overstated |
| REQ-4.15-07 | Backups protected | Done | Not Started | Overstated |
| REQ-4.15-09 | Log restorations honestly | Done | Not Started | Overstated |
| REQ-4.15-11 | Full backup and restore test | Done | Not Started | Overstated |
| REQ-4.15-12 | Approved backup plan | Done | Not Started | Overstated |

**The other 158 requirement rows are Aligned.** The full list is in `progress-data.json`.

### Real progress or reporting error

- **Overstated rows are reporting errors, not regressions.** Git shows no backend commit after 4 Nov, and each gap was already in the code on the report date.
- **The one Understated row is valid.** The curator invitation behind REQ-4.1-09 was added on 7 Oct (`45548ff`), before the report date.
- **Real backend progress since 28 Oct:** notification read state (#208), XLSX import (#216), lot-history repair (#221), multiple vehicles (#223), visit reference on inquiries (#228), report layout (#227) and archive-consistent duplicate checks (#230).

### 28 Oct System Test Report issues, rechecked

| Issue | Now |
| --- | --- |
| High: lot history returns 500 | Fixed |
| Medium: responses over 3 seconds | Not retested (nonfunctional, and this stack has no network distance) |
| Low: pending invitations shown as Active | Still open, defect 5 |
| Low: QR test timing | Not settled, because this run used a longer timeout |
| Question: two active GLB models on one exhibit | Still allowed; the SRS does not say either way (T1323) |

## Blockers

| Blocker | Blocks | Needs | Owner |
| --- | --- | --- | --- |
| No backup job, restore procedure or full test | REQ-4.15-05 to -09, -11, and turnover | USC/DCISM approval of server, schedule and destination | Kyer, with USC/DCISM |
| No approved backup plan | REQ-4.15-12 | USC/DCISM decision | USC/DCISM |
| Curators cannot activate, deactivate or hand over | REQ-4.1-08, -09 | Team decision on the procedure, as the 4 Nov report notes | Voltaire |
| Allowed storage type matrix not written | REQ-4.6-12 | Agreed matrix | Kyer, Ivan |
| Duplicate archive exclusion undecided | CAT-014 acceptance | Curator/SRS disposition | Kyer, Curator |
| Hosted settings unverified | REQ-4.1-19 expiry; Brevo delivery | Read-only check by someone with hosted access | Voltaire |

## Work remaining

Delivery plan dates: features 8 Nov, completion 18 Nov.

**Fix now**

1. Set `onboarding_pending` on the Developer invite path (defect 1). Voltaire.
2. Validate GLB structure in the backend, on upload and activation (defect 2). Voltaire.
3. Return a clean conflict for pending invitees, and expose invitation state to Developers (defects 4, 5). Voltaire.

**Build**

4. Curator activate, deactivate and handover routes, with audit. Voltaire.
5. Change-password route with audit and confirmation email; audit recovery and reset. Voltaire.
6. Inactivity timeout, with the approved period. Voltaire, with the frontend.
7. Sync-failure notification source, or an agreed decision that it stays client-side. Charles, John.
8. Storage type matrix and enforcement. Kyer, Ivan.
9. Backup job, failure alert, restore procedure, audit entries and one full backup-and-restore test. Kyer.

**Confirm**

10. Set `NOTIFICATION_STATE_ENABLED` where acceptance and the demo run.
11. Decide whether Swagger at `/docs` stays public in production (T1537).
12. Decide whether `AUDIT_LOG`, tags and FAQ review should be added to the SRS.
13. Check whether the frontend shows `capacityWarning`.

## Rerun

Needs Docker Desktop and Git Bash. Nothing here reads the repo's `.env`.

```bash
bash docs/progress-report-backend/harness/up.sh
```

```bash
bash docs/progress-report-backend/harness/server.sh
```

In a second terminal:

```bash
node docs/progress-report-backend/e2e/run.mjs
```

```bash
cd docs/progress-report-backend && python build_report.py
```

To remove the stack:

```bash
bash docs/progress-report-backend/harness/down.sh
```

Raw results for every check are in `e2e/results.json`.
