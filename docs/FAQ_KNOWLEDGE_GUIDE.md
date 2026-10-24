# BioSphere FAQ Knowledge Management Guide

This module implements the curator-controlled knowledge lifecycle required by
REQ-4.11-02, REQ-4.11-03, and REQ-4.11-09, plus the public assistant below, using the existing
`public.faq_entry` table. It does not change the database schema.

## Lifecycle and approval boundary

- New entries always start as `INACTIVE`. Status is not accepted by create or
  update DTOs, and requests that try to inject one are rejected.
- Curators may edit `ACTIVE` and `INACTIVE` knowledge.
- Activation is the explicit approval step that makes an entry eligible for
  the public assistant.
- Deactivation removes an entry from matching eligibility without destroying
  it.
- Archive is permanent through routine API operations. Archived entries remain
  readable for history but cannot be edited, activated, or deactivated.
- Repeating the current lifecycle command is idempotent and does not create a
  duplicate audit event.
- No hard-delete endpoint is exposed.

## Knowledge fields

- `question` and `answer` are required non-empty plain text.
- `alternativeWording` and `keywords` are optional curator-approved text lists.
  Values are trimmed, repeated whitespace is collapsed, and case-insensitive
  duplicates within a request are removed while preserving the first spelling.
- `category` is optional curator-extensible text limited to the existing
  PostgreSQL `VARCHAR(100)` boundary. It is not an enum.
- HTML is not interpreted by the backend. Frontends must render these fields as
  escaped text unless a separate reviewed rich-text policy is introduced.

## Endpoints

- `POST /faq/entries`
- `GET /faq/entries?status=INACTIVE&category=Visit&page=1&limit=25`
- `GET /faq/entries/:id`
- `PATCH /faq/entries/:id`
- `PATCH /faq/entries/:id/activate`
- `PATCH /faq/entries/:id/deactivate`
- `PATCH /faq/entries/:id/archive`

All endpoints in this slice require an authenticated, active `CURATOR` account.
Mutations store BioSphere `user_account.id` attribution and write a protected
audit event atomically in the same serializable Prisma transaction.

## Public FAQ Assistant

The public assistant (REQ-4.11-01, REQ-4.11-04 to REQ-4.11-07, REQ-4.11-10,
BR-18) is served by `FaqAssistantController` on `@Public()` routes, separate
from the curator controller so its class-level `@Roles('CURATOR')` cannot block
visitors. Both routes are throttled at 30 requests per minute per IP.

- `GET /faq/assistant/suggestions?limit=6` — suggested questions from `ACTIVE`
  entries only (`id`, `question`, `category`), oldest first, max 20.
- `POST /faq/assistant/ask` with `{ "question": "..." }` (1–500 chars). No other
  field is accepted, so no personal information is collected.

The assistant only reads `ACTIVE` entries. It never writes: the question is not
stored, and no audit row is created. Responses contain only stored curator text
and a narrow public projection (no status, attribution, keywords, or alternative
wording).

### Approval status of the matching rules

**2026-10-24 source/decision reconciliation:** Section 7 of the user's retained
2026-10-05 eight-decisions handoff already sets working directions for ambiguous
match clarification (up to three choices), paraphrase/context handling and
unanswered-question logging/curator review. These are not missing user answers.
The current implementation described below does not fulfill all of them:
ties choose a winner, requests carry no topic context and no unanswered log is
written. Algorithm/provider, numeric thresholds, supported language/context
design and log retention remain open; institutional approval is not established.
See [implementation gap and next slice](./FAQ_ASSISTANT_NEXT_STEPS.md). Current
no-logging descriptions remain accurate implementation statements, not a
rejection of the later working logging requirement. No code/persistence changed.

**Not yet formally approved.** The SRS does not fix the matching rules, and the
earlier version of this guide required the team/client to approve the matching
method, thresholds, ambiguity behavior, and fallback wording before release.
The rules below were proposed by the development team on the `feat/faq-module`
branch (2026-10-04) and tightened after code review (2026-10-05). They are a
working proposal and must be reviewed before FAQ-004 user acceptance testing.

When they are approved, record it here:

| Item                                   | Approved by | Date | Notes |
| -------------------------------------- | ----------- | ---- | ----- |
| Matching method and thresholds         |             |      |       |
| Ambiguity behavior                     |             |      |       |
| Fallback and visit-redirect wording    |             |      |       |

### Matching rules (proposed)

Implemented in `src/faq/faq-matcher.ts`; thresholds live in
`FAQ_MATCHING_RULES`.

1. Text is lowercased, accent-stripped, and reduced to alphanumeric tokens. A
   light plural stem is applied. Common English stopwords and domain-generic
   words (`museum`, `biosphere`, `visitor`, `usc`, `university`, `biological`,
   `san`, `carlos`) are dropped, because nearly every entry contains them and
   they would otherwise match unrelated questions.
2. A normalized question equal to an entry's question or an alternative wording
   is an exact match (score 1) and is always answered.
3. Otherwise the best Dice token overlap across the question and alternative
   wordings is used, plus 0.15 per curator keyword found in the question (max 3).
4. A non-exact match is answered only when **both** hold:
   - the score is at least 0.6, and
   - at least two of the visitor's tokens (or the only token, for a one-word
     question) appear in the entry's approved vocabulary: its question,
     alternative wording, and keywords.
5. **Ambiguity:** among eligible entries the highest score wins; ties break on
   question text, then id, so results are deterministic. Up to three other
   entries scoring at least 0.3 are returned as related approved questions.
   Nothing else is answered; the visitor gets the General Inquiry fallback.

No AI, embeddings, or generated text are involved.

Consequence for curators: paraphrases are answered only when they reuse the
entry's own vocabulary. For example, "What time does the museum open?" does not
match "When is the museum open?" (keywords `hours`) because only `open` is
shared. Add the wording as an alternative, or add `time` as a keyword, to make
it match.

Visit-request detection (SRS 4.11.2) triggers only on the verbs `submit`,
`approve`, `cancel`, `modify`, `book`, or `reschedule` together with `visit`,
`request`, `appointment`, `booking`, `reservation`, `tour`, or `trip`. Ordinary
questions such as "What is the visit schedule?" get the normal answer or the
General Inquiry fallback.

### Response outcomes

| `outcome`                | When                                                    | `redirect`        |
| ------------------------ | ------------------------------------------------------- | ----------------- |
| `ANSWERED`               | An active entry met the threshold                       | `null`, or `VISIT_REQUEST` if the visitor asked for a visit transaction |
| `NO_MATCH`               | Nothing met the threshold                               | `GENERAL_INQUIRY` |
| `VISIT_REQUEST_REDIRECT` | No match, and the visitor asked to submit, approve, cancel, modify, book, or reschedule a visit | `VISIT_REQUEST` |

Every response includes `notice`, the "limited to curator-approved museum
information" disclosure the widget must show (REQ-4.11-10). The frontend maps
`redirect` to its own General Inquiry or Visit Request route.

## Curator search

`GET /faq/entries?search=parking` matches question, answer, category, keywords,
and alternative wording, all case-insensitively as substrings. Keywords and
alternative wording are searched with a parameterized `ILIKE` over the arrays,
because Prisma's array filters are case-sensitive; `%` and `_` in the search
text are matched literally. It combines with `status` and `category`.

## FAQ-003 category HTTP boundary checkpoint - 2026-10-23

Added four isolated HTTP regressions in `test/faq.e2e-spec.ts` at the
user-approved management API boundary:

- Create accepts a 100-character category; GET readback preserves it and the
  new entry remains `INACTIVE`.
- Edit accepts a 100-character category; GET readback preserves it without
  changing the other knowledge fields (apart from the update timestamp).
- Create rejects a 101-character category with `400` and a category-specific
  validation message; the management list is unchanged afterward.
- Edit rejects a 101-character category with `400`; full GET readback is
  unchanged, including an otherwise valid answer submitted in the same request.

Each new test passed on its first run against the existing implementation;
no runtime fix or new defect was needed. The complete FAQ HTTP suite passed
**17/17**, and `npm run lint:ci` exited successfully with zero errors and seven
unused-disable warnings on pre-existing ESLint directives (left unchanged).
The tests call real Nest controllers,
guards, DTO validation and services, replacing only the database and Supabase
adapters. Readback assertions use HTTP rather than inspecting mock storage.

This closes the previously untested category-length API bypass case, not all
of FAQ-003. Duplicate-question policy, browser lifecycle acceptance and formal
public-matching approval remain pending. The suite does not prove live database
constraints, rollback, concurrency or persisted audit history. No live records
were changed, and no test answer was activated in the public knowledge base.

## FAQ-002 activation cancellation checkpoint - 2026-10-23

Used the existing signed-in Edge session and retained inactive TEST entry
`231d8430-41d9-4d84-ab2b-1f8ddb6b8a4a` on `localhost:3000`, in a separate probe
tab allowing only GET/HEAD. No activation confirmation was submitted.

- The confirmation had an accessible title and description explaining public
  chatbot matching, plus a separate explicit **Yes, activate** button.
- Cancel and Escape closed it and restored focus to the activation trigger.
- Space opened it from the focused trigger. Six Tab presses did not focus a
  background page control; Escape again closed it and restored focus.
- The entry stayed inactive with unchanged displayed details after each
  cancellation and a reload. The probe recorded zero non-read requests and
  zero page errors; the original Audit tab remained open and signed in.

The initial diagnostic incorrectly required every Tab position to stay inside
the document. A bounded follow-up observed two positions with the body active,
`document.hasFocus() === false` and the dialog still `:modal`, followed by focus
returning to its buttons. The corrected check distinguishes those browser-level
focus departures from background-page focus. No application defect was
reproduced; this observation is not full keyboard/screen-reader sign-off.

FAQ-002 remains In progress: actual activation/deactivation, submitted error and
pending states, persisted lifecycle audits and active-to-archived behavior need
separate checks. Public activation still requires a confirmed isolated setup.
These results concern the existing served build, not deployment of newer local
source. No application code changed; only `git diff --check` was run for this
documentation update, not another full test/build run.
