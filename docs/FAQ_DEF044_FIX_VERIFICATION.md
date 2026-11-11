# DEF-044 referral repair — 2026-11-12

Implementation follow-up to the documentation-only [PR #308](https://github.com/OppenJayme/biosphere-backend/pull/308).
Based on develop `c10bb1bf38138ad3923f6fb51b9cf2aec3d03bce`. That PR and its
historical DCISM observations are not modified by this repair.

## Behavior and scope

For `Can our group of 60 visitors book one tour batch?`, the real matcher returns
the approved batch-size answer. Previously the independent transaction detector
then attached `VISIT_REQUEST` and generic booking instructions. A focused service
test reproduced both wrong fields before implementation (one failing test).

The direct-match branch now recognizes the explicit stored-answer rule
`For groups larger than N, send a General Inquiry`. It compares N with a numeric
party size in the current question (`group/party of N` or `N visitors/people/
students/guests/participants`). Above the stated limit, it returns
`GENERAL_INQUIRY`, preserves the stored answer and omits the conflicting generic
message. At or below the limit, regular booking retains `VISIT_REQUEST`.
Existing request changes/cancellation retain `GENERAL_INQUIRY`.

No production FAQ ID or numerical batch limit is hardcoded. Neither the prior
chat history nor generated AI text supplies this exception. There is no database
schema/knowledge edit, matcher threshold change, form change or Gemini change.
The API response shape is unchanged, so the existing widget uses the corrected
redirect without frontend changes.

## Verification

Local runtime: Node 24.7.0, TypeScript 5.9.3, installed Prisma generator 7.10.0.
This local dependency installation is not a fresh lockfile install; CI must
verify the committed lockfile environment separately.

- `node node_modules/jest/bin/jest.js --runInBand src/faq`: **98 passed**, seven suites.
- `node node_modules/jest/bin/jest.js --config test/jest-e2e.json --runInBand faq.e2e-spec.ts faq-answer-scope.e2e-spec.ts`: **50 passed**, two suites.
- Changed-file ESLint: zero errors, one existing unused-disable warning in `test/faq.e2e-spec.ts`.
- Application type-check (`tsc --project tsconfig.build.json --noEmit --incremental false`): passed.
- `git diff --check`: passed.

The new service regressions cover the original question, 25/50 versus 51/60,
explicit FAQ selection, another FAQ ID and a different approved limit, dates and
prior-history sizes, absence of an explicit approved referral, and existing
request cancellation/rescheduling/modification. HTTP checks use the real Nest
controller/service/matcher, the full synthetic curator FAQ fixture plus an
explicit synthetic approved change/cancel entry, and mocked database/auth
adapters. The external AI provider is explicitly unconfigured in the HTTP
fixture regardless of workstation flags; the real composer remains wired.
They verify referrals, preserved answer text and no knowledge/audit
mutations. No shared data or real AI calls are used.

Initial HTTP fixture assumptions expected unmatched cancellation/modification;
the full FAQ set instead produced matched answers. The fixture was corrected to
provide explicit change/cancel knowledge and assert its stored answer and
General Inquiry action. Matching behavior was not altered to satisfy the tests.

Full lint initially found many stale-generated-Prisma errors after the latest
pull. Local `prisma generate` completed without migration/database operations.
Afterwards, `npm run lint:ci` still reports one error in unchanged
`src/specimens/specimen-import.service.ts:542` (`no-unsafe-return`) and six
unused-disable warnings. Full non-emitting type-check still reports the
unchanged `test/source-inventory-connection.db-spec.ts:224` use of
`RequestOptions.rejectUnauthorized`. Both files were checked unchanged against
the develop base; neither is repaired in this scoped PR. Full lint/type-check
must not be reported green from this execution.

## Remaining limits and deployment retest

This is a bounded English/digit rule for the current approved referral wording,
not general semantic, multilingual or spelled-out-number interpretation. If
curators change that rule's wording, rerun routing checks. Missing/unmatched or
AI-only knowledge does not gain a new referral from this helper.

The fix has not been deployed. DEF-044 remains pending review and deployed
retest: ask the original question and verify the General Inquiry link to
`/inquiry`, absence of the generic booking message for that reply, and unchanged
ordinary booking/change-request actions. Do not submit real visits/inquiries.
This evidence does not constitute full chatbot acceptance.
