# BioSphere FAQ Knowledge Management Guide

<a id="approved-content-publication-and-public-widget-checkpoint---2026-11-06"></a>

## User-authorized publication and local public-widget checkpoint - 2026-11-06

The user explicitly requested adding the prepared entries through the
Curator workflow, activating them and checking the public assistant. This records
the user's authorization to publish, not separate content-owner approval of the
exact edited answers/aliases. **That approval remains unrecorded and open**, as
does institutional sign-off. ACTIVE is the application's lifecycle state, not
independent proof of either approval. Facts retain the reported October 30
Sir Fidel source and November 2/3 clarification provenance in the
[intake sheet](./FAQ_CONTENT_INTAKE_2026-11-02.md).

Executed by Codex/Playwright using the user's manually signed-in Curator session:
backend `0a864d4`, frontend `30d6cc7`, production build
`fg3bSJZZZz_Oe-dE_DpRs`, separate loopback ports 43180/43181, and the configured
hosted database target confirmed by the user. Content came from the seventeen
reconciled candidates at `78f7b32`. Runtime matcher code/thresholds and database
schema were unchanged. The later notification release is outside this checkpoint.

**Publication result: 17 user-authorized entries active.** Eleven were created inactive
and explicitly activated. Six existing overlapping entries were edited in place:
admission, appointment/guided tours, group batches, photography, handling and
location. Four of those six were inactive and explicitly activated; the other
two were already active and their published content was updated. Existing IDs
and history were retained. No synthetic fixture UUIDs were inserted, direct SQL
seed used, entry deleted/archived, or unrelated record changed.

The preflight found an active school-group answer incorrectly giving weekday
hours through 5 PM. Its overlapping entry now contains the user-authorized batch answer.
Previously inactive admission/location/handling drafts were also replaced with
the prepared content rather than activated unchanged. Prior values and operation
receipts are retained privately by **@OppenJayme**, the PR author, in the local
`faq-publication-20261106` evidence folder (`publication-state.json`,
`publication-receipts.json`, `approved-content.json`, and browser results).
Request a redacted copy from that custodian. These local copies are not a tested
automatic rollback or a durable institutional backup. The normal protected audit
trail remains; reverting content would use authorized Curator edits/deactivation,
not erase audit history or blindly restore unrelated database rows.

Each save was read back through the Curator form and compared across question,
answer, category, alternative wording and keywords. Each published entry showed
the active-state control. A final full-list reload found 30 total entries, exactly
one active row for each of the seventeen published questions, and all thirteen
unrelated pre-existing question/category/status/update-time rows unchanged.
This is row-summary preservation, not a full database-diff claim. Representative
weekday creation/activation, admission update/activation and already-active batch
update were visible in the protected audit UI. All mutations used the ordinary
authenticated Server Actions/API and confirmation dialogs; no credentials were
copied or exported.

**Local signed-out public widget against hosted data: 28/28 checks passed**,
without mocked responses. The frontend was at `127.0.0.1:43181`, not a deployed
public site; this does not demonstrate deployed-site/CORS/provider behavior.

| Check group | Count | Observed result |
| --- | --- | --- |
| Canonical questions | 17 | Real public HTTP 200/ANSWERED responses matched persisted entry IDs and exact user-authorized text; each answer rendered in the widget |
| Alternate/critical questions | 5 | Entrance fee, four USC students, exactly five visitors, alumni campus entry and non-school batch size returned the intended published answer |
| Opening-hours ambiguity and selection | 2 | One clarification response offered exactly two choices without an answer; a second request selecting Saturday returned its published answer |
| Bounded context | 2 | One weekday question/answer followed by a second request, `How about Saturday?`, returned the published Saturday answer |
| Unsupported questions | 2 | Species identification and an unspecified curator phone number returned NO_MATCH with General Inquiry referral |
| Total | 28 | 17 + 5 + 2 + 2 + 2 |

The public browser was a separate fresh context with no auth-token cookies;
canonical ask requests carried no Authorization header. No inquiries, visit
requests or consented unanswered-question submissions were made. The public
request guard recorded zero blocked requests; the existing rate limits were not
disabled. Publication completed around 02:12 and final persistence/audit checks
at 02:15 on November 6, Asia/Singapore.

This supplies live create/edit/activation and bounded public-answer evidence.
It does not prove deactivation exclusion, all inactive/archived exclusions on
this release, concurrency, every possible paraphrase/language, duplicate-policy
enforcement, official deployed hosting, every unrelated legacy answer's accuracy,
or independent module acceptance. No remaining unknown contact, cancellation,
document or Sunday facts were invented or activated. Optional question collection
and paid AI services were not enabled. Publication is complete; remaining case
dispositions and review should use this evidence rather than repeat the batch.

### Review follow-ups and unresolved content decisions - 2026-11-06

- **Content-owner decision:** @OppenJayme coordinates confirmation of the exact
  live answers/aliases with Sir Fidel. The interview facts and user publishing
  authorization must not be presented as that missing wording approval. Obtain
  the approving person's role/date and exact version, or required corrections;
  no sign-off has been invented by this review fix.
- **Multi-batch Visits limitation:** Charles, the documented Visits/public-flow
  owner, must reconcile the 50-per-batch rule with `MAX_VISITOR_COUNT = 200` and
  one confirmed schedule per request. A party of 120 cannot express three
  independently confirmed batches in one request. This is an **unaccepted open
  operational limitation**, not a waived requirement or an accepted booking
  process. @OppenJayme coordinates an answer before FAQ/Visits acceptance.
  General Inquiry coordination is a proposed interim route pending confirmation;
  do not promise automatic splitting, several reserved schedules, or invent a
  separate-request booking policy. No live wording/Visits change was made here.
- **Off-campus affiliation:** who qualifies as an affiliate and what an
  off-campus affiliate must do remain unconfirmed. Alumni are explicitly treated
  as outsiders for appointment/entry. The current affiliation sentence does not
  establish campus-entry authorization; do not infer staff or alumni exemptions.
- **Reviewer-reproduced phrasing gaps:** with only the seventeen candidates,
  `Can alumni walk in?`, `Can outsiders walk in?`, `Can USC staff walk in?`,
  `Can a group of 4 walk in?`, and `Can 60 students visit at once?` returned safe
  NO_MATCH. The reviewer reported appointment/five-person/maximum-group variants
  did answer. The 28 passing inputs above do not cover these five misses.
  Proposed aliases and off-campus scope need content-owner review and focused
  HTTP checks before a further authorized live update; no broader semantic
  accuracy is claimed and no unreviewed live alias was added by this doc repair.
- **Other active legacy content:** preflight read all six original active
  entries. Two overlapping entries were corrected in the publication. The four
  preserved active answers concern Sir Fidel, biology topics, specimen search
  and reporting an exhibit problem. The interview supports the Curator identity,
  but exact identity wording, broad collection-topic scope, actual public search
  availability and the claimed contact-page reporting route lack separate
  content-owner/functional confirmation here. Assign their editorial review to
  @OppenJayme with Sir Fidel; coordinate public-route facts with Charles. The
  other nine preserved rows were inactive/archived. Preserved is not factually
  verified; this follow-up does not activate, edit or retire those records.

The dedicated `evaluate:faq:curator` suite is now a named step in backend CI,
rather than relying on default Jest discovery. Its isolated adapter never uses
the hosted database. A local passing evaluation is not itself a completed
GitHub Actions run or content-owner approval.

Current answer-quality checkpoint: [content review and 25-case synthetic HTTP
evaluation](./FAQ_CONTENT_REVIEW.md), now 25/25 passing after bounded scope
checks; the original 23/25 diagnostic is retained. DEF-024 is Ready for retest,
with 15 ordinary HTTP scope regressions. Numerical thresholds are unchanged.
These synthetic passes are not independent acceptance, broad language accuracy
or approval of the fixture's fictional museum facts.

Latest addition (2026-10-25): [opt-in unanswered question review](./FAQ_REVIEW_QUEUE_GUIDE.md).
It is separate from approved FAQ entries, default-off, with a prepared-only
migration. The historical no-schema-change description below applies to the
original knowledge lifecycle, not this gated review extension.

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
- `POST /faq/assistant/ask` with `{ "question": "..." }` (1–500 chars), optionally
  `selectedFaqId` (UUID) for an explicit public question choice. Other fields
  remain rejected except optional `contextFaqId` (UUID) for bounded follow-ups;
  no visitor contact details or conversation history accepted.

The assistant only reads `ACTIVE` entries. It never writes: the question is not
stored, and no audit row is created. Responses contain only stored curator text
and a narrow public projection (no status, attribution, keywords, or alternative
wording).

### Approval status of the matching rules

**2026-10-24 source/decision reconciliation:** Section 7 of the user's retained
2026-10-05 eight-decisions handoff already sets working directions for ambiguous
match clarification (up to three choices), paraphrase/context handling and
unanswered-question logging/curator review. These are not missing user answers.
At that checkpoint the implementation did not fulfill all of them:
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
   is an exact match (score 1). It answers only if there is a unique strongest
   eligible candidate, or the visitor explicitly selected that active entry.
3. Otherwise the best Dice token overlap across the question and alternative
   wordings is used, plus 0.15 per curator keyword found in the question (max 3).
4. A non-exact match is answered only when **both** hold:
   - the score is at least 0.6, and
   - at least two of the visitor's tokens (or the only token, for a one-word
     question) appear in the entry's approved vocabulary: its question,
     alternative wording, and keywords.
5. **Equal-score ambiguity (2026-10-25 branch implementation):** multiple
   strongest eligible candidates produce `CLARIFICATION_NEEDED`, no answer and
   up to three tied public questions. Question text/id order the choices only;
   they do not select an answer. Near-tie margins remain undecided. A unique
   winner retains up to three other entries scoring at least 0.3 as related
   questions; no eligible candidate retains the existing fallback.
6. Explicit `selectedFaqId` chooses only that entry from the ACTIVE read set,
   never an inactive/archived record or a different answer substituted for a
   stale/missing choice. The selected active answer uses stored curator text.

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
| `CLARIFICATION_NEEDED`   | At least two strongest eligible candidates have equal scores; `answer` is null and `related` carries two or three choices | `null`, or `VISIT_REQUEST` for a visit transaction |
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

At this October 23 checkpoint, FAQ-002 remained In progress: actual
activation/deactivation, submitted error/pending states, persisted lifecycle
audits and active-to-archived behavior were still separate. Later November 6
user-authorized activation/persistence and representative audit checks are
recorded above; deactivation/exclusion and independent acceptance remain open.
The earlier isolated-setup condition was not a claim that the later publication
was unexecuted. These October results concern the then-served build, not
deployment of newer local source. No application code changed; only `git diff --check` was run for this
documentation update, not another full test/build run.

## Equal-score clarification implementation checkpoint - 2026-10-25

Backend `bafe427` and frontend `83ff93b` implement the first bounded slice of
Section 7's working direction. Public responses add `CLARIFICATION_NEEDED` with
no answer and two or three equally ranked eligible question choices. Optional
UUID `selectedFaqId` distinguishes a visitor choice from another free-text
search, including overlapping approved wording. Suggestions, clarification and
related chips now carry identity; typing still sends just question text. The
backend rechecks ACTIVE eligibility on every request. Unknown, deactivated or
archived choices return no answer without substituting another matching entry.
No schema migration, new numerical threshold, logging, semantic provider or
activation was introduced. Contextual follow-ups and evaluated near-ties remain
future work, not implemented features.

The frontend distinguishes clarification from no-match/service error, displays
the choices without a premature answer and does not invent an Inquiry redirect
for an ordinary clarification. Existing visitor Inquiry access and Visit Request
referral remain. Response validation rejects clarification carrying an answer,
fewer than two/more than three choices or duplicate choice IDs.

### Approved boundaries and test-first evidence

The user approved real Nest public HTTP tests with isolated database/auth
adapters and frontend request/UI boundaries with synthetic responses. No matcher
or service was mocked in HTTP tests. First HTTP tie test failed by receiving an
arbitrary ANSWERED response; first selection test failed with 400 before the DTO
extension. Each was followed by its minimal implementation and a passing run.
Frontend regressions failed first for unsupported clarification, missing choice
serialization and acceptance of malformed clarification, then passed after each
corresponding change. This is feature work against the reconciled working
requirements, not a claim of a newly introduced live production defect.

- FAQ HTTP: 23/23, including six new tests covering ties, selection, three-choice
  bounds/deterministic ordering, inactive/archived exclusion, stale choices,
  malformed UUID/extra-field rejection, public projection and visit referral.
- Backend unit: 690/690 across 53 suites; no live Developer HTTP suite run.
  Deliberately injected failure tests emitted their expected error/warning logs;
  these were not live import, email or audit incidents.
- Frontend: 378/378 across 64 files, including three new public request tests.
  Full frontend lint and non-incremental type-check passed.
- Backend non-emitting type-check passed. Full lint had zero errors and seven
  existing unused-disable warnings. An introduced inference warning and optional
  marker type error found during review were corrected; no logger suppressed.

### Isolated real-widget evidence and limitations

Temporary dev server bound only to 127.0.0.1:3002; a separate probe tab intercepted
all FAQ suggestions/ask traffic before forwarding. Synthetic responses exercised
pending feedback, three clarification chips/no early answer, selected-ID payload
and answer display, no-match Inquiry referral, network error/recovery and Escape
focus return. The completed probe passed, with four synthetic asks, zero live
FAQ requests forwarded, zero unexpected non-read requests and zero page errors.
It closed only after its held response settled; original role windows remained.

The initial browser probe timed out locating the launcher with an overly narrow
same-origin page-resource allowlist. A separate read-only preflight found the
launcher on `/about` with 200 and no page error. Allowing ordinary GET/HEAD page
resources while still intercepting every FAQ request yielded the pass without
changing acceptance assertions. The exact first-run cause was not established;
do not call the initial run passed or a confirmed application defect.

Only verified task-owned temporary server processes were stopped; 3002 was clear
afterward. Production frontend PID 47696 stayed unchanged and login returned
200. The already-running backend was in Nest watch mode: listener PID changed
from observed 32704 to 6828 during source edits. No manual backend restart was
issued; do not claim the process/build was held unchanged. Browser tests sent
no FAQ traffic to that watched backend and changed no live knowledge.

No production frontend rebuild or real public activation occurred. Backend HTTP
fixtures and browser responses do not prove live database concurrency, CORS,
deployed API/UI compatibility, rate-limit enforcement or independent acceptance.
FAQ-004 is In progress for this isolated slice, not Passed. Deploy the matching
backend API before the frontend: the old API rejects `selectedFaqId`, and the
old frontend treats the new outcome as unavailable. Browser helpers remain
ignored: `faq-clarification-ui-20261025.txt`, `faq-public-readonly-preflight.txt`.

## Bounded topic follow-ups checkpoint - 2026-10-25

Clarification backend #186/frontend #81 are confirmed merged. The next slice,
backend `4608b9f` and frontend `94293d1`, adds optional `contextFaqId` to the
public ask DTO. It is a public hint, not authorization or stored conversation.
The widget retains only the last ANSWERED FAQ ID in component memory and sends
it for explicit English `How about ...` / `What about ...` follow-ups. A full
new question and an explicit selected choice do not carry the previous topic.
No-match, clarification, errors and reload clear the hint. Minimize/reopen in
the same mounted widget preserves its existing conversation; no persistence
or multi-tab history sharing is introduced.

### Retrieval boundary

The backend recognizes these two prefixes after existing text normalization.
It rechecks the topic ID against the ACTIVE read set. Candidates must contain
every meaningful qualifier token in their approved question/alternatives/
keywords and share at least one meaningful token with the prior canonical
question. The existing matcher ranks the prior canonical question plus the
follow-up qualifier, using the same thresholds and equal-score clarification.
No answer text is used as matching authority and no missing facts are generated.

Missing/unknown/inactive/archived context, empty meaningful qualifiers or absent
approved follow-up evidence produce no answer and ask for a complete question,
an approved FAQ choice or General Inquiry. This avoids blindly repeating the
last answer. Explicit `selectedFaqId` still takes precedence and is checked
against ACTIVE knowledge. Complete new questions ignore even a supplied topic
hint. Submitted history and malformed context IDs remain rejected by the DTO.

This is lexical, conservative topic assistance, not broad semantic/multilingual
understanding. Approved alternative wording may be needed to bridge vocabulary
(for example `open` versus `opening`). Unrecognized follow-up phrasing uses the
ordinary stateless question matcher. No near-tie margin, new language model,
threshold adjustment, FAQ activation or visitor logging was added.

### Test evidence and limits

The user approved isolated public HTTP and frontend request/widget seams.
The first HTTP context request failed with 400 before the DTO/service change;
the first frontend context payload assertion failed before serialization was
added. Both passed after their corresponding minimal implementations.

- FAQ HTTP 29/29: six new tests cover successful follow-ups, missing approved
  qualifiers, missing/inactive/archived topic references, tied contextual
  candidates, topic change/explicit-selection precedence and invalid IDs/history.
  Controllers, validation, service and matcher are real; only database/auth
  adapters are isolated. No live knowledge was activated.
- Backend unit 690/690 across 53 suites; frontend 379/379 across 64 files.
  Both non-emitting type-checks and frontend lint passed. Final full backend
  lint passed with zero errors and seven existing unused-disable warnings.
  Deliberate unit failure-injection logs are not live email/import/audit incidents.
- One context-tie fixture initially expected clarification despite having one
  exact and one non-exact candidate. Its approved alternative wordings were
  corrected to actually tie; matching semantics/assertions were not weakened.
  A new untyped HTTP assertion lint issue was corrected using a typed response
  projection, without adding a lint suppression. These are development-check
  corrections, not newly established production defects.

A loopback-only temporary dev server and separate public-page probe locally
intercepted every FAQ request. The final thirteen-turn widget run verified the
context-ID payload after an answer; no context on complete new questions or
explicit choices; immediate follow-ups after no-match/error/clarification with
the hint cleared; and reload clearing. It observed zero unexpected requests,
zero page errors and zero live FAQ requests forwarded. Synthetic response
checks establish UI wiring, not live retrieval quality or browser/API integration.
The initial twelve-turn pass was strengthened with an immediate post-no-match
follow-up; only the final thirteen-turn run is claimed for that reset assertion.

Original browser role windows were preserved. Only verified task-owned 3002
processes were stopped; 3002 was clear afterward. Production frontend PID 47696
remained and login returned 200; backend listener was 36788 at preflight/cleanup.
The existing backend is in watch mode and may rebuild source; no manual backend
restart or fixed-runtime-build claim is made. No production frontend rebuild,
schema migration, dependency install or live FAQ mutation occurred. Ignored
diagnostic: `faq-context-ui-20261025.txt`.

The branches require review/merge and coordinated deployment (backend first:
old DTOs reject `contextFaqId`). Independent/live acceptance and representative
language/context/near-tie evaluation remain pending. FAQ-004 is In progress.
Next unresolved work includes duplicate knowledge policy and safe unanswered
review retention/access/abuse decisions before any persistent log is introduced.
