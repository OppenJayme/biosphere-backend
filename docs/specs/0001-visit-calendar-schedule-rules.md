# 0001. Approved visit calendar and visit schedule rules

**Date**: 2026-11-11
**Status**: In Progress

## Summary

Staging testers found that visit requests accept any time, including times already taken by another approved visit, and that curators have no calendar of booked visits. This spec records the team decision: visitors can request any day the museum is open (Saturday included), but every preferred time must fit inside the published opening hours and must not overlap a visit a curator already approved. Curators get a calendar view inside the existing Visit Requests page that shows only approved visits, plus a small upcoming visits card on the Dashboard.

## Context

The SRS (section 4.9, REQ-4.9-02, REQ-4.9-06) asks the form to validate schedule values, but it never defines museum hours or what makes a time unavailable. The backend only rejected past dates. On staging, testers could request a time on a Sunday, during the weekday lunch break, or exactly when another group was already approved, and two requests could end up approved for the same date and time (staging smoke test items 3 and 4).

Curators also had no way to see the approved schedule as a calendar. They had to open each Visit Request one at a time to know which days were taken, which makes conflicts easy to miss.

The museum published its opening hours in the public website footer on 2026-11-07 (`biosphere-frontend/src/components/layout/PublicFooter.tsx`): Monday to Friday 08:00 to 11:00 and 13:00 to 16:00, Saturday 08:00 to 11:00, closed on Sunday and on regular holidays. That is the only place the hours exist today.

Visit request personal data must stay curator only (REQ-4.9-15, NFR-SEC-10), so whatever the public form uses to show taken times cannot expose who booked them.

## Requirements

**User stories**:
- As a visitor, I want to see which times are open before I submit, so that my request is not rejected for a taken or closed time.
- As a curator, I want a calendar of approved visits, so that I can see the schedule at a glance and avoid double booking.
- As a curator, I want approval to stop me from approving a time that is already taken.

**Acceptance criteria**:
- **AC-1**: A preferred option dated before today, or today with a start time that has already passed, in museum time (Asia/Manila), is rejected with 400.
- **AC-2**: A preferred option must fit entirely inside one opening window for its day of the week (Monday to Friday 08:00 to 11:00 or 13:00 to 16:00, Saturday 08:00 to 11:00). Sunday and times crossing the lunch break or closing time are rejected with 400, and the message states that day's hours.
- **AC-3**: A preferred option that overlaps a scheduled visit (status Approved by Curator, Submitted for Campus Entry, or Completed) on the same date is rejected with 409 on public submission and on inquiry referral. A time that starts exactly when another ends does not overlap.
- **AC-4**: Pending, Declined, and Cancelled requests never hold a time; several Pending requests may ask for the same time.
- **AC-5**: Approving a preferred option that overlaps another scheduled visit is rejected with 409 and leaves the request Pending. The check runs inside the existing serializable approval transaction, so two curators approving overlapping visits at once cannot both succeed.
- **AC-6**: The public availability endpoint returns the opening hours and the booked date and time ranges only, with no name, email, organization, or reference code.
- **AC-7**: The curator calendar endpoint is curator only and returns only scheduled visits (AC-3 statuses) in the requested range.
- **AC-8**: The Visit Requests page offers a List and Calendar toggle. The Calendar shows a month of approved visits; choosing one opens the existing visit request detail.
- **AC-9**: The Dashboard shows an Upcoming visits card with the next approved visits, linking to the calendar.
- **AC-10**: The public visit form only offers dates and times inside opening hours, shows times already booked on the chosen date, and shows the server message when a submission is still rejected.

## Options considered

### Option 1: Calendar as a toggle in Visit Requests, free times inside opening hours, approved visits block overlaps (chosen)

The calendar reuses the Visit Requests page, its filters, and its detail panel. Visitors keep choosing their own start and end time, limited to opening hours, and only curator approved visits make a time unavailable.

**Pros**:
- Same data and actions as the existing list, so curators learn nothing new and no detail screen is duplicated.
- Visitors keep the free time inputs they already use.

**Cons**:
- Pending requests can ask for the same time until a curator approves one of them.

### Option 2: Calendar as its own sidebar item

**Pros**:
- More visible as a planning tool.

**Cons**:
- A second page showing the same visit requests, with its own detail and filters to keep in sync.

### Option 3: Calendar only as a Dashboard panel

**Pros**:
- Seen on every login.

**Cons**:
- Cramped, and puts visitor personal data on the home screen.

### Option 4: Fixed slots, or a headcount capacity per slot

**Pros**:
- Simpler availability math; capacity allows several small groups at once.

**Cons**:
- Changes the form visitors already use and needs slot or capacity numbers the museum has not given.

## Decision

**Chosen option**: Option 1: Calendar as a toggle in Visit Requests, free times inside opening hours, approved visits block overlaps.

Visitors may request any open day; each preferred time must fit one opening window and must not overlap a scheduled visit, and curators see approved visits on a calendar inside Visit Requests plus an Upcoming visits card on the Dashboard.

## Rationale

The calendar is a different view of the same records curators already manage in Visit Requests, so a toggle keeps one source of filters and one detail panel instead of a second page that can drift (the engineer chose this on 2026-11-11). The Dashboard only needs a short summary, which keeps visitor details off the home screen.

The engineer first answered that visitors "can book whenever" and later clarified the intent: any day the museum is open, including Saturday, but only inside the published opening hours. Free start and end times were kept because the public form already collects them and the museum has not defined slots or capacity.

Only scheduled visits block a time because a Pending request is not a commitment; curators routinely receive several requests for the same day and pick one. The approval check is the authoritative guard and runs in the serializable transaction approval already uses.

## Feature design

**Data model sketch**: no schema change. Uses `visit_request.status`, `approved_date`, `approved_start_time`, `approved_end_time`, and `preferred_visit_date` rows. Opening hours are a code constant in `src/visit-requests/museum-hours.ts`, mirroring the public footer.

**State transitions**: unchanged (SRS B.3). A request starts holding its time when it becomes Approved by Curator and keeps holding it through Submitted for Campus Entry and Completed. Declined and Cancelled release it.

**API surface**:
| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| /visit-requests | POST | preferredSchedules[] {date, startTime, endTime} | receipt | public | 400 (past, outside hours), 409 (overlap) |
| /visit-requests/:id/approve-schedule | PATCH | preferenceOrder | VisitRequest | curator | 400 (past), 409 (overlap) |
| /visit-requests/availability | GET | from, to (YYYY-MM-DD, at most 93 days) | {openingHours[{dayOfWeek, start, end}], booked[{date, startTime, endTime}]} | public | 400 |
| /visit-requests/calendar | GET | from, to (at most 93 days) | [{id, referenceCode, status, organization, contactPerson, visitorCount, date, startTime, endTime}] | curator | 400, 401, 403 |

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| Submit, approve | "today" and "now" | server clock in Asia/Manila |
| Submit | opening window for the date | `MUSEUM_OPENING_HOURS` keyed by the date's weekday |
| Submit, approve | overlapping visits | `visit_request` rows with a scheduled status, same `approved_date`, `approved_start_time < end` and `approved_end_time > start` |
| Availability | opening hours | `openingWindows()` from the same constant |
| Availability, calendar | booked ranges and events | scheduled `visit_request` rows in range |
| Calendar | reference code | first 8 characters of the id (existing `referenceCode`) |
| Visit form | which times to offer | the availability response |
| Dashboard card | upcoming visits | calendar endpoint from today for the next 14 days |

**Key invariants**:
- No two scheduled visits overlap on the same date (enforced at approval in a serializable transaction).
- Every new preferred option fits one opening window and is not in the past.
- The public availability response never carries personal data.

**Security model**: submission and availability are public and rate limited by the global throttle (submission also by the public form limit). Calendar, list, detail, and approval stay curator only.

**Critical test scenarios**:
- Happy path: a Tuesday 13:00 to 16:00 request with no approved visit is accepted, verifies **AC-2**, **AC-3**
- Failure: a request overlapping an approved visit gets 409; approving an overlapping option gets 409 and stays Pending, verifies **AC-3**, **AC-5**
- Failure: Sunday, lunch break, after closing, and Saturday afternoon are rejected with the day's hours, verifies **AC-2**
- Auth: the calendar without a curator token gets 401; availability has no personal fields, verifies **AC-6**, **AC-7**

## Build plan

Ordered as end to end slices (no project build approach is recorded, so end to end slices are assumed).

1. Backend validation: past date and passed time, opening hours, overlap on submit and referral, overlap on approval (done on `feat/visit-calendar-20261111`), satisfies **AC-1** to **AC-5**
2. Backend endpoints: public availability and curator calendar with unit and e2e tests (done), satisfies **AC-6**, **AC-7**
3. Frontend visit form: load availability, limit dates and times to opening hours, show booked times, show server errors, satisfies **AC-10**
4. Frontend Visit Requests page: List and Calendar toggle, month grid, event opens the existing detail, satisfies **AC-8**
5. Frontend Dashboard: Upcoming visits card linking to the calendar, satisfies **AC-9**

## Consequences

**Positive**:
- Double booking of approved visits is no longer possible.
- Visitors see closed and taken times before they submit.

**Negative / tradeoffs**:
- Opening hours live in two places (the backend constant and the public footer). A change to museum hours must update both.
- Holidays are not blocked; "closed on regular holidays" has no date list, so curators decline holiday requests by hand.
- Requests submitted before this change may already contain times outside opening hours. Approval does not recheck hours, so a curator can still approve one by arrangement.

**Neutral**:
- No migration. The availability response is a new public read of approved times only.

## Follow-up

- [ ] Decide whether the museum wants a holiday or closure date list curators can maintain (would need a table, so a schema decision).
- [ ] Move the footer hours to read from the same source as the backend if hours change often.
- [ ] Ask the team to add the opening hours and overlap rule to SRS section 4.9 (REQ-4.9-06).
