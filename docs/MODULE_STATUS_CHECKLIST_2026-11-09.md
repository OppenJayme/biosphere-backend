# BioSphere module status checklist

Updated 2026-11-09. Built from the 9 Nov progress dashboards:

- Backend: `biosphere-backend` develop @ `7ad03f4`
- Frontend: `biosphere-frontend` develop @ `60bcfcc`

Voltaire's sign-off is applied on top of the dashboards for REQ-4.1-08, 4.1-09 and 4.1-16. See [Sign-off overrides](#sign-off-overrides).

Legend:

- `[x]` Done
- `[~]` Built, but waiting on a decision, a deployment setting or a test
- `[ ]` Not done

## Overall

| Side | Dashboard progress | Requirements Done | Open rows (dashboard) | Open after sign-off |
| --- | --- | --- | --- | --- |
| Backend | 94.5% (+5.5 vs 4 Nov) | 158 of 167 | 9 | 7, all §4.15 (Kyer) |
| Frontend | 97.3% (+5.1 vs 5 Nov) | 165 of 170 | 5 | 2: REQ-4.1-19 and REQ-4.3-07 |

The percentages are the dashboards' own numbers. They do not include the sign-offs.

## Modules

| Module | Owner(s) | Backend | Frontend |
| --- | --- | --- | --- |
| §4.1 Authentication and Curator Account Management | Voltaire | [x] Done after sign-off (dashboard 87%) | [~] 4.1-19 only (dashboard 71%) |
| §4.2 Restricted Developer Functions | Voltaire | [x] 100% | [x] 100% |
| §4.3 Curator Dashboard and Notifications | Charles, John | [x] 100% | [~] 94%, 4.3-07 only |
| §4.4 Specimen Inventory and Cataloging | Kyer, John | [x] 100% | [x] 100% |
| §4.5 Specimen Lot Grouping and Quantity Management | John | [x] 100% | [x] 100% |
| §4.6 Hierarchical Storage-Location Management | Kyer | [x] 100% | [x] 100% |
| §4.7 Search, Filtering, Reports, and Export | John, Kyer | [x] 100% | [x] 100% |
| §4.8 General Inquiry Management | Charles, John | [x] 100% | [x] 100% |
| §4.9 Visit-Request Management | Charles | [x] 100% | [x] 100% |
| §4.10 Static Public Museum Website | Charles, John, Voltaire | [x] 100% | [x] 100% |
| §4.11 Controlled Knowledge-Based FAQ Assistant | Kyer | [x] 100% | [x] 100% |
| §4.12 QR Exhibit Management and Public QR Pages | Voltaire | [x] 100% | [x] 100% |
| §4.13 Selected WebAR Experiences | Voltaire | [x] 100% | [x] 100% |
| §4.14 Selected Offline Inventory Operations and Synchronization | Kyer | [x] 100% | [x] 100% |
| §4.15 Audit Logging, Backup, and Recovery | Kyer | [~] 42%, see §4.15 below | [x] 100% |

## Sign-off overrides

These are Voltaire's decisions as module owner. They differ from the dashboards.

| SRS ID | Side | Dashboard | Checklist | Reason |
| --- | --- | --- | --- | --- |
| REQ-4.1-08 | Backend and frontend | Not Started | **Done** | Done under the approved procedure. Sir Fidel ruled on 7 Nov that curators must not change each other's status. The curator route and controls were removed (#261, #120), and status changes go through the Developer (REQ-4.2-03, Done). The SRS wording still needs revising (see To do). |
| REQ-4.1-09 | Backend and frontend | Partial | **Done** | The handover feature is complete: `POST /developer/curators/handover` (#261, audited) and the Developer handover form (#120). |
| REQ-4.1-16 | Frontend | Partial | **Done** | Tested by hand: the requester receives the OTP in their email inbox and the change-password flow works. |

## Still open

### §4.1 (Voltaire)

- [~] **REQ-4.1-19: Invite and reset links expire after the approved period** (frontend: Partial)
  - **Implemented.** Supabase Auth enforces the expiry, and the accept-invite, verify and forgot-password pages show an "expired" message.
  - **Verified on 8 Nov 2026** by `npm run test:auth:link-expiry`, run on a local Auth stack at the hosted version, v2.197.0. All six checks passed:
    - A fresh invite link and a fresh reset code each work once.
    - Reusing either one is rejected.
    - Either one used after the lifetime is rejected with `otp_expired`.
  - The dashboard still says "expiry of a valid link is not verified". That text is out of date, because the 8 Nov lab test verified it. See `biosphere-backend/docs/AUTH_ACCOUNT_DECISIONS_STATUS.md`.
  - **Blocker:** no approved period yet. The hosted value is 3600 s (1 hour).

### §4.3 (Charles, John)

- [~] **REQ-4.3-07: Mark notifications as read or dismissed** (frontend: Partial; backend: Done)
  - The feature is built.
  - **Blocker:** `NOTIFICATION_STATE_ENABLED` defaults to false. The notification-state migration has to be deployed to the shared environment before the feature can be turned on.

### §4.15 (Kyer, backend)

- [~] **REQ-4.15-05: Scheduled backup.** The capture worker is built, but there is no scheduled job (Gate D not enabled).
- [~] **REQ-4.15-06: Record each backup result and alert on failure.** The code is built. The live case BAK-RUN-RESTORE has not been executed.
- [~] **REQ-4.15-07: Backup access control and encryption.** Checkpoints are encrypted and Backblaze B2 is chosen. Institutional permission is pending.
- [~] **REQ-4.15-08: Restore by the approved procedure.** The tooling is built and the procedure is drafted. The procedure is not approved (Gate A).
- [~] **REQ-4.15-09: Log restores and never report a failed verification as success.** The code is built. BAK-RUN-RESTORE has not been executed.
- [~] **REQ-4.15-11: Full backup-and-restore test before turnover.** The synthetic rehearsal passed (Gate B). The intended-source restore (Gate C) has not been run.
- [ ] **REQ-4.15-12: Approved backup schedule, retention, RPO and target.** USC/DCISM approval is pending (Gate A).

## To do (Voltaire)

- [ ] Revise the SRS wording for REQ-4.1-08 to match the 7 Nov ruling.
- [ ] Get an approved expiry period for invite and reset links, then set Email OTP expiration in Supabase (REQ-4.1-19).
- [ ] Optional: add executed harness cases so the dashboards also count the overrides as Done.
  - ACCT-CURATOR-ACTIVATE: handover.
  - The password change, recovery and reset routes: ACCT-CHANGE-PASSWORD.

## Shared blockers (not tied to one requirement)

- A permanent `PUBLIC_SITE_URL` / `FRONTEND_URL` before QR labels are printed. QR labels currently use a temporary trycloudflare.com host.
- The lot-condition migration `20261107000000_uniform_lot_conditions` is not yet applied to the shared database.
- Production email needs a USC-owned sender address (waiting on USC IT).
- Test records must be removed from the shared environment before the demo.
