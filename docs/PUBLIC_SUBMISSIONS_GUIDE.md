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
- The public `POST` returns only a receipt: `{ id, status, submittedAt }`. It
  never echoes the submitted personal data.
- There is no `DELETE`. Closed inquiries and Declined, Cancelled, or Completed
  visit requests are kept as the archive and history (REQ-4.8-12, 4.9-14).

## Endpoints

General Inquiry:

- `POST /inquiries`: public submission.
- `GET /inquiries?status=&search=`: list, newest first. `search` matches name,
  email, organization, inquiry type, or message (case-insensitive, max 100).
- `GET /inquiries/:id`: includes `visitRequestId` once referred.
- `PATCH /inquiries/:id` with `{ status, note? }`: `REVIEWED` or `CLOSED`.
- `POST /inquiries/:id/referral`: refers the inquiry to a new Pending visit
  request (REQ-4.8-07). See [Referral](#referral).
- `GET /inquiries/:id/history`: the inquiry's timeline, oldest first.
- `POST /inquiries/:id/notes` with `{ message }`: internal curator note.

Visit Request:

- `POST /visit-requests`: public submission.
- `GET /visit-requests?status=&search=`: list, newest first. `search` matches
  contact person, email, organization, or purpose.
- `GET /visit-requests/:id`: includes `approvedSchedule` and `sourceInquiryId`.
- `PATCH /visit-requests/:id` with `{ status, note? }`:
  `SUBMITTED_FOR_CAMPUS_ENTRY`, `COMPLETED`, `DECLINED`, or `CANCELLED`.
- `PATCH /visit-requests/:id/approve-schedule` with
  `{ preferenceOrder, note? }`: approves one preferred option (REQ-4.9-17).
- `GET /visit-requests/:id/campus-entry-summary`: approved visitor, schedule,
  and vehicle details for the manual USC campus-entry process (REQ-4.9-12).
  Only available once a schedule is approved. BioSphere never submits it to
  USC itself (REQ-4.9-13).
- `GET /visit-requests/:id/history`: the request's timeline, oldest first.
- `POST /visit-requests/:id/notes` with `{ message }`: internal curator note.

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
acting curator (`recorded_by`) and time (`created_at`). All entries recorded so
far are `direction = INTERNAL`:

| `communication_type` | Written by | `message` |
| --- | --- | --- |
| `STATUS_CHANGE` | `PATCH`, `approve-schedule` | `Status changed from X to Y.` plus the approved option and the curator's `note` |
| `REFERRAL` | `referral` | status change and the linked record's id, plus `note` |
| `NOTE` | `POST .../notes` | the curator's note, max 2000 characters |

Incoming replies to the museum's external mailbox are never imported (BR-22).
Curators record what matters from them as a `NOTE`. Outbound email entries will
use the same table when email is added.

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
`APPROVE_VISIT_SCHEDULE`, `CREATE_VISIT_REQUEST_FROM_REFERRAL`, and
`ADD_VISIT_REQUEST_NOTE`. Audit details never contain visitor personal data or
note text. Public submissions have a null `user_id`.

## Not yet implemented

- Outbound email replies and requests for information, with delivery results
  (REQ-4.8-05/09, REQ-4.9-10/11).
- Curator in-system and email alerts for new submissions (REQ-4.8-08,
  REQ-4.9-07). The schema has no notification table yet.
- Visitor-list file upload on the visit form.
