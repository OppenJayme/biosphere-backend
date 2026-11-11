# BioSphere Public Submissions Guide

This module implements SRS Sections 4.8 (General Inquiry) and 4.9 (Visit
Request) using the existing `inquiry`, `visit_request`, `preferred_visit_date`,
`visit_request_visitor`, `visit_request_vehicle`, and `communication_history`
tables. It does not introduce or alter database structures.

## Access boundary

- `POST /inquiries` and `POST /visit-requests` are public (no token) and use
  `PUBLIC_FORM_RATE_LIMIT`.
- Every other route handles visitor personal data and requires an
  authenticated, active `CURATOR` account (NFR-SEC-10). Developers receive 403.
- The public `POST` returns only a receipt:
  `{ id, status, referenceCode, submittedAt }`. It never echoes the submitted
  personal data.
- There is no `DELETE`. Closed inquiries and Declined, Cancelled, or Completed
  visit requests are retained with their history (REQ-4.8-11, 4.9-14).
  Deletion waits for the approved visitor-data retention policy.

## Endpoints

General Inquiry:

- `POST /inquiries`: public submission.
- `GET /inquiries?status=&search=&submittedFrom=&submittedTo=`: list, newest
  first. `search` matches name, email, organization, inquiry type, or message
  (case-insensitive, max 100). See [Date filters](#date-filters).
- `GET /inquiries/:id`: includes `visitRequestId` once referred.
- `PATCH /inquiries/:id` with `{ status, note? }`: `REVIEWED` or `CLOSED`.
- `POST /inquiries/:id/referral`: refers the inquiry to a new Pending visit
  request (REQ-4.8-07). See [Referral](#referral).
- `GET /inquiries/:id/history`: the inquiry's timeline, oldest first.
- `POST /inquiries/:id/notes` with `{ message }`: internal curator note.

Visit Request:

- `POST /visit-requests`: public submission.
- `GET /visit-requests?status=&search=&submittedFrom=&submittedTo=&visitDateFrom=&visitDateTo=`:
  list, newest first. `search` matches contact person, email, organization, or
  purpose. See [Date filters](#date-filters).
- `GET /visit-requests/:id`: includes `approvedSchedule` and `sourceInquiryId`.
- `PATCH /visit-requests/:id` with `{ status, note? }`:
  `SUBMITTED_FOR_CAMPUS_ENTRY`, `COMPLETED`, `DECLINED`, or `CANCELLED`.
- `PATCH /visit-requests/:id/approve-schedule` with
  `{ preferenceOrder, note? }`: approves one preferred option (REQ-4.9.16).
- `GET /visit-requests/:id/campus-entry-summary`: approved visitor, schedule,
  and vehicle details for the manual USC campus-entry process (REQ-4.9-12).
  Only available once a schedule is approved. BioSphere never submits it to
  USC itself (REQ-4.9-13).
- `GET /visit-requests/:id/history`: the request's timeline, oldest first.
- `POST /visit-requests/:id/notes` with `{ message }`: internal curator note.
- `GET /visit-requests/availability?from=&to=` (public): museum opening hours
  plus the date and time ranges already held by approved visits. No names,
  emails, organizations, or reference numbers. Range at most 93 days.
- `GET /visit-requests/calendar?from=&to=` (curator): approved visits for the
  calendar view, see [Visit calendar and schedule rules](#visit-calendar-and-schedule-rules).

Curator alerts:

- `GET /notifications?limit=`: new submissions awaiting review. See
  [New submission alerts](#new-submission-alerts).

`PATCH` changes workflow status only. Submitted visitor content cannot be
edited; extra fields are rejected with 400. Setting the current status again is
a no-op.

## Status transitions (SRS B.3)

Any other change returns 400.

| Inquiry from | Allowed to |
| --- | --- |
| `PENDING` | `REVIEWED`, `TURNED_TO_VISIT_REQUEST` (referral only) |
| `REVIEWED` | `CLOSED`, `TURNED_TO_VISIT_REQUEST` (referral only) |
| `TURNED_TO_VISIT_REQUEST`, `CLOSED` | final |

An inquiry must be reviewed before it is closed; there is no direct
`PENDING` to `CLOSED` change.

| Visit request from | Allowed to |
| --- | --- |
| `PENDING` | `APPROVED_BY_CURATOR` (approve-schedule only), `DECLINED`, `CANCELLED` |
| `APPROVED_BY_CURATOR` | `SUBMITTED_FOR_CAMPUS_ENTRY`, `DECLINED`, `CANCELLED` |
| `SUBMITTED_FOR_CAMPUS_ENTRY` | `COMPLETED` |
| `COMPLETED`, `DECLINED`, `CANCELLED` | final |

Only Pending or Approved requests can be Declined or Cancelled. These states
follow REQ-4.9-09 and Appendix B.3 of the reviewed SRS.

## Referral

`POST /inquiries/:id/referral` takes `{ phone?, organization?, purpose?,
visitorCount, preferredSchedules, note? }`. Name, email, and consent come from
the inquiry. `phone` and `organization` default to the inquiry's values and are
required only when the inquiry has none. Schedules follow the same rules as the
public form, including opening hours and the overlap check (409).

In one transaction it creates a `PENDING` visit request linked by
`source_inquiry_id`, marks the inquiry `TURNED_TO_VISIT_REQUEST`, and records a
`REFERRAL` entry on both timelines. The new request is never auto-approved. It
returns `{ inquiry, visitRequestId }`.

## Approving a schedule

`approve-schedule` copies the chosen option's date and times into
`approved_date`, `approved_start_time`, and `approved_end_time` and sets
`APPROVED_BY_CURATOR`. Every submitted option stays stored in
`preferred_visit_date`. An option that has already started (Asia/Manila) is
rejected with 400. An option that overlaps another visit already Approved,
Submitted for Campus Entry, or Completed on that date is rejected with 409
and names that visit's reference number. The check runs inside the serializable
approval transaction, so two curators cannot approve overlapping visits at
once. Approval does not recheck opening hours, so an older request can still be
approved by arrangement.

## Visit calendar and schedule rules

Decided in [spec 0001](./specs/0001-visit-calendar-schedule-rules.md)
(team decision 2026-11-11, from staging feedback).

- Visitors may request any day the museum is open, Saturday included. Each
  preferred option must fit inside one opening window: Monday to Friday 08:00
  to 11:00 or 13:00 to 16:00, Saturday 08:00 to 11:00, closed Sunday. The hours
  live in `src/visit-requests/museum-hours.ts` and mirror the public website
  footer; change both together. Holidays are not blocked yet.
- Only visits with status `APPROVED_BY_CURATOR`, `SUBMITTED_FOR_CAMPUS_ENTRY`,
  or `COMPLETED` hold their time. Pending, Declined, and Cancelled requests
  never block, so several Pending requests may ask for the same time.
- Times overlap when one starts before the other ends; a visit may start
  exactly when another ends.
- The curator calendar (`GET /visit-requests/calendar`) returns only those
  scheduled visits: `id`, `referenceCode`, `status`, `organization`,
  `contactPerson`, `visitorCount`, `date`, `startTime`, `endTime`.

## Timeline (communication_history)

Each inquiry and visit request has one timeline stored in
`communication_history`, linked by `inquiry_id` or `visit_request_id`, with the
acting curator (`recorded_by`) and time (`created_at`):

| `direction` | `communication_type` | Written by | `message` |
| --- | --- | --- | --- |
| `INTERNAL` | `STATUS_CHANGE` | `PATCH`, `approve-schedule` | `Status changed from X to Y.` plus the approved option and the curator's `note` |
| `INTERNAL` | `REFERRAL` | `referral` | status change and the linked record's id, plus `note` |
| `INTERNAL` | `NOTE` | `POST .../notes` | the curator's note, max 2000 characters |
| `OUTBOUND` | `STATUS_UPDATE_EMAIL` | approve, decline, cancel | the plain-text email sent to the visitor |
| `OUTBOUND` | `MESSAGE_EMAIL` | `replies`, `messages` | the plain-text email sent to the visitor |

`OUTBOUND` entries also store `recipient_email`, `subject`, `delivery_result`,
and `sent_at` (null when the send failed). Incoming replies to the museum's
external mailbox are never imported (BR-22). Curators record what matters from
them as a `NOTE`.

## Date filters

All dates are `YYYY-MM-DD`; both ends are inclusive and either end may be left
out. An impossible date or a range that ends before it starts returns 400.

- `submittedFrom` / `submittedTo` (both lists): the submission date in museum
  time (Asia/Manila), so `submittedTo=2026-09-30` includes a request sent at
  11:30 PM that day.
- `visitDateFrom` / `visitDateTo` (visit requests): an approved request matches
  on its approved date. A request with no approved schedule yet matches when
  any of its preferred dates is in range. For upcoming visits, combine with
  `status=APPROVED_BY_CURATOR` or `SUBMITTED_FOR_CAMPUS_ENTRY`.

## New submission alerts

When a visitor submits an inquiry or visit request, BioSphere alerts the
curators in two ways (REQ-4.8-08, REQ-4.9-07, REQ-4.3-09):

- **Email:** each authorized curator recipient receives "New general inquiry
  received (Ref ...)" or "New visit request received (Ref ...)". SRS 6.6
  leaves the recipients to deployment: set `CURATOR_ALERT_EMAILS`
  (comma-separated) to choose them, or leave it empty to alert every `ACTIVE`
  `CURATOR` account at its Supabase login email. The email has only the
  reference number, the submission time, and a link to
  `${FRONTEND_URL}/public-website?tab=inquiries|visits&selected=<id>`. It has
  no visitor details, because email leaves BioSphere; the curator signs in to
  read them. Without `FRONTEND_URL` the link is left out.
- **In-system:** `GET /notifications` (curator-only) returns
  `{ total, pendingInquiries, pendingVisitRequests, emailFailures, items }`.
  Each item has `type`, `title`, `recordType` (`inquiry` or `visit_request`,
  as in the audit log), `recordId`, `referenceCode`, and `createdAt`, newest
  first. `limit` is 1 to 100 (default 20); `total` counts every alert before
  the limit. Items carry no visitor details (REQ-4.3-08).

| `type` | `title` | When |
| --- | --- | --- |
| `NEW_INQUIRY` | New general inquiry | The inquiry is `PENDING` |
| `NEW_VISIT_REQUEST` | New visit request | The visit request is `PENDING` |
| `SUBMISSION_EMAIL_FAILED` | Receipt email to the visitor was not delivered | The record is `PENDING` and its `EMAIL_SUBMISSION_RECEIPT` audit entry is `FAILED` |
| `SUBMISSION_EMAIL_FAILED` | Curator alert email was not delivered | The record is `PENDING` and its `ALERT_CURATORS` audit entry is `FAILED` |

`SUBMISSION_EMAIL_FAILED` meets SRS 3.4: delivery failures are logged and
surfaced to an authorized user in-system. Curator-initiated emails already
show their delivery result in the record's timeline.

The source feed is built from submissions still `PENDING` and their failed
email audit entries; source alerts disappear when a curator resolves the work.
Optional [per-curator read/dismiss state](./NOTIFICATION_STATE_GUIDE.md) now
implements REQ-4.3-07 without changing that work. It stays disabled until its
prepared migration and deployment checks are separately completed.

## Visitor emails (Brevo)

On submission, the visitor is emailed a receipt with the reference number:
"We received your BioSphere museum inquiry" or "We received your BioSphere
visit request". A visit request receipt lists each preferred option and says
the request is not yet approved. The receipt and the curator alerts are sent
after the submission is saved and do not delay the response. A failed send
never fails the submission.

The receipt is an agreed team/client decision, not an SRS requirement:
REQ-4.8-08 and REQ-4.9-07 require only the curator alerts. It replaces the
earlier no-receipt behavior from #95, so visitors have their reference number
in writing before a curator responds.

Every other email is sent when a curator acts:

| Curator action | Email | SRS |
| --- | --- | --- |
| `approve-schedule` | "Your BioSphere museum visit schedule has been approved": date, time, visitors, organization | REQ-4.9-11 |
| `PATCH` to `DECLINED` | "Update on your BioSphere visit request" | REQ-4.9-11 |
| `PATCH` to `CANCELLED` | "Your BioSphere museum visit has been cancelled" | REQ-4.9-11 |
| `POST /inquiries/:id/replies` | the curator's reply | REQ-4.8-05/09 |
| `POST /visit-requests/:id/messages` | the curator's message, e.g. a request for more information | REQ-4.9-10 |

- Decisions take `notifyVisitor` (default `true`) and an optional
  `visitorMessage` (max 5000) that appears in the email. `note` stays internal
  and is never emailed. Submitting for campus entry and completing do not email.
- `replies` and `messages` take `{ subject?, message }` (subject max 150,
  message max 5000) and return the timeline entry. The status does not change.
- Every email includes the record's reference number.
- The approval email approves the museum visit schedule only. It says USC
  campus entry is processed separately, because `APPROVED_BY_CURATOR` is not
  campus-entry approval (REQ-4.9-13).
- The email is sent after the decision is saved. A failed send never undoes
  it: the timeline entry records `FAILED ...` with no `sent_at`, and the
  curator can send a follow-up message.
- The audit log records `EMAIL_VISITOR` with the entry id, type, and whether
  it was delivered, but not the address or text.
- Submission emails are not curator actions, so they have no timeline entry.
  The audit log records `EMAIL_SUBMISSION_RECEIPT` with `{ delivered }` and
  `ALERT_CURATORS` with `{ recipients, delivered }`, both with a null
  `user_id`. Either is `FAILED` when an email was not delivered, and
  `ALERT_CURATORS` is also `FAILED` when there is no recipient.

Configuration (`.env`): `BREVO_API_KEY`, `MAIL_FROM_EMAIL` (a sender verified
in Brevo), and `MAIL_FROM_NAME`. Without them, emails are skipped with
`NOT_SENT email not configured`. Nothing is ever sent when `NODE_ENV=test`, so
test runs cannot use the real key.

## Reference number

`referenceCode` is the first eight characters of the record's id, upper-cased
(e.g. `9A81836F`). It is returned on public receipts and curator views, printed
in every visitor email, and curator `search` matches it for both resources.

## Validation rules

Both forms require `consentAccepted: true`; the server stores the acceptance
time as `consent_accepted_at`. Text limits match the database columns:

| Field | Inquiry | Visit request |
| --- | --- | --- |
| `name` | required, 100 | required, 100 |
| `email` | required, valid, 100 | required, valid, 100 |
| `phone` | optional, 7-20 of digits, spaces, `+()-` | required, same format |
| `organization` | optional, 100 | required, 255 |
| `message` / `purpose` | required, 2000 | required, 1000 |
| `inquiryType` | optional, 100, default `GENERAL` | - |
| `address` | - | optional, 255 |
| `equipment` / `notes` | - | optional, 500 / 1000 |

Visit-request specific rules:

- `preferredSchedules`: 1 to 5 entries of `{ date, startTime, endTime }`,
  stored in order as `preference_order` 1..n. `date` is a real `YYYY-MM-DD`
  calendar date, not before today in Asia/Manila, and a time today must not
  have started yet. Times are 24-hour `HH:MM`, `endTime` must be later than
  `startTime`, and the whole option must fit one opening window (400, the
  message states that day's hours). An option that overlaps an approved visit
  returns 409. Duplicate options are rejected.
- `visitorCount`: 1 to 200. `visitors` may list at most `visitorCount` people
  as `{ firstName, lastName? }` (50 and 49 characters).
- `vehicles`: 1 to 10 entries of `{ plateNumber, carBrand?, carType? }`, each
  stored as one `visit_request_vehicle` row. The list requires
  `bringingVehicle: true`, and `bringingVehicle: true` requires the list.
  A plate can appear once per request; spacing, hyphens and case are ignored
  when comparing plates. The number of vehicles is not capped by `visitorCount`.
- Each entry in `preferredSchedules`, `visitors` and `vehicles` must be an
  object. A nested array such as `vehicles: [[]]` is rejected with 400.

## Consistency and audit

Status changes, approvals, and referrals run as serializable transactions and
return 409 after repeated conflicts, so two curators cannot act on the same
record at once. Each change and its timeline entry are saved together.

Every action is also written to `audit_log` in the same transaction:
`SUBMIT_INQUIRY`, `UPDATE_INQUIRY_STATUS`, `REFER_INQUIRY`,
`ADD_INQUIRY_NOTE`, `SUBMIT_VISIT_REQUEST`, `UPDATE_VISIT_REQUEST_STATUS`,
`APPROVE_VISIT_SCHEDULE`, `CREATE_VISIT_REQUEST_FROM_REFERRAL`,
`ADD_VISIT_REQUEST_NOTE`, and `EMAIL_VISITOR`. Audit details never contain
visitor personal data or note text. Public submissions have a null `user_id`.

## Not yet implemented

The [2026-10-28 SRS/source gap review](./PUBLIC_WEBSITE_GAP_REVIEW.md) records
its earlier source baseline, content/policy dependencies and unreproduced
visitor-form risks. Static public pages are required by section 4.10; their
static implementation is not a missing CMS. The read/dismiss gap identified in
that review is now implemented behind the default-off rollout flag; see the
[notification state guide](./NOTIFICATION_STATE_GUIDE.md) for activation and limits.

- General operational alert integration beyond submissions/email failures
  (REQ-4.3-05/10). The optional recipient-state slice does not implement every
  sync/backup/specimen/storage/QR/AR event source.
- Bounce and delivery-status tracking after Brevo accepts an email (would need
  a Brevo webhook).
- Visitor-list file upload on the visit form.
- Deleting or anonymizing finished records. The SRS leaves the visitor-data
  retention period and deletion procedure for USC-BM/university approval.

## Uncertain public submission feedback - 2026-10-28

OBS-004 was reproduced as [DEF-027](./TEST_DEFECT_LOG.md#def-027---public-forms-misreport-uncertain-submission-outcomes).
Frontend [repair PR #92](https://github.com/OppenJayme/biosphere-frontend/pull/92),
commit `ac8a3e7842b91d4c1fd4f904b75179f9b2e629c6`, merged on 2026-10-29.
The original verification below predates merge; current combined evidence is
recorded in the 2026-10-29 checkpoint at the end. John/Charles retain ownership.

The direct browser-to-backend POST remains unchanged so public per-IP rate
limits still apply to the visitor. Only a valid server receipt (UUID, nonblank
reference, initial PENDING status and ISO timestamp) produces the success screen.
Malformed/unreadable success, transport loss and unexpected HTTP errors produce
an uncertain outcome with no fabricated receipt or claim that nothing was saved.
Known 400/429 rejections retain their separate validation/wait guidance.

This is a cross-repository receipt contract: backend `InquirySubmissionReceipt`
and `VisitRequestSubmissionReceipt` return `id`, `referenceCode`, `status` and
`submittedAt`. Initial status is PENDING. Backend field/status changes must be
coordinated with the frontend receipt validator and its tests; an incompatible
receipt intentionally produces unknown-outcome feedback, not fabricated success.


Both real forms retain their entries and consent, focus the uncertainty warning
and disable sending, including requestSubmit, until the visitor explicitly
acknowledges the risk. "I checked; allow another submission" enables sending
without sending a request itself. A later explicit Submit performs the POST;
there is no background replay or automatic retry. This is acknowledgement, not
proof the visitor checked and not a server-side idempotency guarantee. The
visitor can still deliberately send another request. Values stay only in the
open form; closing/reloading is not a durable draft/receipt recovery mechanism.
No visitor data is added to persistent browser storage by this repair.

User-agreed seams are the real helper with synthetic external fetch, plus both
real forms/helper/validators/components in isolated Edge with synthetic HTTP.
No private collaborator is replaced. Browser fixtures use fixed synthetic env,
no .env/public assets, default-deny requests and a unique nonpersistent session.

Verification:

- `npm test -- src/features/public-submissions/submit.test.ts`: 13/13.
- `npm run test:public-submissions:browser`: 14 scenarios; owned session closed.
- `npm test`: 439/439 in 72 files.
- Full frontend lint, Next type generation and TypeScript no-emit pass. An
  isolated production webpack build passes with synthetic public configuration.

Prerequisites: existing lockfile-installed frontend dependencies, separately
installed pinned tools/browser dependencies and the supported installed Edge
channel. No live application URL is accepted by the browser runner. Its README
describes setup/containment. No actual API/database or email command should be
substituted for a missing tooling prerequisite.

The owner observed red before green for malformed receipt, transport/server
feedback, invalid receipt fields and immediate UI resend. These results verify
bounded client behavior, not actual database commits, email, deployed CORS or
proxy behavior, server duplicate prevention, modal close/reopen or full
accessibility. The task made no shared records, environment, server, migration,
account or Inventory changes. Merge/CI, deployed-build verification and
independent module-owner acceptance remain separate.

### Independent review and acknowledgement focus follow-up - 2026-10-28

Charles (WhiteBeardddd, via Claude Code) independently reviewed the original
frontend `3e4b261e905e8c731908123371f83c0ec068c356` and reported 13/13 helper cases
plus fourteen browser scenarios, exit 0, with owned-session cleanup. His
[scoped approval/report](https://github.com/OppenJayme/biosphere-frontend/pull/92#pullrequestreview-5684949107)
did not claim the full suite, lint or build as independent results.

He additionally reproduced focus moving to body when the focused acknowledgement
button unmounts. Owner regression reproduced that failure before the repair.
The button now focuses the still-rendered warning after acknowledgement; the
warning retains keyboard focus without sending a POST. Both forms' transport
cases now include acknowledge -> 503 -> acknowledge -> success, verifying gate
rearming, warning focus and explicit retained-payload retry. These assertions
remain within the same fourteen scenario groups, not a new count of scenarios.
The latest owner-verified repair is `ac8a3e7842b91d4c1fd4f904b75179f9b2e629c6`; his earlier
approval/results refer to the original SHA, not automatic reapproval of this
follow-up. Owner rechecks passed the fourteen browser groups, all 439 frontend
tests (including the thirteen helper cases), full lint, TypeScript no-emit and
an isolated synthetic-config production build. No running app was refreshed.

### Follow-up backlog (not implemented or approved for deployment)

| ID | Follow-up / owner | Scope and exit criteria |
| --- | --- | --- |
| PUB-F01 | Optional public-create idempotency; inquiry/visit backend owners, coordinate John/Charles and frontend | Design an opaque client retry key for both POST routes, same-key/same-payload original receipt, changed-content conflict and atomic concurrent behavior. Preserve per-IP abuse controls and avoid public personal-data lookup, duplicate emails or cross-visitor receipt disclosure. Agree key scope/expiry/privacy and migration/rollout before implementation. Explicit resend currently can create another record; no exactly-once claim. |
| PUB-F02 | Pending-response deadline and close/backdrop policy; public-form owners | A hung fetch has no current deadline. Define bounded timeout, interruption/close behavior and truthful unknown-outcome recovery without automatic resend; abort does not prove database rollback. Investigate the source-inspected scrollbar/backdrop dismissal risk before claiming reproduction or a fix. Agree treatment of closed form contents; no persistent visitor drafts are authorized by this note. Configuration-related unexpected 4xx currently stays conservatively unknown. |
| PUB-F03 | Browser-tooling maintenance; frontend/tooling owners | Assess shared fixture-runner/focus utilities and explicitly declaring the already-used Vite dependency against committed lockfiles and Node/tool versions. These are optional maintenance tasks; no dependency upgrade, installer or broad AR/dialog refactor is bundled into the public-form repair. Preserve default-deny fixtures and own-session cleanup. |

The merged notification implementation has separate known production limits:
`getFeed` and `updateState` scan all Pending source events before in-memory
recipient filtering, and state rows have no automatic retention/cleanup. Feed
polling cost scales with backlog and signed-in curators; leaving Pending hides
a source alert but retains its state rows until account cascade or a future
approved cleanup. Dashboard/feed owners should define profiling/bounding and
retention policy before production. No cleanup, source deletion, scheduler or
new migration is authorized here; see the [notification guide](./NOTIFICATION_STATE_GUIDE.md).

## Public dialog keyboard recovery - 2026-10-28

The earlier modal keyboard inspection candidate was reproduced as
[DEF-028](./TEST_DEFECT_LOG.md#def-028---public-dialog-focus-escapes-and-is-not-restored-on-close).
The merged [frontend repair #93](https://github.com/OppenJayme/biosphere-frontend/pull/93),
commit `35e1f34b1ca9f27f00e190a4c8a1373719275e50`, is now combined with #92 on
develop. The original independent-branch evidence below is historical; see the
2026-10-29 combined checkpoint. John/Charles retain module ownership.

The native dialog supplies background isolation; scoped first/last-control
handling keeps Tab and Shift+Tab within the current enabled/visible controls.
Escape uses the dialog cancel event. Closing restores the initiating element
when still connected, plus the exact previous body scroll style. Initial focus
is inside the dialog. No document-wide Escape listener or new dependency is
needed. Native semantics were checked against the
[dialog reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog)
and [showModal reference](https://developer.mozilla.org/en-US/docs/Web/API/HTMLDialogElement/showModal).
Actual supported-browser behavior is bounded by the checks below.

The user agreed real-dialog keyboard checks in a fresh isolated Edge fixture,
with no submissions, login, backend or email. The fixture mounts actual
VisitOptionsSection, Modal and inquiry/visit forms using synthetic public env,
no .env/assets and default-deny interception. It permits only its synthetic
fixture GET. All other requests are counted and aborted. The runner accepts
no application URL and closes only its unique session; artifacts stay ignored.

Verification:

- `npm run test:public-dialogs:browser`: six passing scenarios (two forms times
  Escape/Close/Cancel), zero non-read/unexpected requests and zero runtime errors.
- Actual keyboard checks cover initial focus, both Tab boundaries, blocked
  background focus, normal input traversal, opener return and empty/nonempty
  body overflow restoration.
- Original independent-branch `npm test`: 426/426 in 71 files, before #92 was
  included. The current combined suite is 439/439; no helper tests were removed.
- Original `da83f5a` verification: full frontend lint, Next type generation,
  TypeScript no-emit and isolated synthetic-config production build pass.
- Review cleanup `35e1f34`: explicit native-dialog text-ink and restored README
  punctuation; all six browser scenarios and focused Modal lint pass again.
  Charles independently reported six passing scenarios/cleanup at `da83f5a`;
  his prior approval is scoped to that SHA, not automatic review of later edits.

Use lockfile-installed application dependencies, optional pinned tools/browser
dependencies and the supported installed Edge channel. See the tooling README;
missing prerequisites are Blocked, not justification to use the running app or
weaken assertions. The production fixture's StrictMode wrapper does not establish
development Strict Effects behavior. Full CSS/visual, screen-reader, mobile and
cross-browser acceptance remain separate. The existing backdrop-close handler
is retained; this batch does not establish pointer hit testing or pending-submit
close/retention policy. The original isolated keyboard batch made no real public
POST/email and changed no server/configuration, migration, account or Inventory.
Implementation merge and the later authorized frontend smoke are recorded in
the following checkpoints; broader release acceptance remains separate.

## Merged public-form integration checkpoint - 2026-10-29

Frontend #92 and #93 are merged; #94 adds maintained combined-dialog regressions.
Fetched develop contains #94 at `06d929e8a23133bbb4db954a6b52bfd9aa40b1be`.
Backend #211 and #212 are merged at develop
`09c66966e8b569529affb0e7272d1ca71431d209`. Charles approved the corrected #212
head `14eae1b` for documentation/source-cross-check scope; this is not a new
independent browser or shared-database run.

The combined frontend tree matches CI-tested #94 head
`3c2e764f7d7565b29e9c2abdd4499424813d7396` exactly. Verified
[Frontend CI run 40818084859](https://github.com/OppenJayme/biosphere-frontend/actions/runs/40818084859)
reports 439/439 tests in 72 files, two canary server-contract tests, lint and
production build passing. Counts came from filtered CI job summaries, not a
new local full-suite run or a teammate's rerun. This closes the missing combined
suite record while retaining the older 426/426 branch-specific history.

Owner `npm run test:public-submissions:browser` now passes sixteen groups:
fourteen standalone cases plus two flows through the real VisitOptionsSection,
native Modal and forms. Transport failure -> acknowledgement -> 503 -> another
acknowledgement -> explicit success -> Done keeps warning focus inside the
modal, retains fields/consent, respects disabled-Send keyboard boundaries and
restores opener focus/scroll on Done. Only fixed-origin intercepted synthetic
HTTP is used; the owned browser session closes. Focused tooling lint and
TypeScript pass. Earlier independent thirteen-helper/fourteen-form and six-
keyboard reports remain tied to their original tested SHAs.

This implementation/review/integration batch is complete. Historical wording
about prepared/unmerged repairs does not reopen those batches. Full deployed
CSS/visual, mobile, screen-reader, pointer/pending-close, real provider/commit
and institutional content/privacy acceptance are separate. No live submission,
email, database/migration, account or Inventory operation occurred in this
closeout. At preflight, the running frontend still used the earlier notification
source `f3f38b2`. The subsequently authorized frontend-only rollout is recorded
below; the CI/fixture results themselves are not proof of that restart.

## Authorized local frontend refresh - 2026-10-29

The user explicitly approved refreshing only port 3000, preserving recovery and
checking both public dialogs without submitting. Deployed frontend source is
`06d929e8a23133bbb4db954a6b52bfd9aa40b1be` on the local rollout branch tracking
develop. Existing local configuration was retained; no environment values were
copied into documentation or a new application checkout.

The previous production build `GqhI5XaNB8UE49EstuJep` and source `f3f38b2` were
preserved in the private owned recovery directory before the exact frontend
process was stopped. The actual-config production webpack build passed and
serves build `5goHqxvW38dPzuTeCRyHt` on the existing loopback port 3000.
Backend port 3001 stayed on PID 20884 throughout the before/after checks. Both
original browser-session processes remained present and were not operated on.
The rebuilt frontend PID is 7592 at this checkpoint; process IDs are snapshots,
not permanent configuration. /visit and /login return 200; backend health is 200.

A fresh anonymous browser checked the actual local production /visit page,
using the real generated CSS and no fixture replacement. All non-read requests
were blocked. Two scenarios (inquiry/Escape and visit/keyboard Close) passed:

- Native modal is open; initial focus is inside and its heading is in view.
- Computed dialog text is the source-defined brand ink, rgb(21, 36, 27).
- Shift+Tab and Tab wrap correctly at the current first/last controls.
- A synthetic name can be entered and field traversal stays inside the dialog.
- Closing returns focus to the opening button and restores prior body overflow.

Observed zero attempted non-read requests, zero page errors and zero blocked
external reads. No public form was submitted and no success receipt or backend
failure was simulated against the running site. The temporary anonymous session
was closed; existing signed-in windows were left open. Recovery builds, logs,
process metadata and helper scripts remain private/ignored locally.

This verifies the bounded DEF-028 keyboard repair on the deployed local build,
so DEF-028 is Verified for that scope. It does not certify full WEB-005,
screen-reader/mobile/pointer behavior or the remaining pending-close policy.
DEF-027 retains its independently reviewed/owner-verified synthetic feedback
coverage; live public submission/receipt/provider release acceptance was not
performed by this explicitly read-only rollout. No repeat of the completed
owner keyboard or combined fixture batches is needed solely because these
broader requirements remain. No backend, database, migration, role, Inventory,
notification flag or email change was made.

Recovery: preserve the previous source/build recorded in the owned local
frontend-public-refresh directory. If necessary, stop only the identified
frontend and restore that exact source/build, then start again on the same
loopback port. Do not reset source records, alter backend state or drop tables.
