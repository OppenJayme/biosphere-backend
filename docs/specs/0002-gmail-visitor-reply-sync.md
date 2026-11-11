# 0002. Import visitor email replies from the museum Gmail

**Date**: 2026-11-11
**Status**: In Progress

## Summary

Curators cannot see what visitors write back, because visitor replies land in the museum Gmail (the address set in `GMAIL_MAILBOX`) and never reach BioSphere. This spec records the team decision to let BioSphere read that mailbox (read only) every couple of minutes and copy each reply into the history of the inquiry or visit request it answers. Sending stays on Brevo exactly as today. This reverses the SRS outbound only rule (BR-22, REQ-4.9-14), so the SRS wording must be updated by the team.

## Context

BioSphere emails visitors through Brevo (receipts, approvals, curator messages). When a visitor hits Reply, the reply goes to the museum Gmail, not to BioSphere. The curator working in BioSphere sees their own outbound message in the history but never the answer, so they have to search Gmail by hand and copy details into a note (staging feedback: "curators cannot see customer replies").

The approved SRS forbids exactly this today: BR-22 and section 4.9.2 say BioSphere sends outbound only and never reads a mailbox, and REQ-4.9-14 says incoming email is not imported. The team approved changing that requirement on 2026-11-11.

Constraints: the mailbox is a consumer Gmail account (no Google Workspace admin), so access needs the owner's OAuth consent. The `communication_history` table requires an acting curator on every row, which an incoming reply does not have. Visitor emails are personal data (NFR-SEC-10), so unrelated mail in that inbox must never be copied in. Outbound email (`src/mail/mail.service.ts`) is shared with auth emails in another owner's area.

## Requirements

**User stories**:
- As a curator, I want visitor replies to appear in the inquiry or visit request history, so that I see the whole conversation in one place.
- As a curator, I want to check for new replies on demand and see when the mailbox was last checked.

**Acceptance criteria**:
- **AC-1**: When enabled and configured, the server checks the museum mailbox on an interval (default 120 seconds, minimum 60) and on a curator request (`POST /mailbox-sync/run`).
- **AC-2**: A reply is imported only when it matches exactly one inquiry or visit request, either through its In-Reply-To or References header naming an email BioSphere sent, or through the "Ref XXXXXXXX" code in its subject, AND its sender address equals that record's email (case does not matter), AND Gmail's own Authentication-Results header shows the sender's domain really sent it (DMARC pass or best guess pass, or a DKIM signature from that domain). Added after the 2026-11-11 code review: the From header alone is easy to forge.
- **AC-3**: Unmatched mail, automated mail (Auto-Submitted, Precedence bulk, list, junk, auto_reply), and mail from the museum account itself are never stored.
- **AC-4**: An imported reply appears in the existing history as direction `INBOUND`, type `VISITOR_REPLY`, with no acting curator, its subject, its received time, and the visitor's text with the quoted earlier email removed, capped at 10,000 characters.
- **AC-5**: The same email is never imported twice, even when two checks run at once.
- **AC-6**: Each import writes an audit entry with the entry id only (no message text or address).
- **AC-7**: Every outbound email BioSphere records stores Brevo's Message-ID, so replies can match by header.
- **AC-8**: `GET /mailbox-sync/status` (curator only) shows enabled, configured, mailbox, last checked, last success, newest message seen, and the last error. No credential is ever returned.
- **AC-9**: A failed check (expired token, Gmail outage) keeps earlier progress, records the error in the status, and does not affect sending or any other workflow.
- **AC-10**: The inquiry and visit request history in the frontend shows visitor replies distinctly and has a Check for replies action with the last checked time.
- **AC-11**: The mailbox is never written to: no sending, labeling, archiving, or deleting.

## Options considered

### Option 1: Keep the SRS rule (curators copy replies by hand)

**Pros**: no new access to the mailbox; no schema change.
**Cons**: the problem testers reported stays; replies are easy to miss.

### Option 2: Send and read everything through the Gmail API

**Pros**: replies always thread with the sent email.
**Cons**: changes the shared MailService used by auth emails (another owner's area), needs the broader send scope, and Gmail sending limits apply.

### Option 3: A provider inbound parsing webhook

**Pros**: push instead of polling.
**Cons**: needs a domain with its own mail records pointed at the provider; the museum only has a Gmail address.

### Option 4: Keep Brevo for sending, read the museum Gmail read only (chosen)

**Pros**: sending is untouched; read only is the smallest Gmail permission; no new domain.
**Cons**: Google OAuth setup and token upkeep; polling delay of about two minutes.

## Decision

**Chosen option**: Option 4: Keep Brevo for sending, read the museum Gmail read only.

A server job reads the museum mailbox (`GMAIL_MAILBOX`) with the `gmail.readonly` scope and imports only replies it can tie to one record from that record's own email address.

## Rationale

The engineer wanted curators to see replies without touching outbound email, which other features and another owner's auth emails depend on. Reading only needs `gmail.readonly`, the narrowest Gmail permission, and plain HTTPS calls avoid adding the large `googleapis` package. A webhook would need a mail domain the museum does not have.

Matching requires the sender to equal the record's email because the inbox also receives unrelated mail and forwards. Importing only what can be tied to one record, from that visitor, keeps other people's mail out of BioSphere. Header matching is tried first; the subject reference code is the fallback because every BioSphere email subject already carries "(Ref XXXXXXXX)", and whether Brevo's returned id equals the Message-ID header visitors reply to is not yet verified.

## Feature design

**Data model sketch** (approved by the engineer 2026-11-11, migration `20261111000000_add_mailbox_reply_sync`):
- `communication_history.recorded_by` becomes nullable, guarded by CHECK `direction = 'INBOUND' OR recorded_by IS NOT NULL`.
- `communication_history.external_message_id` VARCHAR(255), unique, nullable: Brevo's Message-ID on outbound rows, the reply's Message-ID on inbound rows.
- New `gmail_sync_state`: `id` UUID PK, `mailbox` VARCHAR(255) unique, `last_message_at`, `last_checked_at`, `last_success_at` (TIMESTAMPTZ, nullable), `last_error` VARCHAR(500), `updated_at`. RLS forced; only `service_role` may read or write. No token is stored in the database.

**API surface**:
| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| /mailbox-sync/status | GET | none | MailboxSyncStatus | curator | 401, 403 |
| /mailbox-sync/run | POST | none | {checked, imported, skipped} | curator, 6 per minute | 503 (not set up, Gmail failed), 429 |
| /inquiries/:id/history, /visit-requests/:id/history | GET | unchanged | entries now include INBOUND rows, `recordedBy` nullable | curator | unchanged |

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| Check | messages to read | Gmail search `in:inbox -from:me after:<last_message_at minus 5 minutes>`, or the last 14 days on first run |
| Import | target record | outbound `external_message_id` named in In-Reply-To or References, else subject reference code via `referenceIdRange` |
| Import | sender | the From header address |
| Import | text, subject, received time | the plain text part (or tag stripped HTML), Subject header, Gmail `internalDate` |
| Import | dedupe key | Message-ID header, else `<gmail-ID>` |
| Outbound | external_message_id | Brevo send response `messageId` |
| Status | progress | `gmail_sync_state` row for `GMAIL_MAILBOX` |

**Key invariants**: inbound rows have no curator; every other row has one. Each Message-ID is stored at most once. Only matched replies from the record's own address are stored.

**Security model**: OAuth client and refresh token live only in server env vars. Status and run are curator only. Audit entries hold no message text or address. Polling never runs when `NODE_ENV=test`.

**Configuration required**:
- `GMAIL_SYNC_ENABLED`: `true` to turn the sync on (default off).
- `GMAIL_MAILBOX`: the museum address being read.
- `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`: the Google Cloud OAuth client.
- `GMAIL_REFRESH_TOKEN`: issued once by the mailbox owner for scope `https://www.googleapis.com/auth/gmail.readonly`.
- `GMAIL_SYNC_INTERVAL_SECONDS` (default 120, minimum 60), `GMAIL_SYNC_LOOKBACK_DAYS` (default 14, maximum 90).

**Critical test scenarios**:
- Happy path: a reply with In-Reply-To naming a sent email, from the visitor's address, is imported with the quote removed, verifies **AC-2**, **AC-4**, **AC-6**
- Fallback: a reply with "(Ref XXXXXXXX)" and the record email is imported, verifies **AC-2**
- Failure: a reply from another address, an out of office reply, and a newsletter are skipped, verifies **AC-3**
- Failure: a duplicate import (P2002) counts as skipped; a token failure records the error, verifies **AC-5**, **AC-9**

## Build plan

1. Migration and Prisma schema for the three changes, satisfies **AC-4**, **AC-5**, **AC-7**
2. Store Brevo Message-ID on outbound history rows, satisfies **AC-7**
3. `src/mailbox-sync/`: Gmail client, reply parser, sync service with interval and matching, status and run endpoints, unit tests (done on the branch), satisfies **AC-1** to **AC-6**, **AC-8**, **AC-9**, **AC-11**
4. Frontend: render INBOUND entries in both history timelines, Check for replies action and last checked time, satisfies **AC-10**
5. Setup guide for the Google OAuth client and refresh token, then enable on staging, satisfies **AC-1**

## Migration plan

**Strategy**: feature flagged.
**Phases**:
1. Apply the migration (additive: one nullable column, one relaxed NOT NULL with a CHECK, one new table). Deploy code with `GMAIL_SYNC_ENABLED` unset; outbound emails start storing Message-IDs.
2. Create the OAuth client, issue the refresh token, set the env vars on staging, enable, and watch `/mailbox-sync/status`.
**Rollback**: unset `GMAIL_SYNC_ENABLED`. The schema change is backward compatible; imported rows can stay.
**Risks**: Google Cloud OAuth apps left in Testing status issue refresh tokens that expire after 7 days, and `gmail.readonly` is a restricted scope that Google may require verification for before production use. Confirm the right publishing status before staging is relied on.

## Consequences

**Positive**:
- Curators see visitor replies in the record history without leaving BioSphere.
- Sending and auth emails are unchanged.

**Negative / tradeoffs**:
- BioSphere now holds read access to the museum mailbox; the refresh token is a sensitive secret to rotate if leaked.
- A reply from a different address than the one on the request stays in Gmail only.
- Replies appear within about two minutes, not instantly.
- There is no in system notification for a new reply yet.

**Neutral**:
- SRS BR-22, section 4.9.2, and REQ-4.9-14 must be reworded by the team.

## Follow-up

- [ ] Team updates the SRS wording (BR-22, 4.9.2, REQ-4.9-14) to allow read only reply import.
- [ ] Verify on staging that Brevo's returned messageId equals the Message-ID header visitors reply to.
- [ ] Decide the Google OAuth publishing status for the museum project (Testing tokens expire after 7 days).
- [ ] Decide whether a new reply should raise a curator notification (needs a `user_notification_state` CHECK change, a schema decision).
