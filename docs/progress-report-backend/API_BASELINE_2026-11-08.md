# Merged-develop API baseline — 2026-11-08

## Scope and outcome

Tested source: `ec228587c9154f4ed13568b18b4d7ed7cab66a68` (merged develop),
followed by the allocator/harness changes in this PR. Pending #265 is excluded.
This is an integration baseline, not a module-completion percentage or release
approval. Existing historical progress reports are retained unchanged.

The initial run recorded **789 observations: 779 passed, 10 failed** despite
Jest reporting 26 passing test blocks and exit code zero. The harness collected
failed observations without asserting them. It now exits unsuccessfully after
writing its report and cleaning up whenever recorded observations fail or none
were recorded. The command is `npm run test:progress-api:db`; the VM-modules
flag is required for the current generated Prisma client.

The post-fix full rerun recorded **790 observations: 783 passed, 7 failed**.
All 26 scenario blocks completed, but the suite correctly exited **1** for the
seven remaining observations listed below. Sequential generated creation passed;
offline sync and same-ID retry both returned 200, leaving exactly one specimen
for that draft. The 11 allocator unit tests, focused HTTP regression, TypeScript
build check and scoped lint also passed. This is a repaired product path with
an explicitly incomplete overall baseline, not an all-green release check.

The completed fixture follow-up recorded **791 observations: 787 passed and
4 unresolved**, all four with no executed response (`actualStatus: null`).
All 27 scenario blocks passed, but the suite correctly exited **1** for those
four unexecuted requirement observations. No executed observation failed.
Onboarding returned 200, valid-input/no-JWT rejection 401, chosen-password login
201 and AR activation 200. Mail stayed captured (15 messages), no blocked
outbound requests were recorded, no token-shaped strings were found in the
committed report, and independent cleanup readback found no owned test container.
This is not whole-module or real-provider acceptance.

The latest sync-alert integration run recorded **797 observations: 794 passed
and 3 unexecuted requirement observations unresolved**. All 28 scenario blocks
passed; the overall exit remains **1** for the three unexecuted requirements.
No executed observation failed. `NOTIF-SYNC-FAILED` now has real HTTP evidence,
including curator isolation and resolution after corrected same-ID sync.

Evidence:

- [Initial recorded observations](./api-test-results-2026-11-08.json)
- [Final integrated recorded observations](./api-test-results-2026-11-08-final.json)
- [Intermediate allocator report in immutable history](https://github.com/OppenJayme/biosphere-backend/blob/5177746feef3dedc5af16fb305daca2bb1f49bf9/docs/progress-report-backend/api-test-results-2026-11-08-fixed.json)
- [Intermediate Auth/Storage report in immutable history](https://github.com/OppenJayme/biosphere-backend/blob/5177746feef3dedc5af16fb305daca2bb1f49bf9/docs/progress-report-backend/api-test-results-2026-11-08-fixtures.json)
- [Compact sync-alert follow-up evidence](./api-sync-alert-followup-2026-11-08.json)
- [Static route inventory](./route-inventory-2026-11-08.json)

The first invocation omitted the VM-modules flag and stopped during setup;
it completed no API cases and is excluded from the application results.

### Review follow-up: regression prevention and report size

The focused [real-Prisma allocator regression](../ACCESSION_NUMBER_GUIDE.md#ci-regression-for-automatic-allocation-def-042)
is now part of the existing Linux Docker CI job. In an owned fixture, removing
the explicit position cast reproduced `0001` on the second allocation; restoring
it passed the test. This closes the mocked-unit-test blind spot for this specific
bug without adding the full progress harness to CI. Linux execution on the new
head must still be verified independently from the local Windows result.

Only initial and final raw snapshots remain in the current tree; intermediate
reports are linked above at their existing commit. No historic result is changed.
The optional exit-code redesign is deferred: the complete-baseline command still
fails conservatively for unresolved requirements, with executed failures and
unexecuted gaps distinguished in the documented/compact result. The three open
acceptance requirements remain open. Post-deployment retry instructions are
prepared in the guide, not executed against any shared environment.

## Reproduced product defect: generated accession reuse

After the first generated accession `USC-BM-2026-0001`, a second creation
without a supplied accession returned 409. Offline synchronization without an
accession also returned 409, so its retry created no specimen. This was not a
deliberately duplicated input. The allocator's parameterized `substring` could
resolve to PostgreSQL's regular-expression overload, returning null instead of
the numerical suffix and repeatedly allocating `0001`.

The fix explicitly casts the substring position to `int`. The existing public
HTTP creation workflow now checks that two successive omitted-accession
requests receive `0001` and `0002`. It failed with HTTP 409 before the fix and
passed after it against fresh PostgreSQL with real Nest/Prisma. No migration,
shared-data correction or historical accession rewrite is required.

## Auth and Storage fixture follow-up

The onboarding requests now provide the password required by the current DTO,
including the no-JWT request so its result isolates authentication rather than
invalid input. The fake Auth admin update now applies the chosen synthetic
password; a real application login with that password verifies the outward
contract. It returned 401 with the old fake and succeeds after the repair.
An initial test assertion expected login HTTP 200; it was corrected to the
existing controller's POST status 201, without changing the controller.

Fake Storage now retains uploaded binary content rather than only byte counts
and serves those bytes for object downloads, with 404 for an absent object.
AR activation therefore reaches the real stored-model validator. No business
validation is disabled and no arbitrary valid model is substituted on reads.
The Auth/Storage fake remains a test adapter, not Supabase authentication,
cryptography, Storage RLS or provider-availability acceptance.

The first combined follow-up hit the intended five-logins/minute limit on the
new chosen-password check (HTTP 429). Its real application rate limit was not
changed or bypassed. That check now runs after the suite's other paced workflows,
when the initial login window has expired. The throttled diagnostic is not a
passing full-baseline result; the completed rerun is recorded separately.

At the Auth/Storage fixture checkpoint, four unexecuted requirement observations
remained distinct from HTTP failures:
Curator activation versus the current Developer handover decision, unexercised
password-management routes, operational sync-notification evidence and deployed
backup/restore acceptance. They must not be relabelled successful merely
because the three fixture failures are repaired. Their historical raw-note
claims are interpreted using the dispositions below, not as proof of absent
current features.

The harness notes for those four observations were corrected to explicitly say
"Not executed" and describe the current feature/evidence boundary. The later
sync-alert scenario below supplies actual evidence for one of them. The other
three still fail the overall baseline until their required evidence/disposition
is supplied; no requirement is passed merely because a route exists.

## Initial failures and disposition

**Sync-notification follow-up:** seven focused real HTTP/PostgreSQL observations
passed. The scenario creates an owned synthetic accession holder, rejects a
conflicting offline draft, checks the owner's alert and the other curator's
unchanged operational count/feed, then synchronizes corrected content with the
same draft ID. The alert disappears and the owner's operational count decreases
by exactly one, preserving other operational alerts. All setup and assertions
use public application HTTP routes; authentication/provider services remain
synthetic. No production business logic changed.

The first focused invocation stopped during setup because the Docker
Linux-engine pipe was unavailable; zero API observations ran. After the user
started Docker, the focused scenario passed and its owned container was
independently verified absent. The setup failure and the earlier TypeScript
matcher correction are not product defects or passing application evidence.
This covers the specific alert lifecycle in an owned fixture, not the browser,
real session expiry, live provider behavior, arbitrary concurrent mutations or
independent notification-module acceptance.

The completed integrated run also passed all seven sync-alert observations,
with 15 captured synthetic emails, no blocked outbound requests and no owned
progress-API container left after independent cleanup readback. The committed
compact summary retains both run totals, all seven integrated observations,
the three remaining unresolved observations, exact local source-byte hashes
(including line endings) and the full report's SHA-256. The initial and final
full raw reports are retained in the current tree; the two duplicate intermediate
snapshots remain linked from immutable Git history rather than repeated here.
The final raw JSON is also retained locally as ignored
`.sync-alert-full-result.log`. The compact summary is not presented as a complete
per-observation raw export. Remaining gaps: account-handover/SRS reconciliation, password API/audit
coverage in this harness, and intended-source/deployed backup acceptance.

| Observation           | Finding                                                                                                                                                            | Follow-up / owner                                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| AUTH-ONBOARD-COMPLETE | Fixture omits the password now required by the DTO; HTTP 400 is input rejection.                                                                                   | Auth owner: update the fixture and verify completion/audit.                                                                            |
| AUTH-ONBOARD-NOJWT    | Missing password causes validation to reject before this method's session check.                                                                                   | Auth owner: send valid input to isolate missing-JWT behavior.                                                                          |
| ACCT-CURATOR-ACTIVATE | No request executed; hardcoded legacy requirement failure. Nov 7 decisions assign handover/status controls to Developer.                                           | Auth owner: reconcile SRS/decision evidence and test Developer handover; do not add obsolete Curator controls.                         |
| ACCT-CHANGE-PASSWORD  | No request executed; hardcoded claim of absent routes is stale. Password change/recovery/reset routes exist in this source.                                        | Auth owner: replace the claim with executed route/audit checks. Source existence alone is not acceptance.                              |
| SPC-CREATE            | HTTP 201 and correct Uncataloged/private state; stale assertion expected a null accession.                                                                         | Updated to the approved generated-accession behavior in this PR.                                                                       |
| DEV-AR-ACTIVATE       | HTTP 500 while downloading from fake Storage; the fake implements uploads/signing but not object downloads and retains byte counts rather than bytes.              | Developer/AR owner: supply a valid model and faithful download fixture, then retest before deciding whether a product defect remains.  |
| NOTIF-SYNC-FAILED     | No request executed; hardcoded claim that operational notifications do not exist is stale. Current feed/entity includes SYNC_FAILED.                               | Notification owner: exercise a synthetic sync failure and feed readback.                                                               |
| OFF-SYNC              | Real generated-accession collision; HTTP 409.                                                                                                                      | Allocator fix and full-harness retest in this PR.                                                                                      |
| OFF-SYNC-RETRY        | Same collision; zero records after retry.                                                                                                                          | Verify one successful synchronization plus idempotent retry after the allocator fix.                                                   |
| BAK-RUN-RESTORE       | No request executed; absence of a public restore POST is intentional. Standalone synthetic recovery exists, but intended-source production recovery remains gated. | Backup owner: track operational/custody and recovery acceptance separately; do not mark SRS backup/restore complete from this API run. |

An observation without an HTTP status is not an executed endpoint failure.
These classifications do not turn unexecuted or inadequate checks into passes.

## Coverage gaps and limits

Static TypeScript-decorator inspection found **145 declared routes versus 140
listed in the harness matrix**, with no stale listed routes or detected access
classification differences. The inventory is static, not a runtime route probe.
Unlisted in this harness:

- `POST /auth/password/change`
- `POST /auth/password/recovery`
- `POST /auth/password/reset`
- `POST /developer/curators/handover`
- `GET /storage-locations/arrangement-rules`

Unlisted here does not mean untested by dedicated suites. Reconcile those suites
before claiming complete route coverage.

The run used a fresh owned PostgreSQL container, actual application migrations,
real Nest controllers/guards/services, and synthetic accounts. Supabase
Auth/Storage was a loopback fake; mail was captured in memory. The completed
initial run captured 15 synthetic emails and recorded no blocked outbound
requests. No hosted database, real email, existing server or signed-in browser
was changed. Both completed full runs captured 15 synthetic emails with no
blocked outbound requests. Disposal was independently checked after both full
runs; no matching owned test containers remained.

Node was 24.7.0 locally; CI uses Node 22. A pg warning about overlapping
`client.query()` calls was observed; its originating call site was not traced.
Do not interpret this warning alone as a production defect. This run does not
prove provider behavior, browser acceptance, deployed migrations, production
recovery, or every concurrency path.
