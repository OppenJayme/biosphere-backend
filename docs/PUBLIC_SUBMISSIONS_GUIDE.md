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
  visit requests are kept as the archive and history (REQ-4.8-12, 4.9-14).
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
  `{ preferenceOrder, note? }`: approves one preferred option (RED-4.9.17).
- `GET /visit-requests/:id/campus-entry-summary`: approved visitor, schedule,
  and vehicle details for the manual USC campus-entry process (REQ-4.9-12).
  Only available once a schedule is approved. BioSphere never submits it to
  USC itself (REQ-4.9-13).
- `GET /visit-requests/:id/history`: the request's timeline, oldest first.
- `POST /visit-requests/:id/notes` with `{ message }`: internal curator note.

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

Only Pending or Approved requests can be Declined or Cancelled. Appendix B.3
also mentions a "Confirmed" visit state, but REQ-4.9-09 and the
`visit_request_status` enum do not include it, so no such status exists until
that SRS inconsistency is formally resolved.

## Referral

`POST /inquiries/:id/referral` takes `{ phone?, organization?, purpose?,
visitorCount, preferredSchedules, note? }`. Name, email, and consent come from
the inquiry. `phone` and `organization` default to the inquiry's values and are
required only when the inquiry has none. Schedules follow the same rules as the
public form.

In one transaction it creates a `PENDING` visit request linked by
`source_inquiry_id`, marks the inquiry `TURNED_TO_VISIT_REQUEST`, and records a
`REFERRAL` entry on both timelines. The new request is never auto-approved. It
returns `{ inquiry, visitRequestId }`.

## Approving a schedule

`approve-schedule` copies the chosen option's date and times into
`approved_date`, `approved_start_time`, and `approved_end_time` and sets
`APPROVED_BY_CURATOR`. Every submitted option stays stored in
`preferred_visit_date`. An option whose date has passed (Asia/Manila) is
rejected.

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

There is no notification table, so the feed is built from submissions that
are still `PENDING` and their failed email audit entries. An alert clears once
a curator reviews, refers, approves, declines, or cancels the record. It
cannot be marked read or dismissed on its own (REQ-4.3-07); that needs a
notification table.

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
  calendar date, not before today in Asia/Manila. Times are 24-hour `HH:MM`
  and `endTime` must be later than `startTime`. Duplicate options are rejected.
- `visitorCount`: 1 to 200. `visitors` may list at most `visitorCount` people
  as `{ firstName, lastName? }` (50 and 49 characters).
- Vehicle details (`plateNumber`, `carBrand`, `carType`) require
  `bringingVehicle: true`, and `plateNumber` is then required.

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

- Marking a curator alert as read or dismissed (REQ-4.3-07), and alerts for
  anything other than new submissions (REQ-4.3-05). Both need a notification
  table.
- Bounce and delivery-status tracking after Brevo accepts an email (would need
  a Brevo webhook).
- Visitor-list file upload on the visit form.
- Deleting or anonymizing finished records. The SRS leaves the visitor-data
  retention period and deletion procedure for USC-BM/university approval.
