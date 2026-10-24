# BioSphere completion handoff - 2026-10-24

This is the remaining owner-scope work queue, not a new test plan, approval to
change shared data, or whole-project completion percentage. The acceptance
register and defect log remain authoritative. Reading this handoff promotes no
status and does not authorize migrations, account changes or teammate-owned work.

## Current checkpoint

- FAQ equal-score clarification/selection feature completed on backend `bafe427`
  and frontend `83ff93b`: FAQ HTTP 23/23, backend unit 690/690, frontend 378/378,
  lint/type-check and isolated real-widget checks passed. No live FAQ activation
  or browser ask forwarded. Review paired branches; deploy backend API first.
  Context, evaluated near-ties and unanswered review remain subsequent slices.
- P1 **DEF-022** merged in frontend #80; backend #185 documentation also merged.
  Both post-merge CI runs passed. Approved frontend production rebuild and
  blocked-save/retry verification passed on `9ea97c7`; backend was untouched.
  Owner checks complete; Ready for retest for independent acceptance and
  separate live-success limits. See the [merged checkpoint](./SPECIMEN_MEDIA_GUIDE.md#merged-metadata-repair-verification---2026-10-24).
- Move from the repeated owner-test loop to the [FAQ assistant next-step plan](./FAQ_ASSISTANT_NEXT_STEPS.md).
  This does not erase remaining release/sign-off gates or approve new policy.
- Frontend #78 and backend #181/#182 merged; their post-merge CI passed.
- Consolidated automated run: backend unit 690/690, isolated HTTP 337/337,
  frontend 366/366. The live Developer suite was explicitly excluded.
- The merged frontend was rebuilt and restarted on port 3000; backend 3001 was
  deliberately left alone. Both browser roles were preserved.
- DEF-020 owner browser failure/retry retest passed on the refreshed build.
  Independent acceptance and complete stale-response coverage remain pending.
- DEF-018 is Verified for its running Swagger declaration mismatch only.
- These results do not replace live provider/database evidence or teammate sign-off.

## Remaining work, grouped by completion gate

| Gate | Owner / coordination | Evidence needed to finish |
| --- | --- | --- |
| P1 CSV recovery: CAT-013 / DEF-021 | Independent reviewer, with Kyer supplying evidence | Frontend #79/backend #184 merged and CI passed; approved local production rebuild and two blocked-request retests passed on frontend `bf4e325`. Owner tests and deployment verification are complete. Obtain independent acceptance; do not repeat owner checks as if untested or infer real commit/concurrency proof. |
| P1 collection integrity: CAT-001 / DEF-001 | Kyer/backend; database/deployment owner | Confirm actual normalized-uniqueness/index deployment, then approved isolated concurrent collision/data/audit checks. UI collision reports alone are insufficient. No migration is authorized here. |
| P1 browser behavior: CAT-014/015, DEF-020/003 | Kyer plus independent teammate / second-device tester | Teammate repeats the merged no-save duplicate failure/retry checklist; cover stale in-flight ordering separately. On an actual LAN client check selection, close, another row, direct details, reload and Back/Forward. Local browser checks do not substitute for LAN/touch evidence. |
| P1 diagnostic isolation: OFF-003 / DEF-019 | Kyer/test isolation; deployment owner for disposable target | Approve a disposable full-stack target and independently establish containment before repeating interruption tests. Keep the shared-backend pilot disabled and its retained evidence intact. Credential-free canary non-reproduction did not close this defect. |
| FAQ and duplicate business rules | Team/curator confirmation; Kyer implementation | The retained eight-decisions handoff already sets FAQ ambiguity/context/unanswered-review working directions; use the reconciled next-step plan rather than asking again. Algorithm/thresholds, language/context design, log retention, duplicate-question policy and isolated activation setup remain open. Archived specimen duplicate-match policy is separate. Do not activate arbitrary shared test answers. |
| Cross-module and live provider coverage | Kyer with John/Voltaire as appropriate | John supplies/approves Inventory/storage fixtures and placement evidence; Kyer tests Cataloging/Storage boundaries only. Complete the specified media role/wrong-pair/failure/accessibility and full restoration branches in an authorized setup. Isolated HTTP tests are supporting evidence, not provider/concurrency proof. |
| Audit/backup and final acceptance | Kyer, relevant test owners, deployment owner, independent reviewer | Resolve OBS-001 disposition, remaining audit access/failure/correlation cases and populated backup-history evidence. Fix/review fixture gaps without suppressing audit errors. Real backup/restore stays Deferred until procedure, storage/retention and disposable restore environment are approved. Record independent module sign-off. |

The table groups tasks; it is not six remaining individual tests or a claim that
every item is blocked. Safe scoped UI/negative checks and owner test-fixture work
may continue while other gates await decisions. Test only the missing subcase.

## Safe work versus approval gates

- Safe to plan next: independent no-save DEF-020 retest, second-device LAN
  checklist, remaining non-mutating UI/accessibility checks, and review of
  Kyer-owned Audit/Backup mock/readback regressions (DEF-015/016).
- Coordinate, do not absorb: DEF-017 belongs to John's Inventory fixture;
  dashboard duplicate visibility and OBS-002 polling behavior go to John/Charles,
  with Voltaire involved for shared authorization/security-audit contracts.
- Approval/environment required: database migration/concurrency writes, true
  session-expiry/inactive-account changes, live storage-failure injection, full
  offline interruption, FAQ activation and real backup/restore. Do not extract
  signed-in session tokens or add production API routes merely to test them.
- Retest remaining minor UI defects only against their exact checklists; do not
  mark them Verified because a related happy path passed. DEF-011 has pending
  performance/disposition evidence; no arbitrary response-time target is approved.

## Team messages ready to send

**Independent reviewer:** Please review the merged frontend DEF-020 fix using
the no-save duplicate checklist. Record commit/build, result and any remaining
stale-response gap. We also need an actual second-device LAN check for DEF-003;
local selection already has evidence. Please do not submit test specimen forms.

**John / Voltaire:** Please review DEF-017's missing security-audit fixture
adapter while preserving the real 403 guard and checking denial persistence.
John, coordinate the Inventory-owned storage/lot acceptance evidence with Kyer;
this handoff does not ask Kyer to implement Inventory behavior.

**Team / curator:** Please review only unresolved FAQ algorithm/threshold,
language/context and log-retention details, FAQ duplicate-question policy and
an isolated activation setup. Ambiguity/context/unanswered-review working
directions are already in the retained eight-decisions handoff. Archived
specimens' duplicate-match policy is separate; code behavior is not approval.

**Deployment owner:** Please confirm normalized collection-index deployment
and a safe database/concurrency verification procedure. Real backup/restore and
the blocked offline interruption test need approved disposable environments;
do not run them against the shared museum database.

## Finish line

Stop repeating already-passing owner happy paths. Re-run regression suites when
relevant code/dependencies change or for the agreed release checkpoint, not for
each documentation-only update. A module is accepted only when its critical and
major cases pass, security/data-integrity blockers are resolved, relevant failure
and retry checks pass, deferrals are explicitly accepted, and its owner plus an
independent teammate record sign-off. A green CI run alone is not acceptance.

Sources: [acceptance register and criteria](./ACCEPTANCE_TEST_PLAN.md),
[current defect dispositions](./TEST_DEFECT_LOG.md),
[duplicate policy limits](./SPECIMEN_DUPLICATES_GUIDE.md),
[FAQ lifecycle boundary](./FAQ_KNOWLEDGE_GUIDE.md),
[backup/deployment boundary](./BACKUP_HISTORY_GUIDE.md).
