# FAQ content and answer-quality review — 2026-10-25

## Operating decision

2026-11-02 content follow-up: [intake #224](https://github.com/OppenJayme/biosphere-backend/pull/224)
records the user's responses to thirty questions and later clarifications,
including incomplete and unanswered items. An isolated
[curator-content evaluation](./FAQ_CURATOR_CONTENT_EVALUATION_2026-11-02.md)
now passes 33/33 working cases using seventeen draft answer candidates, without
changing matching rules or activating shared entries. The older fictional
25-case set below retains its own scope; neither result is a visitor-study
accuracy score or independent approval of the proposed public wording.

Use the existing laptop-only demo setup. Do not create hosting accounts, paid AI
services, scheduled jobs or shared database migrations for this slice. Keep the
optional question-review collection disabled. Existing service plans/limits are
unchanged; this is not a guarantee that every existing service has unlimited
free usage. The current assistant uses stored answers and deterministic matching,
not a newly introduced paid inference provider.

## DEF-024 repair checkpoint

The user approved proceeding with conservative abstention. The unchanged
25-case evaluation now passes **25/25** (exit 0), including E19/E20. The original
23/25 diagnostic below is retained as pre-fix evidence, not the current result.
Fifteen ordinary CI-discovered public HTTP regressions cover the reproductions,
different wording, positive approved inclusion answers, direction reversal,
keyword-only evidence, cross-alias scope and ordinary factual negation.
Both original failures were observed red before implementing their repairs.

Broader repair verification: **690/690** unit tests and **376/376** isolated
HTTP tests pass (live Developer suite excluded). Type-check and diff checks pass;
lint has zero errors and the same seven pre-existing unused-disable warnings.
The full HTTP run still emits existing missing-audit-adapter errors (the class
tracked in DEF-017); those green tests do not establish denial-audit persistence.
No unrelated test fixture was repaired or its status promoted in this slice.

The matcher now filters scope before ranking, without changing numerical
thresholds. Exact approved question/alias wording remains authoritative for its
candidate; explicit selected-ID handling is unchanged. Non-exact English
`not asking about/for`, `not interested in`, and `do not/don't/did not/didn't mean`
forms conservatively decline instead of guessing which clause to answer.
This may reject an otherwise answerable compound question; ask a direct question
or choose an approved FAQ rather than infer clause intent.

For `include/includes`, `cover/covers`, `included in` and `covered by`, all
meaningful source and target tokens must occur in the same roles in ONE approved
question or alias. Keywords cannot authorize a relationship or join evidence
across aliases. Unknown or empty relationship scope declines. This is a bounded
lexical safeguard, not general semantic, multilingual, negation or conditional
understanding. Other wording still uses the existing matcher; curator review of
aliases and independent acceptance remain necessary.

DEF-024 is **Ready for retest**, not independently verified or full chatbot
acceptance. No museum facts, shared database, activation, new paid service or
collection setting changed. Next: independent review/retest and real factual
content approval, not another unrelated regression campaign.

## Original synthetic HTTP evaluation (pre-fix)

Baseline: merged backend `bfd5d01`; branch `test/faq-answer-quality-evaluation`.
The user approved real public HTTP evaluation with a fixed synthetic knowledge
set and isolated database adapter, without threshold changes or FAQ activation.

Run explicitly:

```powershell
npm run evaluate:faq
```

**Result: 23 passed, 2 mismatched, 25 cases. The command exits 1.** This is a
diagnostic result, not a passing acceptance gate or an overall accuracy estimate.
It is separate from default unit/e2e discovery; ordinary CI success must not be
presented as passing this evaluation. No failing case is skipped, marked as
expected-failing or relabelled to make the report green.

Existing isolated FAQ HTTP regressions remain **41/41 passing**. Type check
passed; lint has no errors and seven pre-existing unused-disable warnings.
These green infrastructure checks do not cancel the two quality mismatches.

Eight fictional entries cover fees, weekday/weekend hours, general/flash
photography, visit referral, inactive holiday information and archived parking.
Every answer is labelled TEST ONLY. Labels were fixed before the mixed-topic run;
expected identities/outcomes are human-authored, not generated from matcher
scores. This small visible development set is **not** an unseen representative
benchmark, institutional approval, multilingual study or near-tie calibration.

The 23 passing cases include exact/alternative wording, basic punctuation and
case variation, a short paraphrase, clarification, explicit selection, flash
restriction, inactive/archived exclusion, supported/stale context, unrelated
requests, unsupported follow-up and visit referral. Response checks also require
stored answer identity/text, narrow public fields and active related choices.

| Case | Synthetic question | Working expected result | Actual |
| --- | --- | --- | --- |
| E19 | I am not asking about admission fees; where can I park? | NO_MATCH / General Inquiry: fees are explicitly excluded and there is no active parking answer | ANSWERED with the fee entry |
| E20 | Do admission fees include parking? | NO_MATCH / General Inquiry: the fee answer says nothing about parking inclusion | ANSWERED with the fee entry |

Both return the stored sentence “TEST ONLY: Admission is five fictional
credits.” The text is not generated, but it still fails to answer the question.
Tracked together as [DEF-024](./TEST_DEFECT_LOG.md#def-024---faq-matcher-answers-parking-questions-with-unrelated-fee-information).
These are working quality labels; E20's preferred handling of partially covered
questions should be reviewed with the team before an algorithm change. E19's
explicit rejection of the fee topic is the clearest false-positive reproduction.

The real controller, DTO validation, public/auth/role/throttle guards, assistant
service and matcher execute on loopback. Only external database/auth adapters
are synthetic. No AppModule/dotenv initialization, real database, provider login,
ordinary visitor query collection, browser credentials or public FAQ activation
is used. This does not prove actual database/provider/browser behavior.

### Original repair recommendation (superseded by checkpoint above)

Review abstention for excluded topics and unsupported qualifiers before changing
ranking. Keep E19/E20 as visible counterexamples; do not simply raise a global
threshold, add the exact test sentence as an alias, or claim a broad language
understanding fix from a phrase-specific patch. Any approved repair should keep
the 23 passing behaviors and add genuinely different held-out counterexamples.
Then promote the agreed fixed behavior into ordinary HTTP regression coverage.
The original evaluation-only commit deliberately changed no runtime matcher,
thresholds or supported-language promises. The repair above changes bounded
scope eligibility, not thresholds or a supported-language promise.

## Real museum content review sheet

This is a proposed review inventory, **not approved museum information**. Real
answers and authoritative sources were not supplied in this task. Leave them
unapproved rather than substituting synthetic facts. This does not reopen the
already-answered eight business-rule decisions; it requests factual content and
its provenance only.

The curator/content owner confirms museum facts and exceptions; engineering
owns reproducible matching, safe fallback and transport behavior. Those are
different approvals—writing a test does not make a fictional answer authoritative.

| Topic | Facts and exceptions to confirm | Answer/source/reviewer status |
| --- | --- | --- |
| Weekday access | Days, opening/closing times, term or appointment restrictions | Not supplied / not approved |
| Weekend and holiday access | Separate availability, closures and exceptions | Not supplied / not approved |
| Admission | Actual fee policy, exemptions and what fees include; do not infer parking/payment details | Not supplied / not approved |
| Location and arrival | Approved public directions, campus-entry requirements and parking guidance | Not supplied / not approved |
| Group visits | Correct request destination, required lead time and explicit separation from approval | Not supplied / not approved |
| Photography | General permission, flash restrictions and special exceptions | Not supplied / not approved |
| Accessibility | Verified facilities, limitations and assistance/contact route | Not supplied / not approved |
| General contact | Current public inquiry destination and safe referral wording | Not supplied / not approved |

For each approved entry record: exact answer, authoritative source/link or
approval reference, content owner/reviewer, approval date, relevant exceptions,
approved aliases/keywords and a next-review trigger/date. Check aliases for
cross-topic collisions. Keep unknown/draft entries INACTIVE; use the separate
explicit curator activation workflow only after real review. No entry was
created, edited or activated by preparing this sheet.

## Finite local-demo finish line

1. Independently review/retest the DEF-024 repair and conservative abstention
   policy; do not repeat unrelated Cataloging tests.
2. Supply/review the actual FAQ facts above and independently approve any public
   entries. Existing code tests do not replace that content approval.
3. Independently check the actual visitor flow with approved content before
   signing off the local demo. Leave hosted review collection disabled until its
   separate deployment/privacy/backup/scheduler gates are satisfied.
