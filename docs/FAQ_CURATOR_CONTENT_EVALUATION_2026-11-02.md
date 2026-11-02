# Curator-content readiness evaluation - 2026-11-02

## Result and purpose

**33/33 working quality cases pass** through the real public FAQ HTTP route,
controller, validation, guards, service and matcher on backend base `4de07c6`.
Seventeen review-only answer candidates use the facts and S01-S04 clarifications
in [content intake PR #224](https://github.com/OppenJayme/biosphere-backend/pull/224).
The reported source is Sir Fidel, with a conversation dated October 30, 2026; later user
clarifications were received November 2. This does not independently verify
the interview or approve editorial aliases/wording on the curator's behalf.

The content set and expected topics were fixed before execution. All cases
passed in the first run; no threshold, scoring, context or runtime change was
made to obtain that result. This is a visible development evaluation, not an
unseen benchmark, a visitor study, a scientific accuracy estimate or proof of
general language/number understanding.

## Reviewable content candidates

`test/fixtures/faq-curator-knowledge.ts` holds questions, exact stored-answer
wording, proposed aliases/keywords, category and source question numbers. The
synthetic UUIDs identify isolated test entries; they are not shared FAQ IDs.

These are synthetic editorial candidates, including user-relayed rules whose
precise walk-in eligibility and non-school group limits remain unconfirmed.
They need content-owner approval before any public activation. The visit form's
current schedule, batch and notification behavior must also be reconciled with
the content intake; these tests do not establish that those rules are enforced.

The seventeen topics are weekday hours, Saturday hours, closures, admission,
appointments, campus entry, tour batches, request lead time, general photography,
restricted photography permission, handling, conduct, address, assistance,
wheelchair ramps, research requests and curator referral.

Important qualifications and unresolved scope in these candidates:

- Free student admission is USC-only; alumni are free but require outsider
  campus entry. Other supplied exemptions remain separate.
- Five or more and guided tours require an appointment in the candidate; it
  directs smaller parties to the curator while walk-in eligibility is clarified.
- Fifty is a maximum per school-tour batch in the candidate; larger school
  groups use separate batches. Limits for other groups remain unconfirmed.
- Ordinary photography does not waive flash/tripod/professional permission.
- Ramps are described without promising a fully step-free third-floor route.
- Research requests do not grant handling or borrowing permission.

Unfinished facts are excluded: Sunday hours, parking prices, detailed bag/food
restrictions, official phone/email, public self-service visit cancellation,
specific campus-entry documents/directions and loan approval. No empty answer,
`N/A`, sample fee or invented institutional detail is activated.

## Coverage and limits

| Group | Cases | Expected behavior checked |
| --- | --- | --- |
| Canonical questions | 17 | Return the intended entry and its exact stored answer, with narrow public fields |
| Alternative wording, critical rules and follow-up | 8 | Fee phrasing; alumni campus entry; questions about parties of five/four; outside-school student exemption; larger-than-50 school parties; Saturday follow-up; flash permission |
| Unsupported/incomplete scope | 7 | No definitive answer for Sunday hours; no unrelated answers for parking price, tour-fee inclusion, bag/food detail, phone number, species identification or borrowing permission |
| Ambiguous hours | 1 | Ask for clarification rather than choosing weekday/Saturday arbitrarily |

Sunday permits either safe no-match or clarification; it does not require a
specific fallback string. Exact canonical/alias cases are deliberate smoke
checks, not held-out natural-language evidence. Related choices remain bounded
to three, and internal matching/provenance fields are not exposed in responses.

The existing `createFaqQualityApp` fixture uses isolated in-memory database and
authentication adapters, rejects attempted public audit writes/provider auth,
loads no AppModule/dotenv, and binds only a random loopback port. `ACTIVE` exists
only in that adapter. No shared database, real credential, public FAQ activation,
visitor question collection or running application was used or changed.

Run explicitly:

```powershell
npm run evaluate:faq:curator
```

The first run used the equivalent direct Jest command with
`NODE_OPTIONS=--experimental-vm-modules` and the dedicated config; 33 cases
passed, exit 0. The new command uses the existing cross-env dependency to set
the same option. Node's VM warning, if emitted, is expected. This opt-in suite
is separate from default unit/e2e discovery, as is the older fictional 25-case
evaluation. Default CI success alone is not evidence this command was run.

## Next activation step

Review the seventeen exact answer/alias candidates against the clarified
intake, check existing entries for collisions, and use the normal protected FAQ
workflow for the individually confirmed content. Do not import synthetic IDs
or source-question metadata as unsupported create-DTO fields. Publication is
a distinct step; merging this evaluation does not create or activate entries.
Keep unfinished topics unpublished and verify the actual visitor widget after
approved activation. Preserve source/confirmation metadata in the intake sheet.

These answers do not implement fee calculation, campus clearance, visit approval,
batch scheduling or borrowing. Coordinate any such business-workflow change
with its module owner; do not silently add it to this evaluation or delivery scope.

No full application build or unrelated test campaign was repeated for this
test/fixture-only change. Type checking executes through ts-jest; changed-file
lint and `git diff --check` are the relevant additional local checks. No chatbot
feature-completion or independent module acceptance status is promoted.

The first lint pass found three unsafe enum/string comparisons in the new
evaluation. Those were corrected to the exported outcome enum constants without
changing cases, labels, fixture text or production matching. The focused suite
and changed-file lint were rerun and passed (33/33, zero lint errors); no rule
was disabled to conceal the errors.
