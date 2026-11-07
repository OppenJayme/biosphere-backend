# Auth and curator account decisions: status

Last updated 2026-11-07. This page separates what the SRS requires, what is configured today, what
the team recommends, and what the curator has decided. A recommendation here is not an approved
policy and must not be cited as an SRS requirement.

On 2026-11-07 Sir Fidel answered the account questions (see [Curator decisions](#curator-decisions-2026-11-07)).
He said curators must not deactivate each other, so the curator status route and the Users page
controls were removed, and handover became a Developer action. REQ-4.1-08 as written in SRS v0.10
conflicts with his answer, so the team asked Voltaire to revise it; the proposed wording is in
[SRS revision for REQ-4.1-08](#srs-revision-for-req-41-08).

Full hosted Auth acceptance is not claimed. The public signup retest passed and the session settings
have been read, but the approvals and checks under [Pending team action](#pending-team-action)
remain.

## Summary

| Item | Requirement | Status | Waiting on |
| --- | --- | --- | --- |
| Curator activate and deactivate | REQ-4.1-08 | Curator route and Users page controls removed on 2026-11-07; only the Developer route changes curator status | SRS revision by Voltaire (proposed wording below) |
| Curator handover | REQ-4.1-09, REQ-4.1-11 | Developer handover action built, with one audit entry per attempt | Museum acceptance test; the curator was not asked about orientation |
| Inactivity timeout | REQ-4.1-05 | Built and enforced by the frontend, including an offline lock; the curator confirmed 30 minutes on 2026-11-07, and the team decided not to raise the frontend-only limitation with him | Nothing |
| Public signup | REQ-4.1-03 | Turned off and retested on hosted; all four retest steps passed | Nothing |
| Invite and reset expiry | REQ-4.1-19 | Single use proven; hosted value is 3600 seconds, not an approved period | Approved period |
| Real email delivery | REQ-4.1-07, REQ-4.1-10 | Invite, recovery and password-change emails each reached a USC inbox through Brevo; production deliverability not accepted | USC IT decision on the sender |

## Confirmed requirements

From `docs/BioSphere-SRS.pdf`:

- Every curator has their own account, and credentials are never handed over or shared (REQ-4.1-09).
- An authorized curator may start a separate account for another authorized curator through the
  approved onboarding procedure (REQ-4.1-07).
- An authorized curator may activate or deactivate another curator account, only under the approved
  museum account-management and handover procedure (REQ-4.1-08).
- Handover gives the successor a separate authorized account, without transferring the outgoing
  curator's credentials (REQ-4.1-09).
- Activation, deactivation, handover, password change, recovery and reset are audited without
  recording secrets (REQ-4.1-11).
- A session ends on logout or after the approved inactivity timeout (REQ-4.1-05).
- Invitations and reset links expire after the approved period and cannot be reused (REQ-4.1-19).

The SRS does not define self-deactivation, deactivating the last active curator, or whether a reason
is mandatory. It gives no timeout, invitation expiry or reset expiry period.

## Current configuration and behaviour

Observed facts, not approved targets.

| Area | Observed on 2026-11-05 | Source |
| --- | --- | --- |
| Curator status changes | Removed on 2026-11-07. `PATCH /user-accounts/:id/status` no longer exists, and the Users page tells curators that a leaving curator's account is handed over by the system developer. | Backend and frontend code |
| Developer status route | `PATCH /developer/curators/:id/status` requires `authorizationReason`, but has no last-active-curator rule, because a Developer is not a curator. | Backend code |
| Developer handover | `POST /developer/curators/handover` takes the outgoing and successor curator IDs and an authorization reason. See [Handover as built](#handover-as-built). | Backend code and Developer page |
| Inactivity timeout | `NEXT_PUBLIC_SESSION_IDLE_MINUTES` is required, and a frontend build stops without it. Activity resets the timer. Timeout and logout end the session and require a new sign-in. It is enforced by the frontend, so direct API calls with a valid token are not affected. | Frontend code and browser test |
| Hosted Auth version | GoTrue v2.197.0 | Hosted health endpoint |
| Hosted signup | Was `disable_signup: false`. After the team's change it reads `disable_signup: true`, and a synthetic signup returned 422 `signup_disabled` with no user created. | Hosted public settings and signup endpoints |
| Brevo account | Account reachable and sender verified. Last 30 days: 72 requests, 47 delivered, 14 soft bounces, 2 hard bounces, 9 blocked. | Brevo API, read-only |

### Hosted dashboard settings

Read from the Supabase dashboard on 2026-11-05 by a team member, without changing anything. These
are current values, not approved targets. No secret is recorded here.

| Setting | Current value | Note |
| --- | --- | --- |
| Email OTP expiration | 3600 seconds (1 hour) | One setting for email links and codes, so invitations and password resets appear to share it. Confirm with a test once a controlled inbox exists. |
| Email OTP length | 8 digits | Matches the code entry on the reset screen. |
| Custom SMTP | On | Auth email goes through Brevo. |
| SMTP host and port | `smtp-relay.brevo.com`, 587 | |
| Sender name | Biosphere System | |
| Sender address | A team member's personal Gmail address | Development and temporary only. Full address left out of this document on purpose. The test invite displayed a `brevosend.com` address instead, so Brevo rewrites the From address. The production sender is pending USC IT approval. |
| Access token lifetime | 3600 seconds | |
| Refresh token reuse interval | 10 seconds | Label confirmed on the Sessions page. It is not a token lifetime. No change needed. |
| Time-box user sessions | 0 (never) | Field is present. Not enabled. |
| Inactivity timeout | 0 (never) | Field is present. Not enabled. |
| Allow new users to sign up | Off since 2026-11-05 (was On) | See the hosted retest below. |
| Confirm email | On | |

The project is on the Free plan. Whether Free locks the time-box and inactivity fields was not
confirmed, but neither is enabled.

### Hosted retest (2026-11-05)

| Check | Result |
| --- | --- |
| Setting off | Passed: `disable_signup: true` |
| Public signup rejected | Passed: HTTP 422 `signup_disabled`, no user created |
| Existing user can sign in | Passed, reported by a team member |
| Test invite through the existing workflow | Passed, reported by a team member. The email reached the Inbox of a USC Google mailbox, and the account moved from Pending Invite to Active with the Curator role. |
| Password recovery | Passed, reported by a team member. The email reached the same Inbox, and the password was changed on the reset screen. |
| Password-change confirmation email (REQ-4.1-18) | Passed, reported by a team member. The backend's email reached the same Inbox. |

The recovery test ran from a local frontend (`localhost:3000`) against hosted Supabase. The invite
test is assumed to have used the same setup, because the deployed site was not yet running this
branch. Repeat the invite and recovery checks on the deployed site after merging.

These are three delivered messages, not evidence of production deliverability. Invite and reset link
expiry was not tested.

## Team decisions (2026-11-05)

These are development team decisions. They are not museum approval and not SRS requirements.

1. **Public signup: disable it.** BioSphere is invite-only. The setting does not count as fixed
   until the hosted retest passes.
2. **Sender: Gmail stays for development only.** Production should use a USC-owned sender
   authenticated for Brevo. Sir Fidel or the museum should initiate or endorse the request to USC
   IT, and the development team prepares the technical requirements. USC IT chooses between a
   dedicated authenticated sending subdomain under `usc.edu.ph` and an approved USC mailbox or
   domain with the required SPF, DKIM and DMARC alignment. The final address is pending USC IT
   approval. `usc.edu.ph` publishes DMARC `p=reject`, so do not switch before USC DNS is ready.
3. **"Refresh Token: 10 seconds": verify only.** No setting change unless the dashboard shows it
   means something else.
4. **Inactivity: frontend enforcement accepted for the $0 baseline.** Use
   `NEXT_PUBLIC_SESSION_IDLE_MINUTES=30`, pending final requirement and client acceptance. No custom
   backend activity tracking will be added for the capstone. Shortening the JWT expiry may be
   assessed separately later, after compatibility testing.

## Session control wording for acceptance

| Control | Enforced by | Status |
| --- | --- | --- |
| 30-minute BioSphere web inactivity logout | Application frontend | Built. Calls Supabase sign-out, clears the session cookies and requires a new sign-in. Offline, the open workspace locks instead and signs out when connectivity returns. |
| Protected API authentication | Backend, validating the token with Supabase Auth on each request | Built |
| Inactive BioSphere accounts | Backend | Rejected on each request |
| Provider-level inactivity or time-box | Supabase | Not enabled on the current Free deployment; both fields read 0 (never) |
| Residual access token lifetime | JWT expiry, currently 3600 seconds | Accepted limitation unless the tier or configuration changes |

Password change and sign-out revoke the user's sessions and refresh tokens. Do not describe them as
immediately invalidating every access token: an already-issued JWT can remain valid until its expiry.

The offline lock hides the page and blocks input, but does not encrypt data on the device. After a
lock, the curator must reconnect and sign in again before continuing offline work.

The timeout is not server-side idle-session termination. Sign-out runs when an open tab or the next
page request detects the idle period. If neither happens, for example a closed browser, an issued
access token can stay usable until its JWT expiry. The refresh token in that browser's cookies has no
inactivity limit at the provider, although the proxy ends the session when that browser next opens
a protected page.

## Curator decisions (2026-11-07)

Sir Fidel's answers, as relayed to the team on 2026-11-07. No written artifact is recorded here.

| Question | Answer | What changed |
| --- | --- | --- |
| May one curator turn off another curator's account? | No. Once he retires he will not interfere, and everything is turned over to the next curator. | Curator status route and Users page controls removed. Handover moved to the Developer. |
| Is there an orientation for a new curator? | He is not sure there is one. | Nothing. Onboarding stays the invitation flow. |
| Log out after 30 minutes without use? | Confirmed, no change requested. | Nothing. `NEXT_PUBLIC_SESSION_IDLE_MINUTES=30` stays. |
| Invitation and reset link expiry | Not answered. | Still pending. Hosted value stays 3600 seconds. |

Not raised with him: that the timeout is enforced by the frontend, and that an issued access token
can stay valid for up to an hour after a browser is closed. See
[Session control wording](#session-control-wording-for-acceptance).

### Team decisions (2026-11-07)

Development team decisions, recorded in the team chat. They are not museum approval.

1. **Handover is a Developer action.** Curators do not change each other's status.
2. **The frontend-only timeout is not raised with the curator** (John Mark). REQ-4.1-05 is treated
   as met by the 30-minute frontend timeout he confirmed. The residual access-token lifetime stays
   an accepted limitation, described in
   [Session control wording](#session-control-wording-for-acceptance).
3. **REQ-4.1-08 is revised in the SRS by Voltaire** (John Mark).
4. **A Developer may change any curator's status without a curator's sign-off.** Every change
   requires a recorded reason and is in the Audit Log, where curators can review it and respond.
   The team accepted this during the 2026-11-07 handover test.

### SRS revision for REQ-4.1-08

The SRS is kept in the repos only as `docs/BioSphere-SRS.pdf` (v0.10), so the revision has to be
made in the source document and the PDF re-exported. Proposed text:

> **REQ-4.1-08** The system shall not allow a curator to activate or deactivate another curator
> account. Curator account activation and deactivation, including the deactivation of an outgoing
> curator during handover, shall be performed only by an authorized Developer with recorded formal
> authorization (REQ-4.2-03).

Optional, to match what was built for REQ-4.1-09:

> **REQ-4.1-09** The system shall support curator succession or handover by providing the
> successor with a separate authorized account without transferring or sharing the outgoing
> curator's credentials. The outgoing curator's account shall be deactivated and retained only
> after the successor has accepted their invitation and signed in.

Revision history entry: *2026-11-07, v0.11, REQ-4.1-08 revised to follow the curator's decision that
curators do not deactivate each other; Voltaire.* Until the PDF is replaced, this page is the record
of the change.

### Handover as built

`POST /developer/curators/handover` (Developer only):

1. Body: `outgoingCuratorId`, `successorCuratorId` and a required `authorizationReason` (trimmed,
   at most 500 characters). Any other field is rejected.
2. The two accounts must differ, and both must be curator accounts. A Developer account or unknown
   ID returns 404.
3. The outgoing account must be active, or the request returns 409.
4. The successor must be active, must have accepted their invitation, and must have signed in at
   least once, or the request returns 409 with the reason.
5. The outgoing account is set to `INACTIVE` and kept. Nothing is deleted, and no credentials
   move. An inactive account is refused on every request, so its sessions end.
6. The status change and its `HAND_OVER_CURATOR` audit entry commit together under SERIALIZABLE.
   The entry records the successor ID, the previous and new status, and the reason. Every refused
   or failed attempt is also audited, as `DENIED` or `FAILED`.

The Developer page has a Curator handover form. A browser check on a disposable local stack on
2026-11-07 confirmed a refused handover to a curator who had never signed in, a successful
handover, both audit entries, a 403 for the outgoing curator, and a 404 for the removed curator
route. Voltaire then repeated it against the hosted project from a local build on 2026-11-07: a
test curator was handed over, shown as Inactive with the handover in the Audit Log, and reactivated
through the Developer status route. The deployed site does not run this change yet.

## Recommended policy (historical)

Proposed on 2026-11-05. The curator's 2026-11-07 answers replaced the deactivation rules: curators
no longer deactivate each other at all. The handover steps below were built as a Developer action.

Proposed by the team for review by Sir Fidel and the museum.

**Deactivation**

- A recorded reason is required.
- A curator cannot deactivate their own account.
- The last active curator cannot be deactivated through the normal interface.

**Handover**

1. Invite the successor using a separate account.
2. The successor completes setup and signs in successfully.
3. Confirm the successor has the intended Curator access.
4. Record the handover or account-management action in the audit history.
5. Deactivate the outgoing curator only after the successor is active.

The outgoing account is deactivated and kept, not deleted, so historical attribution stays intact.

## Needs curator or client approval

| Decision | Who decides | Blocks |
| --- | --- | --- |
| Re-export the SRS with the REQ-4.1-08 revision above | Voltaire | Closing REQ-4.1-08 |
| Production sender model | USC IT, requested or endorsed by Sir Fidel or the museum | Accepting production email deliverability |
| Invitation and reset expiry periods, including whether 1 hour suits invitations | Curator or client | Closing REQ-4.1-19 |

## Pending team action

**Test accounts.** Deactivate the test curator when testing ends, and review the leftover
`BB-TEST C0102 Invitee` pending invite from 2026-10-28.

**Email.**

- Fix the hosted recovery email template: it says "We received a JUMONG request", which is not
  BioSphere's name. This is a hosted change and needs the team's go-ahead.
- Use one sender name: Supabase Auth email shows "Biosphere System" and backend email shows
  "BioSphere Museum". Settle this with the production sender.
- Prepare the technical requirements for the USC IT request.
- Check what the Unsubscribe option on Auth email does in Brevo before production.

**Deployment.** Set `NEXT_PUBLIC_SESSION_IDLE_MINUTES` in each frontend deployment before building it.
If merges deploy automatically, deploy the backend before the frontend: the new invite flow needs
the backend to set the chosen password.
