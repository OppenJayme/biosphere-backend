# FAQ assistant: next implementation slice - 2026-10-24

Source review checkpoint, not feature acceptance or approval to publish test
answers. Backend reviewed at `a3961d1`; frontend at `9ea97c7`. No chatbot code
or active knowledge was changed and no public ask request was made here.

## Progress update - 2026-10-25

Current content update - 2026-11-02: thirty answers have now been supplied by
the user and transcribed into the [FAQ intake sheet](./FAQ_CONTENT_INTAKE_2026-11-02.md).
Next is source/date confirmation and the sheet's precise factual clarifications,
then approval/normal entry workflow and bounded visitor acceptance. Do not
re-ask for every fact as if nothing was provided. No public activation, matcher
change, paid service or database write is included in this documentation slice.

**Current direction: laptop-only demo, no new paid services.** Keep optional
question collection disabled; hosted migration/scheduler work is parked pending
its separate approval gates. Backend #190 is merged with successful PR CI.
The approved [synthetic public HTTP quality evaluation and factual-content
review sheet](./FAQ_CONTENT_REVIEW.md) retains the original **23/25** result and
now records a **25/25 passing** repaired evaluation, with 15 ordinary public HTTP
scope regressions. DEF-024 is Ready for retest: bounded English exclusions and
inclusion relationships decline unsupported scope without changing thresholds.
No real FAQ facts were invented or activated. Next: independent repair review,
actual content approval, then local-demo acceptance—not another round of passed
database/Cataloging tests. This is not broad semantic/multilingual accuracy.

Backend #189 is merged. Next-step source review reproduced and repaired
[DEF-023 cleanup argument safety](./TEST_DEFECT_LOG.md#def-023---conflicting-faq-cleanup-modes-perform-deletion):
conflicting apply/dry-run flags previously performed deletion. The disposable
suite now passes 20/20 with strict single-mode validation. Scheduler preparation
remains provider-neutral; no hosting target, live job, shared migration or
collection enablement is inferred from approval to continue local work.

Backend #188/frontend #83 are merged; both PR CI runs passed and fetched source
matched merged develop. The approved [disposable PostgreSQL checkpoint](./FAQ_REVIEW_QUEUE_GUIDE.md#disposable-postgresql-checkpoint---2026-10-25)
now passes 13 real SQL/HTTP/cleanup cases. Migration was applied **only to owned
temporary containers**, not the shared database. Next: deployment/privacy/backup
and monitored-scheduler approval plus independent acceptance; collection stays
disabled. Do not repeat the completed local checks or claim deployment readiness.

Latest slice: [opt-in question review](./FAQ_REVIEW_QUEUE_GUIDE.md) is implemented
with isolated API/UI evidence, **disabled by default**. Shared migration remains
unapplied; only the approved disposable trial ran. No live question collection
or deployed scheduled cleanup was enabled. This explicit
opt-in design supersedes the earlier automatic unanswered logging proposal.
Context changes below are now merged (backend #187/frontend #82). Paired review
is merged; next are the guide's finite deployment/privacy/cleanup gates, not another
round of previously passed Cataloging tests. Duplicate knowledge policy and
measured near-tie/language evaluation remain separate future work.
The older next-step/source-review paragraphs below retain their dated context;
they do not override this newer approved scope or authorize deployment.

The first implementation slice is merged in backend #186/frontend #81 (source
commits `bafe427`/`83ff93b`), not fully accepted. Equal strongest eligible
scores return clarification with up to three choices, and explicit selected
identity returns only a still-active approved answer. Focused HTTP/request and
isolated real-widget checks passed. See [evidence and rollout limits](./FAQ_KNOWLEDGE_GUIDE.md#equal-score-clarification-implementation-checkpoint---2026-10-25).

The second slice is implemented on `feat/faq-bounded-followups`: backend
`4608b9f`, frontend `94293d1`. It carries one ephemeral answered-FAQ topic ID
for explicit `How about` / `What about` follow-ups, rechecks ACTIVE status and
requires approved qualifier/topic evidence. Hint clears on non-answer/error/
reload. HTTP 29/29, backend unit 690/690, frontend 379/379, type-check/lint and
final thirteen-turn synthetic widget checks passed. This is bounded lexical
context, not general conversation or multilingual understanding.
See [contract, evidence and limits](./FAQ_KNOWLEDGE_GUIDE.md#bounded-topic-follow-ups-checkpoint---2026-10-25).

Next: review/merge the paired context changes (backend API before frontend
deployment), then settle unanswered-review retention/access/abuse details and
duplicate knowledge policy before implementing persistence or activation rules.
Do not repeat the passed Cataloging tests. Near-tie evaluation, language/context
design and unanswered-log retention/access controls remain unresolved; no
logging or provider/migration work was bundled into this slice. Historical
2026-10-24 gap descriptions below describe the pre-implementation checkpoint.

## What already exists

- Backend public suggestion/ask routes, bounded question DTO, per-route throttle
  configuration, ACTIVE-only knowledge reads and narrow response projections.
- A deterministic exact/alternative-wording/token/keyword matcher with no LLM,
  embeddings or generated answers. Its current numeric rules are proposals.
- General Inquiry fallback, Visit Request referral and an explicit limitations
  notice. The assistant service does not persist visitor questions; this does
  not establish the behavior of infrastructure/proxy logs.
- A public-layout chat widget with suggestions, pending/error messages, related
  questions, escaped plain-text rendering, referral links and memory-only chat.
- Existing matcher/service/HTTP and frontend request tests. Their existence is
  not FAQ-004 user acceptance or proof of a deployed public workflow.

References: [knowledge guide and approval table](./FAQ_KNOWLEDGE_GUIDE.md),
backend `src/faq/faq-matcher.ts`, `faq-assistant.service.ts`,
`faq-assistant.controller.ts`, `test/faq.e2e-spec.ts`; frontend
`src/components/faq/FaqAssistantWidget.tsx`, `src/features/faq/assistant.ts`.

## Finite next sequence

1. Use Section 7 of the existing eight-decisions handoff, dated 2026-10-05,
   as the agreed working direction. It was found and reviewed at the original
   supplied path outside this repository. Do not request those answers again.
   Working team direction is not proof of institutional approval or implementation.
2. Implement the smallest reconciled gap with agreed test seams and a failing
   regression first: ambiguous matches currently pick a deterministic winner
   instead of asking the visitor to choose up to three approved questions.
   Exact equal-score ambiguity is a bounded starting case; the broader
   near-tie margin still needs evaluation rather than an arbitrary number.
3. Run a bounded isolated FAQ-004 batch: exact/alternative wording, inactive and
   archived exclusion, ambiguous results, no match, inquiry/visit referral,
   rate-limit/network feedback and public projection. Record results and obtain
   independent sign-off; do not restart unrelated Cataloging happy-path tests.

## Existing working answers versus open design details

The retained handoff's Section 7 already specifies approved-knowledge-only
answers; paraphrases and clear topic follow-ups; clarification for similarly
plausible matches; up to three choices; no-match alternatives; and restricted
unanswered-question logging/review. It explicitly leaves algorithm/provider,
thresholds, supported language/context behavior and log retention unresolved.
It proposes no-match wording but does not establish institutional sign-off.

Current gap: the ask DTO accepts only `question`, the matcher has no prior-topic
input, ties select a winner, and the assistant service has no unanswered-log
write/review flow. UI memory-only conversation is not contextual retrieval.
No new database or log mutation is authorized by this source-review document.

| Area | Working direction / suggested implementation baseline | Current difference / remaining choice |
| --- | --- | --- |
| Answer authority | Stored ACTIVE curator-approved answers only; no generated answers | Keeps answers traceable to approved museum knowledge; already implemented. |
| Ambiguous matches | Existing working direction: clarify and show up to three relevant approved choices | Current score ties break by question text/id. Implement bounded tie handling first; evaluate similarly plausible non-ties separately. |
| Confidence thresholds | Evaluate existing thresholds on a small approved question/expected-outcome set before changing numbers | Current 0.6/0.3 thresholds are proposals, not measured confidence probabilities. A near-tie margin needs evaluation, not an invented number. |
| Duplicate knowledge | Warn while drafting; prevent conflicting ACTIVE normalized questions/aliases unless curated into a single unambiguous entry | Avoid contradictory public answers while allowing inactive drafts. Exact normalization/collision scope and concurrency enforcement require design approval before implementation. |
| Context / paraphrases | Existing working direction: approved alternatives/keywords first; use clear current topic for follow-ups, otherwise clarify | Current stateless DTO/matcher cannot use conversation context. Evaluate supported languages and method before introducing semantic services. |
| Unanswered review | Existing working direction: log unmatched question/time for curator review; never auto-publish or promise a direct reply | Logging/review not implemented. Resolve retention, restricted access, personal-data handling and abuse controls before persistence. Do not claim a question was recorded unless saving succeeds. |
| No match / unsupported request | Existing working direction: limitation plus rephrasing, FAQ browsing or General Inquiry; distinguish service failure | Current no-match text offers only General Inquiry; proposed wording and browse destination need reconciliation with the UI. Never invent identification. |
| Visit transactions | Referral only; no approval, booking or campus-entry promises | Preserve teammate-owned Visit Request workflow; verify approved destination and wording. |
| Evaluation environment | Synthetic knowledge in isolated adapters/disposable environment, with UI responses intercepted where appropriate | Do not activate arbitrary test answers on the shared public knowledge base. Mocked tests remain separate from live acceptance. |

This document records the earlier working answers; it does not supply missing
numeric thresholds, duplicate policy, log retention or institutional approval.
Do not introduce a database migration, external AI service, visitor logging,
credentials export or public knowledge activation as an incidental testing step.
Security/performance/deployment checks remain explicit release tasks, not
grounds for claiming the whole project complete.

## Stopping point for the current testing round

DEF-022 merged-build owner verification is complete. Remaining independent,
second-device, database/provider and teammate-owned gates stay in
[COMPLETION_HANDOFF.md](./COMPLETION_HANDOFF.md). They may proceed alongside
approved FAQ work; they do not justify endlessly repeating passed owner tests.
