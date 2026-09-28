# BioSphere Public Submissions Guide

This module implements the persistence, access, and validation portion of SRS
Sections 4.8 (General Inquiry) and 4.9 (Visit Request) using the existing
`inquiry`, `visit_request`, `preferred_visit_date`, `visit_request_visitor`, and
`visit_request_vehicle` tables.

## Access boundary

- `POST /inquiries` and `POST /visit-requests` are public (no token) and use
  `PUBLIC_FORM_RATE_LIMIT`.
- Every other route handles visitor personal data and requires an
  authenticated, active `CURATOR` account (NFR-SEC-10). Developers receive 403.
- The public `POST` returns only a receipt: `{ id, status, submittedAt }`. It
  never echoes the submitted personal data.

## Endpoints

- `POST /inquiries`: public General Inquiry submission.
- `GET /inquiries?status=`: list, newest first.
- `GET /inquiries/:id`
- `PATCH /inquiries/:id` with `{ status }`: `PENDING`, `REVIEWED`, or `CLOSED`.
  `TURNED_TO_VISIT_REQUEST` is reserved for the referral workflow.
- `DELETE /inquiries/:id`: 204, or 409 when linked records exist.
- `POST /visit-requests`: public Visit Request submission.
- `GET /visit-requests?status=`: list, newest first.
- `GET /visit-requests/:id`
- `PATCH /visit-requests/:id` with `{ status }`: any of the six REQ-4.9-09
  statuses.
- `DELETE /visit-requests/:id`: 204, removing child rows first; 409 when
  communication history is linked.

`PATCH` changes workflow status only. Submitted visitor content cannot be
edited; extra fields are rejected with 400.

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

## Audit

Submissions, status changes, and deletions are written to `audit_log` in the
same transaction as the change (`SUBMIT_INQUIRY`, `UPDATE_INQUIRY_STATUS`,
`DELETE_INQUIRY`, and the `VISIT_REQUEST` equivalents). Audit details never
contain visitor personal data. Public submissions have a null `user_id`.

## Not yet implemented

Curator email alerts and outbound replies (REQ-4.8-08/09, REQ-4.9-07/11),
inquiry-to-visit referral (REQ-4.8-07), selecting the approved schedule
(REQ-4.9-16), status history beyond the audit log, and file attachments.
