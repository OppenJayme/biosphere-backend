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

Evidence:

- [Initial recorded observations](./api-test-results-2026-11-08.json)
- [Post-fix recorded observations](./api-test-results-2026-11-08-fixed.json)
- [Auth/Storage fixture follow-up](./api-test-results-2026-11-08-fixtures.json)
- [Static route inventory](./route-inventory-2026-11-08.json)

The first invocation omitted the VM-modules flag and stopped during setup;
it completed no API cases and is excluded from the application results.

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

The four unexecuted requirement observations remain distinct from HTTP failures:
Curator activation versus the current Developer handover decision, unexercised
password-management routes, operational sync-notification evidence and deployed
backup/restore acceptance. They must not be relabelled successful merely
because the three fixture failures are repaired. Their historical raw-note
claims are interpreted using the dispositions below, not as proof of absent
current features.

The final harness notes for those four observations now explicitly say
"Not executed" and describe the current feature/evidence boundary. They still
fail the overall baseline until their required evidence/disposition is supplied;
they are not silently skipped or promoted by checking whether a route exists.

## Initial failures and disposition

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
