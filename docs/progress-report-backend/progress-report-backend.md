# Backend progress report: biosphere-backend vs SRS v0.10

Generated 2026-11-05 from `develop` @ `06545c0`. This is the same commit the last progress report examined, so any difference below is a reporting or testing difference, not new progress.

## Overall

| Measure | Value |
| --- | --- |
| **Verified backend progress** (Done only, weighted) | **89.6%** |
| Same statuses scored the last report's way (Partial = 0.5) | 92.7% |
| Last report's claim (BioSphere Backend Progress, 3–4 Nov 2026) | 93% |
| Live API cases | 789 run, **782 pass, 7 fail** (all 7 are genuine product gaps) |
| Unit / E2E (Node 25 local) | 703/703; 440 pass, 3 fail (env `PUBLIC_SITE_URL`; exhibits 60/60 with default), 17 skipped |
| Disposable DB suites (Node 22) | 75/77; the 2 offline browser suites are blocked by missing `@playwright/cli` in the frontend tooling |
| Lint / build | 0 errors (6 warnings) / pass |

**Formula.** Module % = 100 × Σ(wᵢ × [statusᵢ = Done]) / Σ wᵢ over backend-applicable requirements. The weight w is 2 for SRS High priority and 1 for Medium (4.1-18, 4.3-07, 4.6-11, 4.7-12, 4.9.16, 4.12-10, 4.13-08, 4.13-09). Partial and Not Started earn 0. Overall uses the same formula over all backend-applicable requirements. Requirements that are frontend-only (F) or managed by the Supabase provider (P: 4.1-10, 4.1-16, 4.1-18, 4.1-19) are excluded.

**Status rules.** Done = implemented and every tagged live case passes. Partial = built, but a case fails or a documented part is missing. Not Started = no implementation.

## How it was tested

- **Server and database.** The real `AppModule` (all 140 routes, global guards, `main.ts` ValidationPipe, real Prisma) ran against a **disposable local Postgres container** built from `prisma/migrations`. The shared Supabase project in `.env` was never contacted: the harness pins every config key and aborts unless Prisma reports the disposable database.
- **Supabase.** Auth and Storage ran as a loopback fake reached through `SUPABASE_URL`.
- **Email and network.** Brevo email was captured locally (15 emails); every other outbound host was blocked (0 attempts).
- **Rerun.** `RUN_PROGRESS_API_LIVE=true node --experimental-vm-modules node_modules/jest/bin/jest.js --config ./test/jest-progress-api-live.json --runInBand` (Node 22 + Docker). The files are `test/progress-api.live-spec.ts`, `test/support/progress-api-live/*` and `test/jest-progress-api-live.json`. Results land in `api-test-results.json`.
- **Coverage.**
  - Every protected route got a no-JWT, an invalid-JWT and an inactive-account call.
  - Every role-restricted route was called with the wrong role.
  - Happy-path and invalid-input calls checked the status code, the response shape and a direct database readback.
- **Limits.**
  - Real Supabase token validation, link expiry and the actual Brevo delivery were not exercised.
  - The happy path of `DELETE /specimens/:specimenId/media/:mediaId` ran only in the existing e2e suite.
  - The frontend is out of scope.

## SRS requirements with no endpoint / endpoints with no SRS requirement

- **Backend-applicable SRS requirements with no endpoint:**
  - 4.1-08: curator activate/deactivate. Developer-only route exists.
  - 4.1-09: handover step. Only a successor invite exists.
  - 4.3-10, plus the sync-failure part of 4.3-05: no operational notifications.
  - 4.15-05, 07, 08, 09, 11, 12: backup, restore and backup policy.
- **Endpoints with no SRS requirement:**
  - `GET /`: service status route.
  - Opt-in FAQ review collection, a team addition that is off by default: `GET /faq/assistant/review-policy`, `POST /faq/assistant/review-submissions`, `GET`/`PATCH`/`DELETE /faq/review-queue*`.

## BBT vs progress-report conflicts, and how each was settled

The sources compared are the Backend Progress report (PR, 3–4 Nov, claims 93%) and the Black-Box Test Report (BBT, 3 Nov plus the 4 Nov email retest). "Settled" means by this run's live API results.

| # | Requirement | Progress report says | BBT says | Settled (what the code does today) |
| --- | --- | --- | --- | --- |
| 1 | 4.11 FAQ | §4.11 100%, no issue | CUR-10 **Fail (medium)**: placeholder "Who is sir Fidel" is Active and suggested publicly | **Code Done**: the assistant answers only from Active entries and falls back to the inquiry form (FAQ-ASK-*). The placeholder is a **data/content defect on the shared DB** and blocks the demo, not a requirement gap. |
| 2 | 4.12-04/05/06 QR URLs | §4.12 100%; tunnel URL listed as a **Low** e2e/env issue | CUR-09 **Fail (medium)**: exhibit URLs use a trycloudflare tunnel | **Code Done**: URLs come from `PUBLIC_SITE_URL`, and with a stable value the QR, label and public page are correct (EXH-QR-*, EXH-LABEL). It is a **deployment-config defect, Medium** (BBT's severity is right; the PR understated it). |
| 3 | 4.2-02/03 Developer curator list | Listed gap, **Low**; yet §4.2 claimed **97%** | DEV-07 **Fail (medium)** | **Confirmed**: `GET /developer/curators` has no invitation field and shows invitees as ACTIVE (DEV-CURATORS-LIST fails). The PR's 97% contradicts its own gap list, which implies about 83%. |
| 4 | 4.1-15 audit (BBT-04) | not mentioned | "signed in" entry with no matching login; maybe a session refresh | **Not a backend defect**: only `POST /auth/login` writes LOGIN rows, and token refreshes never reach the backend. The 8:47 entry was a second real login call. |
| 5 | 4.8/4.9 write paths and email | "Anything that writes: Not tested"; "nothing was emailed" | MAIL-01..08 all delivered (4 Nov, shared DB) | **Done**: receipt, curator alert, reply, message and approval emails are all sent and recorded (INQ-EMAILS, VIS-EMAILS, INQ-REPLY, VIS-MESSAGE). Note that the BBT retest *did* write to the shared DB, contrary to the PR's scope statement. |
| 6 | 4.8-11 / 4.9-14 history | 100% | Receipts appear only in the audit log, not in record History | **Not a gap**: the SRS requires *curator-initiated* messages in history, and those are recorded. UX observation only. |
| 7 | 4.9-09 Completed before visit date | Observation | — | Confirmed: it returns 200. The SRS states no date rule, so this is a policy decision, not a defect. |
| 8 | Test counts | exhibits "77 of 77" with default URL | — | The exhibits suite has **60** tests, and all 60 pass with the default URL. |
| 9 | DB suites | "Not run (Docker off)" | — | Ran: 75/77 pass on Node 22. On local Node 25 all fail to load (`exports is not defined`); CI uses Node 22. |

## Defects found in this run (not fixed)

1. **NEW – Medium (security), 4.2-02:**
   - **What happens.** `POST /developer/curators/onboard` never sets `onboarding_pending`, so an invite-link session can call curator APIs before any password is set (`GET /dashboard/summary` → 200; test DEV-ONBOARD-SESSION-GATED). Curator-sent invitations are gated correctly.
   - **Where.** `src/developer/developer.service.ts:113`.
   - **Owner.** Voltaire.
2. **Medium, 4.2-02/03:** the Developer curator list has no invitation state (BBT-03/DEV-07). Same root area.
3. **Gaps:**
   - 4.1-08/09: curator activation and handover.
   - 4.3-05/10: operational notifications.
   - 4.15: backup, restore, failure alerts, and backup/restore audit.
   - 4.2-05: AR metadata and compatibility checks.
   - 4.1-11: password events are not audited.
   - 4.1-05: no inactivity timeout.
4. **Low:**
   - Curator alert emails go to every ACTIVE curator account, including invitees who have not accepted (seen in the captured emails).
   - The DB suites need Node 22, and the offline browser suites need `@playwright/cli`.
   - 6 unused `eslint-disable` warnings.
5. **Config/data (shared environment):**
   - Tunnel `PUBLIC_SITE_URL` (QR) and `FRONTEND_URL` = localhost (MAIL-F1).
   - Placeholder FAQ (BBT-01).
   - Offensive placeholder content on a public exhibit, flagged in System Progress.
   - BB-TEST/TEST records to clean before the demo.

## Comparison with Last Progress Report

- **Last report.** "BioSphere Backend Progress", https://claude.ai/artifact/TfwD2P9CgCRiqe7vNtbbkj, dated 2026-11-03 (develop @ `06545c0`). It carries forward the per-requirement itemization of the 28 Oct Completion Report.
- **Later reports.** No later report exists. No commits landed after it, so real progress since then is zero.

**Verdict: broadly accurate, with one overstated module.**

| | Value |
| --- | --- |
| Claimed overall | 93% |
| Actual, Done-only (this report's formula) | 89.6% (**−3.4 pts**) |
| Actual, same statuses scored the report's way | 92.7% (−0.3 pts) |

- **Where the gap comes from.** Almost all of it is the scoring method: the report gave half-credit to Partials. It is not a status error.
- **The status error.** §4.2 was claimed at 97%, but the report's own gap list and the tests support 83%.
- **Requirement rows (192).** Aligned 168, Overstated 0, Understated 1 (4.1-09), Not in report 23.
  - **4.1-09:** the successor-invite path existed since 7 Oct, before the report.
  - **The 23 "Not in report" rows:** frontend-only or provider-managed requirements whose backend applicability the report never itemized.
- **Modules (15).** Aligned 14, Overstated 1 (§4.2), Understated 0, Not in report 0.
- **Missed by the report.** The Developer-onboarding gating defect (new), and an understated severity on the QR tunnel URL.

## Blockers

- Backup/restore procedure and a disposable restore target (4.15) have not been approved.
- A decision is needed on curator vs Developer account control (4.1-08/09).
- The shared-DB content cleanup (FAQ placeholder, exhibit content, test records) and a permanent `PUBLIC_SITE_URL`/`FRONTEND_URL` are owed by the deployment and content owners.

## Work remaining

1. Gate Developer-onboarded invitees, and expose invite state on `/developer/curators`.
2. Build curator activation/handover, or record the scope decision.
3. Add operational notifications (sync failure and the rest of 4.3-10).
4. Build backup job, failure alert, restore, restore audit, and one documented backup/restore test (4.15-05..12).
5. Add AR metadata/compatibility checks.
6. Audit password events.
7. Add an inactivity timeout.


## Module comparison table

| Module | Owner | Last report % | Last report status | Verified % (Done only) | Verified % (last report's method) | Alignment |
| --- | --- | --- | --- | --- | --- | --- |
| §4.1 Authentication and Curator Account Management | Voltaire Ratilla | 85% | Partial | 73.3% | 83.3% | **Aligned** |
| §4.2 Restricted Developer Functions | Voltaire Ratilla | 97% | Partial | 66.7% | 83.3% | **Overstated** |
| §4.3 Curator Dashboard and Notifications | Charles Boquecosa, John Gerozaga | 88% | Partial | 73.3% | 86.7% | **Aligned** |
| §4.4 Specimen Inventory and Cataloging | Kyer Jayme, John Gerozaga | 100% | Done | 100.0% | 100.0% | **Aligned** |
| §4.5 Specimen Lot Grouping and Quantity Management | John Gerozaga | 100% | Done | 100.0% | 100.0% | **Aligned** |
| §4.6 Hierarchical Storage-Location Management | Kyer Jayme | 100% | Done | 100.0% | 100.0% | **Aligned** |
| §4.7 Search, Filtering, Reports, and Export | John Gerozaga, Kyer Jayme | 100% | Done | 100.0% | 100.0% | **Aligned** |
| §4.8 General Inquiry Management | Charles Boquecosa, John Gerozaga | 100% | Done | 100.0% | 100.0% | **Aligned** |
| §4.9 Visit-Request Management | Charles Boquecosa | 100% | Done | 100.0% | 100.0% | **Aligned** |
| §4.10 Static Public Museum Website | Charles Boquecosa, John Gerozaga, Voltaire Ratilla | 100% | Done | 100.0% | 100.0% | **Aligned** |
| §4.11 Controlled Knowledge-Based FAQ Assistant | Kyer Jayme | 100% | Done | 100.0% | 100.0% | **Aligned** |
| §4.12 QR Exhibit Management and Public QR Pages | Voltaire Ratilla | 100% | Done | 100.0% | 100.0% | **Aligned** |
| §4.13 Selected WebAR Experiences | Voltaire Ratilla | 100% | Done | 100.0% | 100.0% | **Aligned** |
| §4.14 Selected Offline Inventory Operations and Synchronization | Kyer Jayme | 100% | Done | 100.0% | 100.0% | **Aligned** |
| §4.15 Audit Logging, Backup, and Recovery | Kyer Jayme | 44% | Partial | 33.3% | 41.7% | **Aligned** |

## Progress per owner

Owners come from `docs/ACCEPTANCE_TEST_PLAN.md` §3. Git history corroborates them; the handle `raidiniom` is not mapped to anyone, because no source in the repo ties it to a named member.

| Owner | Sections | Backend-applicable requirements | Verified % (Done only) | Verified % (Partial = 0.5) |
| --- | --- | --- | --- | --- |
| Charles Boquecosa | §4.3, §4.8, §4.9, §4.10 | 36 | 94.3% | 97.1% |
| John Gerozaga | §4.3, §4.4, §4.5, §4.7, §4.8, §4.10 | 70 | 97.1% | 98.6% |
| Kyer Jayme | §4.4, §4.6, §4.7, §4.11, §4.14, §4.15 | 78 | 89.6% | 90.9% |
| Voltaire Ratilla | §4.1, §4.2, §4.10, §4.12, §4.13 | 43 | 83.3% | 90.5% |

## Rows that are not Aligned

| SRS ID | Module | Last report | Verified | Alignment | Why |
| --- | --- | --- | --- | --- | --- |
| REQ-4.1-09 | §4.1 | Not Started | Partial | **Understated** | A successor can be invited as a separate account, but there is no handover step linking/retaining/deactivating the outgoing account. |
| REQ-4.1-10 | §4.1 | Not itemized | N/A | **Not in report** | not itemized; backend applicability not stated in the last report |
| REQ-4.1-19 | §4.1 | Not itemized | N/A | **Not in report** | not itemized; backend applicability not stated in the last report |
| REQ-4.3-03 | §4.3 | Not itemized | N/A | **Not in report** | not itemized; backend applicability not stated in the last report |
| REQ-4.3-04 | §4.3 | Not itemized | N/A | **Not in report** | not itemized; backend applicability not stated in the last report |
| REQ-4.10-01 | §4.10 | Not itemized | N/A | **Not in report** | not itemized; backend applicability not stated in the last report |
| REQ-4.10-02 | §4.10 | Not itemized | N/A | **Not in report** | not itemized; backend applicability not stated in the last report |
| REQ-4.10-03 | §4.10 | Not itemized | N/A | **Not in report** | not itemized; backend applicability not stated in the last report |
| REQ-4.10-04 | §4.10 | Not itemized | N/A | **Not in report** | not itemized; backend applicability not stated in the last report |
| REQ-4.10-05 | §4.10 | Not itemized | N/A | **Not in report** | not itemized; backend applicability not stated in the last report |
| REQ-4.10-06 | §4.10 | Not itemized | N/A | **Not in report** | not itemized; backend applicability not stated in the last report |
| REQ-4.10-07 | §4.10 | Not itemized | N/A | **Not in report** | not itemized; backend applicability not stated in the last report |
| REQ-4.10-09 | §4.10 | Not itemized | N/A | **Not in report** | not itemized; backend applicability not stated in the last report |
| REQ-4.10-10 | §4.10 | Not itemized | N/A | **Not in report** | not itemized; backend applicability not stated in the last report |
| REQ-4.11-08 | §4.11 | Not itemized | N/A | **Not in report** | not itemized; backend applicability not stated in the last report |
| REQ-4.12-07 | §4.12 | Not itemized | N/A | **Not in report** | not itemized; backend applicability not stated in the last report |
| REQ-4.13-05 | §4.13 | Not itemized | N/A | **Not in report** | not itemized; backend applicability not stated in the last report |
| REQ-4.13-09 | §4.13 | Not itemized | N/A | **Not in report** | not itemized; backend applicability not stated in the last report |
| REQ-4.14-01 | §4.14 | Not itemized | N/A | **Not in report** | not itemized; backend applicability not stated in the last report |
| REQ-4.14-02 | §4.14 | Not itemized | N/A | **Not in report** | not itemized; backend applicability not stated in the last report |
| REQ-4.14-05 | §4.14 | Not itemized | N/A | **Not in report** | not itemized; backend applicability not stated in the last report |
| REQ-4.14-09 | §4.14 | Not itemized | N/A | **Not in report** | not itemized; backend applicability not stated in the last report |
| REQ-4.14-10 | §4.14 | Not itemized | N/A | **Not in report** | not itemized; backend applicability not stated in the last report |
| REQ-4.14-12 | §4.14 | Not itemized | N/A | **Not in report** | not itemized; backend applicability not stated in the last report |

## Requirement tables per module

### §4.1 Authentication and Curator Account Management — 73.3%

Owner: **Voltaire Ratilla** (Acceptance plan §3: Authentication and Access Control). Last report: 85% → verified 73.3%; **Aligned**. Done 11, Partial 3, Not Started 1 of 15 backend-applicable; API cases 552 passed / 4 failed.

| SRS ID | Requirement | Status | Test result | Last report | Alignment | Owner |
| --- | --- | --- | --- | --- | --- | --- |
| REQ-4.1-01 | Authenticate registered, active curators before curator functions | **Done** | 3 pass / 0 fail | Done | Aligned | Voltaire Ratilla |
| REQ-4.1-02 | Separate credentials per curator; no credential sharing | **Done** | 1 pass / 0 fail | Done | Aligned | Voltaire Ratilla |
| REQ-4.1-03 | No public self-registration for curator accounts | **Done** | 0 pass / 0 fail; static: Route inventory: the only public auth routes are /auth/login and /auth/onboarding/complete; no sign-up route exists. | Done | Aligned | Voltaire Ratilla |
| REQ-4.1-04 | Protected authenticated session after login | **Done** | 2 pass / 0 fail | Done | Aligned | Voltaire Ratilla |
| REQ-4.1-05 | Secure logout and session end after logout or approved inactivity timeout | **Partial** | 0 pass / 0 fail; gap: Logout is the frontend Supabase signOut; the backend rejects revoked sessions because it validates each token with Supabase, but there is no inactivity timeout. | Partial | Aligned | Voltaire Ratilla |
| REQ-4.1-06 | Block unauthenticated access to protected routes, data and API operations | **Done** | 260 pass / 0 fail | Done | Aligned | Voltaire Ratilla |
| REQ-4.1-07 | Curator invites a separate curator account with a secure password-setup email | **Done** | 14 pass / 0 fail | Done | Aligned | Voltaire Ratilla |
| REQ-4.1-08 | Curator activates/deactivates another curator per the approved procedure | **Not Started** | 1 pass / 1 fail; gap: No curator-side activation/deactivation route; only the Developer route exists.; failing: ACCT-CURATOR-ACTIVATE: expected 200 + checks, got None | Not Started | Aligned | Voltaire Ratilla |
| REQ-4.1-09 | Curator succession/handover with a separate successor account | **Partial** | 0 pass / 1 fail; gap: A successor can be invited as a separate account, but there is no handover step linking/retaining/deactivating the outgoing account.; failing: ACCT-CURATOR-ACTIVATE: expected 200 + checks, got None | Not Started | Understated | Voltaire Ratilla |
| REQ-4.1-10 | Email-based recovery/reset with a secure time-limited link, no disclosure | **N/A** | Not applicable to the backend (Supabase-provider managed) | Not itemized | Not in report | Voltaire Ratilla |
| REQ-4.1-11 | Audit account creation, invitation, password setup/change/reset, (de)activation, handover | **Partial** | 3 pass / 0 fail; gap: Password setup/change/reset happen in Supabase and leave no BioSphere audit entry; handover does not exist. | Partial | Aligned | Voltaire Ratilla |
| REQ-4.1-12 | Inactive curator accounts cannot authenticate or gain permissions | **Done** | 132 pass / 0 fail | Done | Aligned | Voltaire Ratilla |
| REQ-4.1-13 | Authenticate active Developer accounts before Developer functions | **Done** | 1 pass / 0 fail | Done | Aligned | Voltaire Ratilla |
| REQ-4.1-14 | Role separation: curators kept out of Developer functions and vice versa | **Done** | 129 pass / 0 fail | Done | Aligned | Voltaire Ratilla |
| REQ-4.1-15 | Log successful/unsuccessful authentication and restricted account actions without secrets | **Done** | 4 pass / 0 fail | Done | Aligned | Voltaire Ratilla |
| REQ-4.1-16 | Authenticated curator/Developer can change own password | **N/A** | Not applicable to the backend (Supabase-provider managed) | N/A | Aligned | Voltaire Ratilla |
| REQ-4.1-17 | Never email a current or temporary password | **Done** | 1 pass / 0 fail | Done | Aligned | Voltaire Ratilla |
| REQ-4.1-18 | Confirmation email after password change | **N/A** | Not applicable to the backend (Supabase-provider managed) | N/A | Aligned | Voltaire Ratilla |
| REQ-4.1-19 | Invitation and reset links expire and cannot be reused | **N/A** | Not applicable to the backend (Supabase-provider managed) | Not itemized | Not in report | Voltaire Ratilla |

### §4.2 Restricted Developer Functions — 66.7%

Owner: **Voltaire Ratilla** (Acceptance plan §3 / CLAUDE.md: authentication/access control and WebAR (Developer functions are account control + AR deployment)). Last report: 97% → verified 66.7%; **Overstated**. Done 6, Partial 3, Not Started 0 of 9 backend-applicable; API cases 267 passed / 4 failed.

| SRS ID | Requirement | Status | Test result | Last report | Alignment | Owner |
| --- | --- | --- | --- | --- | --- | --- |
| REQ-4.2-01 | Authenticate the Developer before restricted technical functions | **Done** | 0 pass / 0 fail | Done | Aligned | Voltaire Ratilla |
| REQ-4.2-02 | Developer provisions the initial curator with a password-setup invitation | **Partial** | 2 pass / 3 fail; failing: DEV-ONBOARD-PENDING-FLAG: expected 200 + checks, got 200; DEV-ONBOARD-SESSION-GATED: expected 403, got 200; DEV-CURATORS-LIST: expected 200 + checks, got 200 | Partial | Aligned | Voltaire Ratilla |
| REQ-4.2-03 | Developer (de)activates a curator only with recorded formal authorization | **Partial** | 3 pass / 1 fail; failing: DEV-CURATORS-LIST: expected 200 + checks, got 200 | Partial | Aligned | Voltaire Ratilla |
| REQ-4.2-04 | Developer uploads/replaces/activates/deactivates/removes approved AR assets | **Done** | 6 pass / 0 fail | Done | Aligned | Voltaire Ratilla |
| REQ-4.2-05 | Validate AR asset type, size, required metadata, technical compatibility and authorization before activation | **Partial** | 2 pass / 0 fail; gap: Type, size, file signature and authorization reference are enforced; required metadata and technical compatibility are not checked on the server. | Partial | Aligned | Voltaire Ratilla |
| REQ-4.2-06 | Developer cannot create/edit/archive/move/publish specimen records | **Done** | 120 pass / 0 fail | Done | Aligned | Voltaire Ratilla |
| REQ-4.2-07 | Developer cannot manage locations, inquiries, visits, reports, FAQ or public content | **Done** | 120 pass / 0 fail | Done | Aligned | Voltaire Ratilla |
| REQ-4.2-08 | Developer interface exposes only account controls and AR deployment | **Done** | 10 pass / 0 fail | Done | Aligned | Voltaire Ratilla |
| REQ-4.2-09 | Audit all Developer account and AR deployment actions | **Done** | 4 pass / 0 fail | Done | Aligned | Voltaire Ratilla |

### §4.3 Curator Dashboard and Notifications — 73.3%

Owner: **Charles Boquecosa, John Gerozaga** (Acceptance plan §3: Curator Dashboard (shared)). Last report: 88% → verified 73.3%; **Aligned**. Done 6, Partial 2, Not Started 0 of 8 backend-applicable; API cases 14 passed / 2 failed.

| SRS ID | Requirement | Status | Test result | Last report | Alignment | Owner |
| --- | --- | --- | --- | --- | --- | --- |
| REQ-4.3-01 | Dashboard counts for Uncataloged/Cataloged/Archived and collection categories | **Done** | 2 pass / 0 fail | Done | Aligned | Charles Boquecosa, John Gerozaga |
| REQ-4.3-02 | Dashboard shows pending inquiries and visit requests | **Done** | 1 pass / 0 fail | Done | Aligned | Charles Boquecosa, John Gerozaga |
| REQ-4.3-03 | Display Online/Offline/Pending Sync/Synchronizing/Synchronized/Sync Failed draft states | **N/A** | Not applicable to the backend (frontend) | Not itemized | Not in report | Charles Boquecosa, John Gerozaga |
| REQ-4.3-04 | Quick actions: add specimen, review requests, reports, offline drafts | **N/A** | Not applicable to the backend (frontend) | Not itemized | Not in report | Charles Boquecosa, John Gerozaga |
| REQ-4.3-05 | In-system notifications for new inquiries, new visits, sync failures and approved alerts | **Partial** | 2 pass / 1 fail; gap: Feed types are NEW_INQUIRY, NEW_VISIT_REQUEST and SUBMISSION_EMAIL_FAILED only; no sync-failure or other operational alerts.; failing: NOTIF-SYNC-FAILED: expected 200 + checks, got None | Partial | Aligned | Charles Boquecosa, John Gerozaga |
| REQ-4.3-06 | Open the related record from a notification | **Done** | 2 pass / 0 fail | Done | Aligned | Charles Boquecosa, John Gerozaga |
| REQ-4.3-07 | Mark notifications read/dismissed without altering audit/operational records | **Done** | 2 pass / 0 fail | Done | Aligned | Charles Boquecosa, John Gerozaga |
| REQ-4.3-08 | No private details in notifications to unauthorized users | **Done** | 1 pass / 0 fail | Done | Aligned | Charles Boquecosa, John Gerozaga |
| REQ-4.3-09 | Email alerts to the curator for new inquiries and visit requests | **Done** | 2 pass / 0 fail | Done | Aligned | Charles Boquecosa, John Gerozaga |
| REQ-4.3-10 | Use in-system notifications (not email) for sync failures, backups, reports, QR/AR and other internal alerts | **Partial** | 0 pass / 1 fail; gap: None of these internal events produce an in-system notification.; failing: NOTIF-SYNC-FAILED: expected 200 + checks, got None | Partial | Aligned | Charles Boquecosa, John Gerozaga |

### §4.4 Specimen Inventory and Cataloging — 100.0%

Owner: **Kyer Jayme, John Gerozaga** (Acceptance plan §3: Cataloging Management (Kyer); Specimen Inventory boundary (John)). Last report: 100% → verified 100.0%; **Aligned**. Done 23, Partial 0, Not Started 0 of 23 backend-applicable; API cases 73 passed / 0 failed.

| SRS ID | Requirement | Status | Test result | Last report | Alignment | Owner |
| --- | --- | --- | --- | --- | --- | --- |
| REQ-4.4-01 | Create and save a specimen record | **Done** | 10 pass / 0 fail | Done | Aligned | Kyer Jayme, John Gerozaga |
| REQ-4.4-02 | Unique system-generated specimen ID | **Done** | 1 pass / 0 fail | Done | Aligned | Kyer Jayme, John Gerozaga |
| REQ-4.4-03 | Accession number may stay null until assigned | **Done** | 1 pass / 0 fail | Done | Aligned | Kyer Jayme, John Gerozaga |
| REQ-4.4-04 | Enforce accession-number uniqueness | **Done** | 4 pass / 0 fail | Done | Aligned | Kyer Jayme, John Gerozaga |
| REQ-4.4-05 | Each record has status Uncataloged, Cataloged or Archived | **Done** | 1 pass / 0 fail | Done | Aligned | Kyer Jayme, John Gerozaga |
| REQ-4.4-06 | New incomplete records are Uncataloged | **Done** | 2 pass / 0 fail | Done | Aligned | Kyer Jayme, John Gerozaga |
| REQ-4.4-07 | Cataloged only when all required non-image fields are valid | **Done** | 3 pass / 0 fail | Done | Aligned | Kyer Jayme, John Gerozaga |
| REQ-4.4-08 | Identify and display missing/invalid required fields | **Done** | 4 pass / 0 fail | Done | Aligned | Kyer Jayme, John Gerozaga |
| REQ-4.4-09 | View and edit Uncataloged and Cataloged records | **Done** | 11 pass / 0 fail | Done | Aligned | Kyer Jayme, John Gerozaga |
| REQ-4.4-10 | Archive instead of permanently deleting | **Done** | 4 pass / 0 fail | Done | Aligned | Kyer Jayme, John Gerozaga |
| REQ-4.4-11 | Uncataloged and Archived records cannot be published | **Done** | 2 pass / 0 fail | Done | Aligned | Kyer Jayme, John Gerozaga |
| REQ-4.4-12 | Attach, view, replace and remove specimen images | **Done** | 8 pass / 0 fail | Done | Aligned | Kyer Jayme, John Gerozaga |
| REQ-4.4-13 | Images optional for cataloging | **Done** | 1 pass / 0 fail | Done | Aligned | Kyer Jayme, John Gerozaga |
| REQ-4.4-14 | Classification status and condition stored only as entered by a curator | **Done** | 2 pass / 0 fail | Done | Aligned | Kyer Jayme, John Gerozaga |
| REQ-4.4-15 | Mark/unmark a Cataloged record for public display | **Done** | 2 pass / 0 fail | Done | Aligned | Kyer Jayme, John Gerozaga |
| REQ-4.4-16 | Public-display flag does not publish the full internal record | **Done** | 2 pass / 0 fail | Done | Aligned | Kyer Jayme, John Gerozaga |
| REQ-4.4-17 | Preserve creator, editor, timestamps and archive actor/time | **Done** | 4 pass / 0 fail | Done | Aligned | Kyer Jayme, John Gerozaga |
| REQ-4.4-18 | Manual specimen record encoding | **Done** | 1 pass / 0 fail | Done | Aligned | Kyer Jayme, John Gerozaga |
| REQ-4.4-19 | Import through an approved spreadsheet/CSV template | **Done** | 2 pass / 0 fail | Done | Aligned | Kyer Jayme, John Gerozaga |
| REQ-4.4-20 | Validate imported rows before saving | **Done** | 3 pass / 0 fail | Done | Aligned | Kyer Jayme, John Gerozaga |
| REQ-4.4-21 | Warn on possible duplicates | **Done** | 2 pass / 0 fail | Done | Aligned | Kyer Jayme, John Gerozaga |
| REQ-4.4-22 | Never auto-merge/delete duplicates | **Done** | 2 pass / 0 fail | Done | Aligned | Kyer Jayme, John Gerozaga |
| REQ-4.4-23 | Allow separate records for the same species | **Done** | 1 pass / 0 fail | Done | Aligned | Kyer Jayme, John Gerozaga |

### §4.5 Specimen Lot Grouping and Quantity Management — 100.0%

Owner: **John Gerozaga** (Acceptance plan §3: Specimen Inventory Management). Last report: 100% → verified 100.0%; **Aligned**. Done 11, Partial 0, Not Started 0 of 11 backend-applicable; API cases 21 passed / 0 failed.

| SRS ID | Requirement | Status | Test result | Last report | Alignment | Owner |
| --- | --- | --- | --- | --- | --- | --- |
| REQ-4.5-01 | A specimen record holds one or more active lots | **Done** | 2 pass / 0 fail | Done | Aligned | John Gerozaga |
| REQ-4.5-02 | Each lot has one location, one condition and a positive quantity | **Done** | 4 pass / 0 fail | Done | Aligned | John Gerozaga |
| REQ-4.5-03 | Record total = sum of active lot quantities | **Done** | 1 pass / 0 fail | Done | Aligned | John Gerozaga |
| REQ-4.5-04 | Partial move splits the source lot into a target lot | **Done** | 1 pass / 0 fail | Done | Aligned | John Gerozaga |
| REQ-4.5-05 | Partial condition change splits into a target lot | **Done** | 1 pass / 0 fail | Done | Aligned | John Gerozaga |
| REQ-4.5-06 | Partial move/condition change keeps the record total | **Done** | 2 pass / 0 fail | Done | Aligned | John Gerozaga |
| REQ-4.5-07 | Merge into an existing matching target lot | **Done** | 1 pass / 0 fail | Done | Aligned | John Gerozaga |
| REQ-4.5-08 | Block moves/changes larger than the source lot | **Done** | 1 pass / 0 fail | Done | Aligned | John Gerozaga |
| REQ-4.5-09 | Quantity changes only through authorized adjustment types | **Done** | 3 pass / 0 fail | Done | Aligned | John Gerozaga |
| REQ-4.5-10 | Require/record reasons for removals, condition and location changes | **Done** | 2 pass / 0 fail | Done | Aligned | John Gerozaga |
| REQ-4.5-11 | Record actor, time, source/target lot and quantity for splits/merges | **Done** | 3 pass / 0 fail | Done | Aligned | John Gerozaga |

### §4.6 Hierarchical Storage-Location Management — 100.0%

Owner: **Kyer Jayme** (Acceptance plan §3: Storage Location Management). Last report: 100% → verified 100.0%; **Aligned**. Done 12, Partial 0, Not Started 0 of 12 backend-applicable; API cases 29 passed / 0 failed.

| SRS ID | Requirement | Status | Test result | Last report | Alignment | Owner |
| --- | --- | --- | --- | --- | --- | --- |
| REQ-4.6-01 | Support rooms, cabinets, drawers, boxes, vials and approved unit types | **Done** | 1 pass / 0 fail | Done | Aligned | Kyer Jayme |
| REQ-4.6-02 | Create, view, update, archive and organize storage units | **Done** | 7 pass / 0 fail | Done | Aligned | Kyer Jayme |
| REQ-4.6-03 | Parent-child storage relationships | **Done** | 2 pass / 0 fail | Done | Aligned | Kyer Jayme |
| REQ-4.6-04 | Store label, type, parent, holds-specimens and optional capacity | **Done** | 6 pass / 0 fail | Done | Aligned | Kyer Jayme |
| REQ-4.6-05 | Lots only in units configured to hold specimens | **Done** | 1 pass / 0 fail | Done | Aligned | Kyer Jayme |
| REQ-4.6-06 | Move all or part of a lot to another valid unit | **Done** | 1 pass / 0 fail | Done | Aligned | Kyer Jayme |
| REQ-4.6-07 | Move a container by changing its parent, keeping its children | **Done** | 1 pass / 0 fail | Done | Aligned | Kyer Jayme |
| REQ-4.6-08 | Derive the room/gallery from the hierarchy | **Done** | 1 pass / 0 fail | Done | Aligned | Kyer Jayme |
| REQ-4.6-09 | Record each lot movement with quantity, from/to, actor, time and reason | **Done** | 3 pass / 0 fail | Done | Aligned | Kyer Jayme |
| REQ-4.6-10 | No internal storage locations on public site, QR, FAQ or AR | **Done** | 1 pass / 0 fail | Done | Aligned | Kyer Jayme |
| REQ-4.6-11 | Warn when assignment would exceed optional capacity | **Done** | 3 pass / 0 fail | Done | Aligned | Kyer Jayme |
| REQ-4.6-12 | Reject self/descendant parents and invalid combinations | **Done** | 2 pass / 0 fail | Done | Aligned | Kyer Jayme |

### §4.7 Search, Filtering, Reports, and Export — 100.0%

Owner: **John Gerozaga, Kyer Jayme** (Acceptance plan §3/§9: Reports and Data Export (John); catalog search CAT-012 (Kyer)). Last report: 100% → verified 100.0%; **Aligned**. Done 16, Partial 0, Not Started 0 of 16 backend-applicable; API cases 29 passed / 0 failed.

| SRS ID | Requirement | Status | Test result | Last report | Alignment | Owner |
| --- | --- | --- | --- | --- | --- | --- |
| REQ-4.7-01 | Search by accession number, system ID, names, category and identifiers | **Done** | 1 pass / 0 fail | Done | Aligned | John Gerozaga, Kyer Jayme |
| REQ-4.7-02 | Filter by taxonomy, category, status, classification, condition, public display, location | **Done** | 7 pass / 0 fail | Done | Aligned | John Gerozaga, Kyer Jayme |
| REQ-4.7-03 | Sort inventory tables by relevant columns | **Done** | 2 pass / 0 fail | Done | Aligned | John Gerozaga, Kyer Jayme |
| REQ-4.7-04 | Select report type, period, filters and output format | **Done** | 2 pass / 0 fail | Done | Aligned | John Gerozaga, Kyer Jayme |
| REQ-4.7-05 | Consolidated Museum Operations Report for monthly/yearly/custom periods | **Done** | 1 pass / 0 fail | Done | Aligned | John Gerozaga, Kyer Jayme |
| REQ-4.7-06 | Consolidated report content (inventory, changes, inquiries, visits, QR/AR, remarks) | **Done** | 1 pass / 0 fail | Done | Aligned | John Gerozaga, Kyer Jayme |
| REQ-4.7-07 | Complete or filtered Inventory Report | **Done** | 2 pass / 0 fail | Done | Aligned | John Gerozaga, Kyer Jayme |
| REQ-4.7-08 | General Inquiry Summary by date range and status | **Done** | 1 pass / 0 fail | Done | Aligned | John Gerozaga, Kyer Jayme |
| REQ-4.7-09 | Visit-Request Summary by date range and status | **Done** | 1 pass / 0 fail | Done | Aligned | John Gerozaga, Kyer Jayme |
| REQ-4.7-10 | QR and AR Exhibit Report | **Done** | 2 pass / 0 fail | Done | Aligned | John Gerozaga, Kyer Jayme |
| REQ-4.7-11 | Export the Consolidated report as DOCX | **Done** | 1 pass / 0 fail | Done | Aligned | John Gerozaga, Kyer Jayme |
| REQ-4.7-12 | PDF/printable output and CSV for tabular exports | **Done** | 2 pass / 0 fail | Done | Aligned | John Gerozaga, Kyer Jayme |
| REQ-4.7-13 | Private visitor and storage data only in authorized internal outputs | **Done** | 1 pass / 0 fail | Done | Aligned | John Gerozaga, Kyer Jayme |
| REQ-4.7-14 | Audit report generation, filters, output, actor and time | **Done** | 2 pass / 0 fail | Done | Aligned | John Gerozaga, Kyer Jayme |
| REQ-4.7-15 | Validate parameters and give understandable failure messages | **Done** | 2 pass / 0 fail | Done | Aligned | John Gerozaga, Kyer Jayme |
| REQ-4.7-16 | DOCX exports are separate files that do not modify source records | **Done** | 1 pass / 0 fail | Done | Aligned | John Gerozaga, Kyer Jayme |

### §4.8 General Inquiry Management — 100.0%

Owner: **Charles Boquecosa, John Gerozaga** (Acceptance plan §3: General Inquiry Management (shared)). Last report: 100% → verified 100.0%; **Aligned**. Done 11, Partial 0, Not Started 0 of 11 backend-applicable; API cases 38 passed / 0 failed.

| SRS ID | Requirement | Status | Test result | Last report | Alignment | Owner |
| --- | --- | --- | --- | --- | --- | --- |
| REQ-4.8-01 | Visitors submit a general inquiry without an account | **Done** | 2 pass / 0 fail | Done | Aligned | Charles Boquecosa, John Gerozaga |
| REQ-4.8-02 | Collect only the approved minimum fields | **Done** | 2 pass / 0 fail | Done | Aligned | Charles Boquecosa, John Gerozaga |
| REQ-4.8-03 | Validate required fields, lengths and email format | **Done** | 2 pass / 0 fail | Done | Aligned | Charles Boquecosa, John Gerozaga |
| REQ-4.8-04 | Store ID, timestamp, status and consent record | **Done** | 1 pass / 0 fail | Done | Aligned | Charles Boquecosa, John Gerozaga |
| REQ-4.8-05 | Curators view, search, filter and compose replies | **Done** | 4 pass / 0 fail | Done | Aligned | Charles Boquecosa, John Gerozaga |
| REQ-4.8-06 | Statuses Pending, Reviewed, Turned to Visit Request, Closed | **Done** | 3 pass / 0 fail | Done | Aligned | Charles Boquecosa, John Gerozaga |
| REQ-4.8-07 | Manually refer an inquiry to the visit-request workflow | **Done** | 2 pass / 0 fail | Done | Aligned | Charles Boquecosa, John Gerozaga |
| REQ-4.8-08 | In-system alert and email to the curator for a new inquiry | **Done** | 2 pass / 0 fail | Done | Aligned | Charles Boquecosa, John Gerozaga |
| REQ-4.8-09 | Send curator replies by email and record message, time, actor and delivery result | **Done** | 2 pass / 0 fail | Done | Aligned | Charles Boquecosa, John Gerozaga |
| REQ-4.8-10 | No inquiry data to public or unauthorized actors | **Done** | 14 pass / 0 fail | Done | Aligned | Charles Boquecosa, John Gerozaga |
| REQ-4.8-11 | Record replies, status changes, referrals and notes; no auto-import of external mail | **Done** | 4 pass / 0 fail | Done | Aligned | Charles Boquecosa, John Gerozaga |

### §4.9 Visit-Request Management — 100.0%

Owner: **Charles Boquecosa** (Acceptance plan §3: Visit Request Management). Last report: 100% → verified 100.0%; **Aligned**. Done 16, Partial 0, Not Started 0 of 16 backend-applicable; API cases 47 passed / 0 failed.

| SRS ID | Requirement | Status | Test result | Last report | Alignment | Owner |
| --- | --- | --- | --- | --- | --- | --- |
| REQ-4.9-01 | Visitors submit a visit request without an account | **Done** | 2 pass / 0 fail | Done | Aligned | Charles Boquecosa |
| REQ-4.9-02 | At least one preferred schedule, multiple allowed | **Done** | 2 pass / 0 fail | Done | Aligned | Charles Boquecosa |
| REQ-4.9-03 | Each preferred schedule stored as a child record | **Done** | 1 pass / 0 fail | Done | Aligned | Charles Boquecosa |
| REQ-4.9-04 | Collect contact, organization, visitor count, purpose | **Done** | 1 pass / 0 fail | Done | Aligned | Charles Boquecosa |
| REQ-4.9-05 | Optional vehicle information stored separately | **Done** | 2 pass / 0 fail | Done | Aligned | Charles Boquecosa |
| REQ-4.9-06 | Validate fields, schedules, counts, contact, consent and limits | **Done** | 4 pass / 0 fail | Done | Aligned | Charles Boquecosa |
| REQ-4.9-07 | In-system alert and email to the curator for a new visit request | **Done** | 2 pass / 0 fail | Done | Aligned | Charles Boquecosa |
| REQ-4.9-08 | Curators view, search, filter, review and message visit requests | **Done** | 2 pass / 0 fail | Done | Aligned | Charles Boquecosa |
| REQ-4.9-09 | Statuses Pending, Approved, Submitted for Campus Entry, Declined, Cancelled, Completed | **Done** | 4 pass / 0 fail | Done | Aligned | Charles Boquecosa |
| REQ-4.9-10 | Request more information while keeping the status; record the message | **Done** | 1 pass / 0 fail | Done | Aligned | Charles Boquecosa |
| REQ-4.9-11 | Send messages/status updates by email and record delivery result | **Done** | 2 pass / 0 fail | Done | Aligned | Charles Boquecosa |
| REQ-4.9-12 | Consolidated visitor/schedule summary for the manual USC process | **Done** | 1 pass / 0 fail | Done | Aligned | Charles Boquecosa |
| REQ-4.9-13 | No direct submission to USC ISMIS | **Done** | 1 pass / 0 fail | Done | Aligned | Charles Boquecosa |
| REQ-4.9-14 | Record status history, actor, time, messages and notes | **Done** | 4 pass / 0 fail | Done | Aligned | Charles Boquecosa |
| REQ-4.9-15 | Restrict visit-request personal data to authorized access | **Done** | 16 pass / 0 fail | Done | Aligned | Charles Boquecosa |
| REQ-4.9.16 | Select the approved schedule and keep the other options (SRS writes this ID with a dot) | **Done** | 2 pass / 0 fail | Done | Aligned | Charles Boquecosa |

### §4.10 Static Public Museum Website — 100.0%

Owner: **Charles Boquecosa, John Gerozaga, Voltaire Ratilla** (Acceptance plan §3: Public Museum Website (shared)). Last report: 100% → verified 100.0%; **Aligned**. Done 1, Partial 0, Not Started 0 of 1 backend-applicable; API cases 2 passed / 0 failed.

| SRS ID | Requirement | Status | Test result | Last report | Alignment | Owner |
| --- | --- | --- | --- | --- | --- | --- |
| REQ-4.10-01 | Home, Gallery, Visit and About areas | **N/A** | Not applicable to the backend (frontend) | Not itemized | Not in report | Charles Boquecosa, John Gerozaga, Voltaire Ratilla |
| REQ-4.10-02 | Plan Your Visit action opens the Visit area | **N/A** | Not applicable to the backend (frontend) | Not itemized | Not in report | Charles Boquecosa, John Gerozaga, Voltaire Ratilla |
| REQ-4.10-03 | No Events page in the MVP | **N/A** | Not applicable to the backend (frontend) | Not itemized | Not in report | Charles Boquecosa, John Gerozaga, Voltaire Ratilla |
| REQ-4.10-04 | Gallery shows curator-approved content without the internal inventory | **N/A** | Not applicable to the backend (frontend) | Not itemized | Not in report | Charles Boquecosa, John Gerozaga, Voltaire Ratilla |
| REQ-4.10-05 | Visit area gives guidance, inquiry and visit-request access | **N/A** | Not applicable to the backend (frontend) | Not itemized | Not in report | Charles Boquecosa, John Gerozaga, Voltaire Ratilla |
| REQ-4.10-06 | About area with approved background, personnel, contact and location | **N/A** | Not applicable to the backend (frontend) | Not itemized | Not in report | Charles Boquecosa, John Gerozaga, Voltaire Ratilla |
| REQ-4.10-07 | Page content is static and not editable through curator/Developer interfaces | **N/A** | Not applicable to the backend (frontend) | Not itemized | Not in report | Charles Boquecosa, John Gerozaga, Voltaire Ratilla |
| REQ-4.10-08 | Public website exposes no storage, remarks, audit, account or visitor data | **Done** | 2 pass / 0 fail | Done | Aligned | Charles Boquecosa, John Gerozaga, Voltaire Ratilla |
| REQ-4.10-09 | Responsive layouts | **N/A** | Not applicable to the backend (frontend) | Not itemized | Not in report | Charles Boquecosa, John Gerozaga, Voltaire Ratilla |
| REQ-4.10-10 | Content changes require a frontend source update and redeployment | **N/A** | Not applicable to the backend (frontend) | Not itemized | Not in report | Charles Boquecosa, John Gerozaga, Voltaire Ratilla |

### §4.11 Controlled Knowledge-Based FAQ Assistant — 100.0%

Owner: **Kyer Jayme** (Acceptance plan §3: Controlled Knowledge-Based FAQ Assistant). Last report: 100% → verified 100.0%; **Aligned**. Done 9, Partial 0, Not Started 0 of 9 backend-applicable; API cases 29 passed / 0 failed.

| SRS ID | Requirement | Status | Test result | Last report | Alignment | Owner |
| --- | --- | --- | --- | --- | --- | --- |
| REQ-4.11-01 | Public controlled FAQ assistant | **Done** | 6 pass / 0 fail | Done | Aligned | Kyer Jayme |
| REQ-4.11-02 | Create, edit, activate, deactivate and archive FAQ entries | **Done** | 9 pass / 0 fail | Done | Aligned | Kyer Jayme |
| REQ-4.11-03 | Alternative wording, keywords and categories for matching | **Done** | 2 pass / 0 fail | Done | Aligned | Kyer Jayme |
| REQ-4.11-04 | Answer only from active approved entries | **Done** | 3 pass / 0 fail | Done | Aligned | Kyer Jayme |
| REQ-4.11-05 | No general knowledge, species identification, invented facts or visit processing | **Done** | 1 pass / 0 fail | Done | Aligned | Kyer Jayme |
| REQ-4.11-06 | No match: say no approved answer and point to the inquiry form | **Done** | 1 pass / 0 fail | Done | Aligned | Kyer Jayme |
| REQ-4.11-07 | No personal data requested/stored; no private data shown | **Done** | 4 pass / 0 fail | Done | Aligned | Kyer Jayme |
| REQ-4.11-08 | Assistant requires an internet connection | **N/A** | Not applicable to the backend (frontend) | Not itemized | Not in report | Kyer Jayme |
| REQ-4.11-09 | Audit FAQ knowledge changes | **Done** | 2 pass / 0 fail | Done | Aligned | Kyer Jayme |
| REQ-4.11-10 | Indicate answers are limited to curator-approved information | **Done** | 1 pass / 0 fail | Done | Aligned | Kyer Jayme |

### §4.12 QR Exhibit Management and Public QR Pages — 100.0%

Owner: **Voltaire Ratilla** (Acceptance plan §3: Exhibit and QR Content Management). Last report: 100% → verified 100.0%; **Aligned**. Done 11, Partial 0, Not Started 0 of 11 backend-applicable; API cases 34 passed / 0 failed.

| SRS ID | Requirement | Status | Test result | Last report | Alignment | Owner |
| --- | --- | --- | --- | --- | --- | --- |
| REQ-4.12-01 | Create, edit, publish, unpublish, disable, archive QR exhibit pages for approved records | **Done** | 7 pass / 0 fail | Done | Aligned | Voltaire Ratilla |
| REQ-4.12-02 | Require public-display approval before use as a QR source | **Done** | 2 pass / 0 fail | Done | Aligned | Voltaire Ratilla |
| REQ-4.12-03 | Curator controls which approved fields, text and images appear | **Done** | 7 pass / 0 fail | Done | Aligned | Voltaire Ratilla |
| REQ-4.12-04 | Unique public URL per published page | **Done** | 2 pass / 0 fail | Done | Aligned | Voltaire Ratilla |
| REQ-4.12-05 | Printable QR code opening the published page | **Done** | 3 pass / 0 fail | Done | Aligned | Voltaire Ratilla |
| REQ-4.12-06 | Downloadable/printable label with QR and readable URL | **Done** | 1 pass / 0 fail | Done | Aligned | Voltaire Ratilla |
| REQ-4.12-07 | QR pages outside normal navigation, reached by direct link/QR | **N/A** | Not applicable to the backend (frontend) | Not itemized | Not in report | Voltaire Ratilla |
| REQ-4.12-08 | No storage, condition, remarks, audit or restricted fields on QR pages | **Done** | 2 pass / 0 fail | Done | Aligned | Voltaire Ratilla |
| REQ-4.12-09 | Disabled/unpublished URL shows a safe unavailable message | **Done** | 4 pass / 0 fail | Done | Aligned | Voltaire Ratilla |
| REQ-4.12-10 | Keep the URL when content changes unless intentionally replaced | **Done** | 2 pass / 0 fail | Done | Aligned | Voltaire Ratilla |
| REQ-4.12-11 | Audit QR publication changes | **Done** | 3 pass / 0 fail | Done | Aligned | Voltaire Ratilla |
| REQ-4.12-12 | Direct URL works without QR scanning | **Done** | 1 pass / 0 fail | Done | Aligned | Voltaire Ratilla |

### §4.13 Selected WebAR Experiences — 100.0%

Owner: **Voltaire Ratilla** (Acceptance plan §3: QR Exhibit and WebAR). Last report: 100% → verified 100.0%; **Aligned**. Done 7, Partial 0, Not Started 0 of 7 backend-applicable; API cases 13 passed / 0 failed.

| SRS ID | Requirement | Status | Test result | Last report | Alignment | Owner |
| --- | --- | --- | --- | --- | --- | --- |
| REQ-4.13-01 | WebAR/3D only for selected approved exhibits with assets; curator marks AR selection | **Done** | 1 pass / 0 fail | Done | Aligned | Voltaire Ratilla |
| REQ-4.13-02 | AR selection is curator discretion (relevance, conservation, rarity...) | **Done** | 1 pass / 0 fail | Done | Aligned | Voltaire Ratilla |
| REQ-4.13-03 | Developer manages AR assets; View in AR only with an active usable asset | **Done** | 6 pass / 0 fail | Done | Aligned | Voltaire Ratilla |
| REQ-4.13-04 | Without AR capability, regular content stays available | **Done** | 2 pass / 0 fail | Done | Aligned | Voltaire Ratilla |
| REQ-4.13-05 | Camera permission only after the visitor starts AR | **N/A** | Not applicable to the backend (frontend) | Not itemized | Not in report | Voltaire Ratilla |
| REQ-4.13-06 | QR page remains available when AR is unavailable or fails | **Done** | 1 pass / 0 fail | Done | Aligned | Voltaire Ratilla |
| REQ-4.13-07 | AR uses only public exhibit information; no internal data | **Done** | 1 pass / 0 fail | Done | Aligned | Voltaire Ratilla |
| REQ-4.13-08 | No automatic AR eligibility scoring; curator approves | **Done** | 1 pass / 0 fail | Done | Aligned | Voltaire Ratilla |
| REQ-4.13-09 | Understandable message when AR is unsupported or fails | **N/A** | Not applicable to the backend (frontend) | Not itemized | Not in report | Voltaire Ratilla |

### §4.14 Selected Offline Inventory Operations and Synchronization — 100.0%

Owner: **Kyer Jayme** (Acceptance plan §3: Limited Offline Record Caching, Draft Synchronization). Last report: 100% → verified 100.0%; **Aligned**. Done 6, Partial 0, Not Started 0 of 6 backend-applicable; API cases 9 passed / 0 failed.

| SRS ID | Requirement | Status | Test result | Last report | Alignment | Owner |
| --- | --- | --- | --- | --- | --- | --- |
| REQ-4.14-01 | View previously synchronized records while offline | **N/A** | Not applicable to the backend (frontend) | Not itemized | Not in report | Kyer Jayme |
| REQ-4.14-02 | Search/filter cached records offline | **N/A** | Not applicable to the backend (frontend) | Not itemized | Not in report | Kyer Jayme |
| REQ-4.14-03 | Create Uncataloged text-only drafts offline | **Done** | 2 pass / 0 fail | Done | Aligned | Kyer Jayme |
| REQ-4.14-04 | Mark offline drafts Pending Sync until accepted by the server | **Done** | 1 pass / 0 fail | Done | Aligned | Kyer Jayme |
| REQ-4.14-05 | Keep a draft until synced or discarded | **N/A** | Not applicable to the backend (frontend) | Not itemized | Not in report | Kyer Jayme |
| REQ-4.14-06 | Submit pending drafts when connectivity returns and the curator is authenticated | **Done** | 1 pass / 0 fail | Done | Aligned | Kyer Jayme |
| REQ-4.14-07 | Keep the draft and show a failure state when sync fails or is rejected | **Done** | 2 pass / 0 fail | Done | Aligned | Kyer Jayme |
| REQ-4.14-08 | Retries never create duplicate server records | **Done** | 2 pass / 0 fail | Done | Aligned | Kyer Jayme |
| REQ-4.14-09 | Display Online/Offline/Pending/Synchronizing/Synchronized/Failed | **N/A** | Not applicable to the backend (frontend) | Not itemized | Not in report | Kyer Jayme |
| REQ-4.14-10 | Existing records read-only while offline | **N/A** | Not applicable to the backend (frontend) | Not itemized | Not in report | Kyer Jayme |
| REQ-4.14-11 | Connectivity required for edits, cataloging, locations, images, imports, etc. | **Done** | 1 pass / 0 fail | Done | Aligned | Kyer Jayme |
| REQ-4.14-12 | Browser data is not a backup or confirmed record until synced | **N/A** | Not applicable to the backend (frontend) | Not itemized | Not in report | Kyer Jayme |

### §4.15 Audit Logging, Backup, and Recovery — 33.3%

Owner: **Kyer Jayme** (Acceptance plan §3: Audit Log and Backup/Restore Management). Last report: 44% → verified 33.3%; **Aligned**. Done 4, Partial 2, Not Started 6 of 12 backend-applicable; API cases 14 passed / 6 failed.

| SRS ID | Requirement | Status | Test result | Last report | Alignment | Owner |
| --- | --- | --- | --- | --- | --- | --- |
| REQ-4.15-01 | Audit major actions incl. auth, specimens, lots, inquiries, visits, FAQ, QR, AR, reports, backups, restores | **Partial** | 5 pass / 0 fail; gap: Backup results and restoration activities are never audited because neither exists. | Partial | Aligned | Kyer Jayme |
| REQ-4.15-02 | Audit entry has actor, action, record/module, time and result | **Done** | 2 pass / 0 fail | Done | Aligned | Kyer Jayme |
| REQ-4.15-03 | No editing/deleting audit entries through the application | **Done** | 1 pass / 0 fail | Done | Aligned | Kyer Jayme |
| REQ-4.15-04 | Authorized search/filter of audit data, never public | **Done** | 2 pass / 0 fail | Done | Aligned | Kyer Jayme |
| REQ-4.15-05 | Scheduled backup of DB, audit data, objects, AR assets and configuration | **Not Started** | 0 pass / 1 fail; gap: No backup job exists in the backend or repository deployment configuration.; failing: BAK-RUN-RESTORE: expected 200 + checks, got None | Not Started | Aligned | Kyer Jayme |
| REQ-4.15-06 | Record every backup result and alert the operator on failure | **Partial** | 3 pass / 1 fail; gap: History is read-only; nothing records new backups or alerts on failure.; failing: BAK-RUN-RESTORE: expected 200 + checks, got None | Partial | Aligned | Kyer Jayme |
| REQ-4.15-07 | Protect backups with access controls and encryption | **Not Started** | 0 pass / 1 fail; gap: No backup copies are produced by the system.; failing: BAK-RUN-RESTORE: expected 200 + checks, got None | Not Started | Aligned | Kyer Jayme |
| REQ-4.15-08 | Restore from a verified backup by the approved procedure | **Not Started** | 0 pass / 1 fail; gap: No restore mechanism or procedure in the repository.; failing: BAK-RUN-RESTORE: expected 200 + checks, got None | Not Started | Aligned | Kyer Jayme |
| REQ-4.15-09 | Log restoration; never report success when verification fails | **Not Started** | 0 pass / 1 fail; gap: No restore operation to log.; failing: BAK-RUN-RESTORE: expected 200 + checks, got None | Not Started | Aligned | Kyer Jayme |
| REQ-4.15-10 | No general-purpose admin dashboard needed for backup/recovery | **Done** | 1 pass / 0 fail | Done | Aligned | Kyer Jayme |
| REQ-4.15-11 | One documented successful full backup-and-restore test before turnover | **Not Started** | 0 pass / 1 fail; gap: No backup-and-restore test has been run or documented (BAK-002 deferred).; failing: BAK-RUN-RESTORE: expected 200 + checks, got None | Not Started | Aligned | Kyer Jayme |
| REQ-4.15-12 | Backup schedule, retention, RPO, off-site target and operator approved and documented | **Not Started** | 0 pass / 0 fail; gap: No approved backup policy document in the repository. | Not Started | Aligned | Kyer Jayme |

## Endpoint → SRS map (all 140 routes)

| Method | Route | Access | Controller | SRS requirements (from tagged happy/invalid-input cases) | Cases run |
| --- | --- | --- | --- | --- | --- |
| GET | `/` | Public | `app.controller.ts` | No SRS requirement: service status route | 2 |
| GET | `/audit-logs` | CURATOR | `audit/audit.controller.ts` | REQ-4.15-01, REQ-4.15-02, REQ-4.15-04 | 7 |
| GET | `/audit-logs/:id` | CURATOR | `audit/audit.controller.ts` | REQ-4.15-02 | 6 |
| POST | `/auth/login` | Public | `auth/auth.controller.ts` | REQ-4.1-01, REQ-4.1-04, REQ-4.1-12, REQ-4.1-15 | 4 |
| POST | `/auth/onboarding/complete` | Public | `auth/auth.controller.ts` | REQ-4.1-07, REQ-4.1-11, REQ-4.1-19 | 2 |
| GET | `/auth/me` | Any signed-in | `auth/auth.controller.ts` | REQ-4.1-04, REQ-4.1-12, REQ-4.1-13 | 6 |
| GET | `/backups/history` | CURATOR | `backup/backup.controller.ts` | REQ-4.15-06, REQ-4.15-10 | 6 |
| GET | `/backups/history/:id` | CURATOR | `backup/backup.controller.ts` | REQ-4.15-06 | 7 |
| GET | `/dashboard/summary` | CURATOR | `dashboard/dashboard.controller.ts` | REQ-4.2-02, REQ-4.3-01, REQ-4.3-02, REQ-4.3-03, REQ-4.3-04 | 8 |
| GET | `/developer/curators` | DEVELOPER | `developer/developer.controller.ts` | REQ-4.2-02, REQ-4.2-03 | 5 |
| POST | `/developer/curators/onboard` | DEVELOPER | `developer/developer.controller.ts` | REQ-4.2-02, REQ-4.2-09 | 6 |
| PATCH | `/developer/curators/:id/status` | DEVELOPER | `developer/developer.controller.ts` | REQ-4.1-11, REQ-4.2-03, REQ-4.2-09 | 7 |
| GET | `/developer/ar-exhibits` | DEVELOPER | `developer/developer.controller.ts` | REQ-4.2-04, REQ-4.2-08 | 5 |
| POST | `/developer/ar-assets` | DEVELOPER | `developer/developer.controller.ts` | REQ-4.13-03, REQ-4.2-04, REQ-4.2-05, REQ-4.2-09 | 7 |
| PATCH | `/developer/ar-assets/:id` | DEVELOPER | `developer/developer.controller.ts` | REQ-4.13-03, REQ-4.2-04 | 5 |
| PATCH | `/developer/ar-assets/:id/activate` | DEVELOPER | `developer/developer.controller.ts` | REQ-4.13-03, REQ-4.2-04 | 5 |
| PATCH | `/developer/ar-assets/:id/deactivate` | DEVELOPER | `developer/developer.controller.ts` | REQ-4.2-04 | 5 |
| DELETE | `/developer/ar-assets/:id` | DEVELOPER | `developer/developer.controller.ts` | REQ-4.2-04 | 5 |
| POST | `/exhibits` | CURATOR | `exhibit/exhibits.controller.ts` | REQ-4.12-01, REQ-4.12-02, REQ-4.12-03, REQ-4.12-04 | 8 |
| GET | `/exhibits` | CURATOR | `exhibit/exhibits.controller.ts` | REQ-4.7-10 | 6 |
| GET | `/exhibits/public/:slug` | Public | `exhibit/exhibits.controller.ts` | REQ-4.10-08, REQ-4.12-04, REQ-4.12-08, REQ-4.12-09, REQ-4.12-12, REQ-4.13-03, REQ-4.13-04, REQ-4.13-06, REQ-4.13-07, REQ-4.4-16, REQ-4.6-10 | 5 |
| GET | `/exhibits/:id` | CURATOR | `exhibit/exhibits.controller.ts` | REQ-4.12-03 | 6 |
| PATCH | `/exhibits/:id` | CURATOR | `exhibit/exhibits.controller.ts` | REQ-4.12-03 | 6 |
| PATCH | `/exhibits/:id/replace-url` | CURATOR | `exhibit/exhibits.controller.ts` | REQ-4.12-10 | 6 |
| PATCH | `/exhibits/:id/publish` | CURATOR | `exhibit/exhibits.controller.ts` | REQ-4.12-01, REQ-4.12-10 | 5 |
| PATCH | `/exhibits/:id/unpublish` | CURATOR | `exhibit/exhibits.controller.ts` | REQ-4.12-01, REQ-4.12-09, REQ-4.12-11 | 5 |
| PATCH | `/exhibits/:id/disable` | CURATOR | `exhibit/exhibits.controller.ts` | REQ-4.12-01, REQ-4.12-09, REQ-4.12-11 | 6 |
| PATCH | `/exhibits/:id/archive` | CURATOR | `exhibit/exhibits.controller.ts` | REQ-4.12-01, REQ-4.12-09 | 5 |
| PATCH | `/exhibits/:id/ar-selection` | CURATOR | `exhibit/exhibits.controller.ts` | REQ-4.13-01, REQ-4.13-02, REQ-4.13-08 | 5 |
| PATCH | `/exhibits/:id/ar` | CURATOR | `exhibit/exhibits.controller.ts` | REQ-4.13-03, REQ-4.13-04 | 6 |
| GET | `/exhibits/:id/qr` | CURATOR | `exhibit/exhibits.controller.ts` | REQ-4.12-05 | 7 |
| GET | `/exhibits/:id/label` | CURATOR | `exhibit/exhibits.controller.ts` | REQ-4.12-06 | 5 |
| POST | `/exhibits/:id/media` | CURATOR | `exhibit/exhibits.controller.ts` | REQ-4.12-03 | 5 |
| PATCH | `/exhibits/:id/media/:mediaId` | CURATOR | `exhibit/exhibits.controller.ts` | REQ-4.12-03 | 5 |
| DELETE | `/exhibits/:id/media/:mediaId` | CURATOR | `exhibit/exhibits.controller.ts` | REQ-4.12-03 | 5 |
| GET | `/faq/assistant/suggestions` | Public | `faq/faq-assistant.controller.ts` | REQ-4.11-01 | 2 |
| POST | `/faq/assistant/ask` | Public | `faq/faq-assistant.controller.ts` | REQ-4.10-08, REQ-4.11-01, REQ-4.11-03, REQ-4.11-04, REQ-4.11-05, REQ-4.11-06, REQ-4.11-07, REQ-4.11-10 | 7 |
| GET | `/faq/assistant/review-policy` | Public | `faq/faq-review.controller.ts` | REQ-4.11-07 | 2 |
| POST | `/faq/assistant/review-submissions` | Public | `faq/faq-review.controller.ts` | REQ-4.11-07 | 2 |
| GET | `/faq/review-queue` | CURATOR | `faq/faq-review.controller.ts` | REQ-4.11-02 | 5 |
| PATCH | `/faq/review-queue/:id` | CURATOR | `faq/faq-review.controller.ts` | No SRS requirement: opt-in FAQ review queue (off by default) | 4 |
| DELETE | `/faq/review-queue/:id` | CURATOR | `faq/faq-review.controller.ts` | No SRS requirement: opt-in FAQ review queue (off by default) | 4 |
| POST | `/faq/entries` | CURATOR | `faq/faq.controller.ts` | REQ-4.11-02, REQ-4.11-03, REQ-4.11-09 | 6 |
| GET | `/faq/entries` | CURATOR | `faq/faq.controller.ts` | REQ-4.11-02 | 5 |
| GET | `/faq/entries/:id` | CURATOR | `faq/faq.controller.ts` | REQ-4.11-02 | 5 |
| PATCH | `/faq/entries/:id` | CURATOR | `faq/faq.controller.ts` | REQ-4.11-02 | 5 |
| PATCH | `/faq/entries/:id/activate` | CURATOR | `faq/faq.controller.ts` | REQ-4.11-02 | 5 |
| PATCH | `/faq/entries/:id/deactivate` | CURATOR | `faq/faq.controller.ts` | REQ-4.11-02 | 5 |
| PATCH | `/faq/entries/:id/archive` | CURATOR | `faq/faq.controller.ts` | REQ-4.11-02 | 5 |
| POST | `/inquiries` | Public | `inquiries/inquiries.controller.ts` | REQ-4.8-01, REQ-4.8-02, REQ-4.8-03, REQ-4.8-04 | 5 |
| GET | `/inquiries` | CURATOR | `inquiries/inquiries.controller.ts` | REQ-4.8-05 | 6 |
| GET | `/inquiries/:id` | CURATOR | `inquiries/inquiries.controller.ts` | REQ-4.8-05 | 5 |
| PATCH | `/inquiries/:id` | CURATOR | `inquiries/inquiries.controller.ts` | REQ-4.8-06, REQ-4.8-11 | 6 |
| POST | `/inquiries/:id/referral` | CURATOR | `inquiries/inquiries.controller.ts` | REQ-4.8-06, REQ-4.8-07 | 6 |
| GET | `/inquiries/:id/history` | CURATOR | `inquiries/inquiries.controller.ts` | REQ-4.8-11 | 5 |
| POST | `/inquiries/:id/notes` | CURATOR | `inquiries/inquiries.controller.ts` | REQ-4.8-11 | 5 |
| POST | `/inquiries/:id/replies` | CURATOR | `inquiries/inquiries.controller.ts` | REQ-4.8-05, REQ-4.8-09, REQ-4.8-11 | 6 |
| GET | `/notifications` | CURATOR | `notifications/notifications.controller.ts` | REQ-4.3-05, REQ-4.3-06, REQ-4.3-08, REQ-4.3-10, REQ-4.8-08, REQ-4.9-07 | 8 |
| PATCH | `/notifications/state` | CURATOR | `notifications/notifications.controller.ts` | REQ-4.3-07 | 6 |
| POST | `/offline-sync/specimen-drafts` | CURATOR | `offline-sync/offline-sync.controller.ts` | REQ-4.14-03, REQ-4.14-04, REQ-4.14-06, REQ-4.14-07, REQ-4.14-08, REQ-4.14-11 | 9 |
| GET | `/reports` | CURATOR | `reports/reports.controller.ts` | REQ-4.7-04 | 5 |
| GET | `/reports/history` | CURATOR | `reports/reports.controller.ts` | REQ-4.7-14 | 5 |
| GET | `/reports/summary` | CURATOR | `reports/reports.controller.ts` | REQ-4.7-04 | 5 |
| POST | `/reports` | CURATOR | `reports/reports.controller.ts` | REQ-4.7-05, REQ-4.7-06, REQ-4.7-07, REQ-4.7-08, REQ-4.7-09, REQ-4.7-10, REQ-4.7-11, REQ-4.7-12, REQ-4.7-13, REQ-4.7-15, REQ-4.7-16 | 12 |
| POST | `/specimens/:specimenId/lots` | CURATOR | `specimen-lots/specimen-lots.controller.ts` | REQ-4.5-01, REQ-4.5-02, REQ-4.6-05 | 7 |
| GET | `/specimens/:specimenId/lots` | CURATOR | `specimen-lots/specimen-lots.controller.ts` | REQ-4.5-01 | 5 |
| GET | `/specimens/:specimenId/lots/history` | CURATOR | `specimen-lots/specimen-lots.controller.ts` | REQ-4.5-11 | 5 |
| GET | `/specimens/:specimenId/lots/summary` | CURATOR | `specimen-lots/specimen-lots.controller.ts` | REQ-4.5-03 | 5 |
| GET | `/specimens/:specimenId/lots/:lotId/transactions` | CURATOR | `specimen-lots/specimen-lots.controller.ts` | REQ-4.5-11 | 5 |
| GET | `/specimens/:specimenId/lots/:lotId` | CURATOR | `specimen-lots/specimen-lots.controller.ts` | REQ-4.5-02 | 5 |
| POST | `/specimens/:specimenId/lots/:lotId/movements` | CURATOR | `specimen-lots/specimen-lots.controller.ts` | REQ-4.5-04, REQ-4.5-06, REQ-4.5-07, REQ-4.5-08, REQ-4.5-11, REQ-4.6-06, REQ-4.6-09 | 7 |
| POST | `/specimens/:specimenId/lots/:lotId/condition-changes` | CURATOR | `specimen-lots/specimen-lots.controller.ts` | REQ-4.5-05, REQ-4.5-06, REQ-4.5-10 | 5 |
| POST | `/specimens/:specimenId/lots/:lotId/quantity-adjustments` | CURATOR | `specimen-lots/specimen-lots.controller.ts` | REQ-4.5-09, REQ-4.5-10 | 7 |
| PATCH | `/specimens/:specimenId/lots/:lotId/notes` | CURATOR | `specimen-lots/specimen-lots.controller.ts` | REQ-4.5-02 | 5 |
| POST | `/collections` | CURATOR | `specimens/collections.controller.ts` | REQ-4.3-01, REQ-4.4-01 | 7 |
| GET | `/collections` | CURATOR | `specimens/collections.controller.ts` | REQ-4.4-01 | 5 |
| GET | `/collections/:id` | CURATOR | `specimens/collections.controller.ts` | REQ-4.4-01 | 5 |
| PATCH | `/collections/:id` | CURATOR | `specimens/collections.controller.ts` | REQ-4.4-01 | 5 |
| GET | `/specimens/:id/details` | CURATOR | `specimens/specimen-details.controller.ts` | REQ-4.4-09 | 5 |
| POST | `/specimens/duplicate-check` | CURATOR | `specimens/specimen-duplicates.controller.ts` | REQ-4.4-21 | 5 |
| GET | `/specimens/:id/possible-duplicates` | CURATOR | `specimens/specimen-duplicates.controller.ts` | REQ-4.4-21, REQ-4.4-22 | 5 |
| POST | `/specimens/import/preview` | CURATOR | `specimens/specimen-import.controller.ts` | REQ-4.4-19, REQ-4.4-20 | 6 |
| POST | `/specimens/import/commit` | CURATOR | `specimens/specimen-import.controller.ts` | REQ-4.4-19, REQ-4.4-20, REQ-4.4-22 | 6 |
| POST | `/specimens/:specimenId/media` | CURATOR | `specimens/specimen-media.controller.ts` | REQ-4.4-12 | 6 |
| GET | `/specimens/:specimenId/media` | CURATOR | `specimens/specimen-media.controller.ts` | REQ-4.4-12 | 5 |
| GET | `/specimens/:specimenId/media/:mediaId/signed-url` | CURATOR | `specimens/specimen-media.controller.ts` | REQ-4.4-12 | 5 |
| GET | `/specimens/:specimenId/media/:mediaId` | CURATOR | `specimens/specimen-media.controller.ts` | REQ-4.4-12 | 5 |
| PUT | `/specimens/:specimenId/media/:mediaId/file` | CURATOR | `specimens/specimen-media.controller.ts` | REQ-4.4-12 | 5 |
| PATCH | `/specimens/:specimenId/media/:mediaId` | CURATOR | `specimens/specimen-media.controller.ts` | REQ-4.4-12 | 5 |
| PATCH | `/specimens/:specimenId/media/:mediaId/cover` | CURATOR | `specimens/specimen-media.controller.ts` | REQ-4.4-12 | 5 |
| DELETE | `/specimens/:specimenId/media/:mediaId` | CURATOR | `specimens/specimen-media.controller.ts` | — | 4 |
| POST | `/specimens/:specimenId/provenance` | CURATOR | `specimens/specimen-provenance.controller.ts` | REQ-4.4-01, REQ-4.4-08 | 6 |
| GET | `/specimens/:specimenId/provenance` | CURATOR | `specimens/specimen-provenance.controller.ts` | REQ-4.4-09 | 5 |
| PATCH | `/specimens/:specimenId/provenance` | CURATOR | `specimens/specimen-provenance.controller.ts` | REQ-4.4-09 | 5 |
| GET | `/specimens/:specimenId/tags` | CURATOR | `specimens/specimen-tags.controller.ts` | REQ-4.7-02 | 5 |
| POST | `/specimens/:specimenId/tags` | CURATOR | `specimens/specimen-tags.controller.ts` | REQ-4.7-02 | 6 |
| PATCH | `/specimens/:specimenId/tags/:tagId` | CURATOR | `specimens/specimen-tags.controller.ts` | REQ-4.7-02 | 5 |
| DELETE | `/specimens/:specimenId/tags/:tagId` | CURATOR | `specimens/specimen-tags.controller.ts` | REQ-4.7-02 | 5 |
| POST | `/specimens/:specimenId/taxonomy` | CURATOR | `specimens/specimen-taxonomy.controller.ts` | REQ-4.4-01, REQ-4.4-14 | 5 |
| GET | `/specimens/:specimenId/taxonomy` | CURATOR | `specimens/specimen-taxonomy.controller.ts` | REQ-4.4-09 | 5 |
| PATCH | `/specimens/:specimenId/taxonomy` | CURATOR | `specimens/specimen-taxonomy.controller.ts` | REQ-4.4-08, REQ-4.4-09 | 6 |
| POST | `/specimens` | CURATOR | `specimens/specimens.controller.ts` | REQ-4.4-01, REQ-4.4-02, REQ-4.4-03, REQ-4.4-04, REQ-4.4-05, REQ-4.4-06, REQ-4.4-14, REQ-4.4-17, REQ-4.4-18, REQ-4.4-23 | 9 |
| GET | `/specimens` | CURATOR | `specimens/specimens.controller.ts` | REQ-4.4-09 | 5 |
| GET | `/specimens/search` | CURATOR | `specimens/specimens.controller.ts` | REQ-4.7-01, REQ-4.7-02, REQ-4.7-03 | 7 |
| GET | `/specimens/accession-number-availability` | CURATOR | `specimens/specimens.controller.ts` | REQ-4.4-04 | 6 |
| GET | `/specimens/:id/revisions` | CURATOR | `specimens/specimens.controller.ts` | REQ-4.15-01, REQ-4.4-17 | 5 |
| GET | `/specimens/:id/catalog-readiness` | CURATOR | `specimens/specimens.controller.ts` | REQ-4.4-08 | 5 |
| GET | `/specimens/:id` | CURATOR | `specimens/specimens.controller.ts` | REQ-4.4-09 | 6 |
| PATCH | `/specimens/:id` | CURATOR | `specimens/specimens.controller.ts` | REQ-4.4-07, REQ-4.4-09, REQ-4.4-17 | 6 |
| PATCH | `/specimens/:id/complete-cataloging` | CURATOR | `specimens/specimens.controller.ts` | REQ-4.4-07, REQ-4.4-08, REQ-4.4-13, REQ-4.4-16 | 6 |
| PATCH | `/specimens/:id/reopen-cataloging` | CURATOR | `specimens/specimens.controller.ts` | REQ-4.4-09 | 6 |
| PATCH | `/specimens/:id/archive` | CURATOR | `specimens/specimens.controller.ts` | REQ-4.4-10, REQ-4.4-17 | 6 |
| PATCH | `/specimens/:id/restore` | CURATOR | `specimens/specimens.controller.ts` | REQ-4.4-10 | 5 |
| PATCH | `/specimens/:id/public-display` | CURATOR | `specimens/specimens.controller.ts` | REQ-4.12-02, REQ-4.4-11, REQ-4.4-15 | 7 |
| GET | `/tags` | CURATOR | `specimens/tags.controller.ts` | REQ-4.7-02 | 5 |
| GET | `/storage-locations/:id/inventory` | CURATOR | `storage-locations/storage-inventory.controller.ts` | REQ-4.6-02 | 5 |
| GET | `/storage-locations/:id/lot-movements` | CURATOR | `storage-locations/storage-inventory.controller.ts` | REQ-4.6-09 | 5 |
| POST | `/storage-locations` | CURATOR | `storage-locations/storage-locations.controller.ts` | REQ-4.6-01, REQ-4.6-02, REQ-4.6-03, REQ-4.6-04 | 7 |
| GET | `/storage-locations` | CURATOR | `storage-locations/storage-locations.controller.ts` | REQ-4.6-02 | 5 |
| GET | `/storage-locations/occupancy-summary` | CURATOR | `storage-locations/storage-locations.controller.ts` | REQ-4.6-11 | 5 |
| GET | `/storage-locations/search` | CURATOR | `storage-locations/storage-locations.controller.ts` | REQ-4.6-02 | 5 |
| GET | `/storage-locations/:id/capacity-check` | CURATOR | `storage-locations/storage-locations.controller.ts` | REQ-4.6-11 | 6 |
| GET | `/storage-locations/:id/path` | CURATOR | `storage-locations/storage-locations.controller.ts` | REQ-4.6-08 | 5 |
| GET | `/storage-locations/:id` | CURATOR | `storage-locations/storage-locations.controller.ts` | REQ-4.6-04 | 7 |
| GET | `/storage-locations/:id/children` | CURATOR | `storage-locations/storage-locations.controller.ts` | REQ-4.6-03 | 5 |
| GET | `/storage-locations/:id/movements` | CURATOR | `storage-locations/storage-locations.controller.ts` | REQ-4.6-09 | 5 |
| PATCH | `/storage-locations/:id` | CURATOR | `storage-locations/storage-locations.controller.ts` | REQ-4.6-02 | 5 |
| PATCH | `/storage-locations/:id/move` | CURATOR | `storage-locations/storage-locations.controller.ts` | REQ-4.6-07, REQ-4.6-12 | 7 |
| PATCH | `/storage-locations/:id/archive` | CURATOR | `storage-locations/storage-locations.controller.ts` | REQ-4.6-02 | 6 |
| GET | `/user-accounts` | CURATOR | `user-accounts/user-accounts.controller.ts` | REQ-4.1-08 | 5 |
| POST | `/user-accounts/invitations` | CURATOR | `user-accounts/user-accounts.controller.ts` | REQ-4.1-02, REQ-4.1-07, REQ-4.1-11, REQ-4.1-17 | 7 |
| POST | `/visit-requests` | Public | `visit-requests/visit-requests.controller.ts` | REQ-4.9-01, REQ-4.9-02, REQ-4.9-03, REQ-4.9-04, REQ-4.9-05, REQ-4.9-06 | 7 |
| GET | `/visit-requests` | CURATOR | `visit-requests/visit-requests.controller.ts` | REQ-4.9-08 | 5 |
| GET | `/visit-requests/:id` | CURATOR | `visit-requests/visit-requests.controller.ts` | REQ-4.9-08 | 5 |
| PATCH | `/visit-requests/:id` | CURATOR | `visit-requests/visit-requests.controller.ts` | REQ-4.9-09, REQ-4.9-11, REQ-4.9-14 | 7 |
| PATCH | `/visit-requests/:id/approve-schedule` | CURATOR | `visit-requests/visit-requests.controller.ts` | REQ-4.9-09, REQ-4.9.16 | 6 |
| GET | `/visit-requests/:id/campus-entry-summary` | CURATOR | `visit-requests/visit-requests.controller.ts` | REQ-4.9-12, REQ-4.9-13 | 5 |
| GET | `/visit-requests/:id/history` | CURATOR | `visit-requests/visit-requests.controller.ts` | REQ-4.9-14 | 5 |
| POST | `/visit-requests/:id/notes` | CURATOR | `visit-requests/visit-requests.controller.ts` | REQ-4.9-14 | 5 |
| POST | `/visit-requests/:id/messages` | CURATOR | `visit-requests/visit-requests.controller.ts` | REQ-4.9-10, REQ-4.9-11, REQ-4.9-14 | 5 |

## Failed live API cases

- `ACCT-CURATOR-ACTIVATE` (PATCH /user-accounts/:id/status, REQ-4.1-08, REQ-4.1-09): expected 200 + checks, got None. No curator-side route to activate/deactivate or hand over an account exists (only /developer/curators/:id/status).
- `ACCT-CHANGE-PASSWORD` (POST (none), REQ-4.1-16, REQ-4.1-18): expected 200 + checks, got None. No backend change-password or confirmation-email route; password changes would happen directly in Supabase with no BioSphere audit (REQ-4.1-11).
- `DEV-ONBOARD-PENDING-FLAG` (DB auth.users.raw_app_meta_data, REQ-4.2-02): expected 200 + checks, got 200. Developer-onboarded curator app_metadata={"role":"CURATOR"}; curator invitations set onboarding_pending=true, Developer onboarding does not
- `DEV-ONBOARD-SESSION-GATED` (GET /dashboard/summary, REQ-4.2-02): expected 403, got 200. invite-link session before password setup got 200
- `DEV-CURATORS-LIST` (GET /developer/curators, REQ-4.2-02, REQ-4.2-03): expected 200 + checks, got 200. invitee as Developer sees it: {"id":"768ce4b7-1562-4e22-8b81-f7813f71426d","authUserId":"bd716030-12ad-4764-bf5e-2b5a210cb5dd","role":"CURATOR","status":"ACTIVE","avatarPath":null,"createdAt":"2026-11-04T16:29:56.416Z","updatedAt":"2026-11-04T16:29:5
- `NOTIF-SYNC-FAILED` (GET /notifications, REQ-4.3-05, REQ-4.3-10): expected 200 + checks, got None. CuratorNotificationType has only NEW_INQUIRY, NEW_VISIT_REQUEST, SUBMISSION_EMAIL_FAILED; no sync-failure, backup, report, QR/AR or other operational notification exists.
- `BAK-RUN-RESTORE` (POST (none), REQ-4.15-05, REQ-4.15-06, REQ-4.15-07, REQ-4.15-08, REQ-4.15-09, REQ-4.15-11): expected 200 + checks, got None. No backup, restore, failure-alert or verification mechanism exists in the backend; backup_history is read-only.
