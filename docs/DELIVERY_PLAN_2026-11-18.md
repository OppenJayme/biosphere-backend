# Delivery plan: November 18, 2026

Working completion target: **November 18**. Defense starts **November 23**.
Reserve November 19-22 for rehearsal, recovery practice and urgent corrections.
This is a delivery plan, not a claim of whole-project completion or permission
to change shared data. Dates use the team's Asia/Singapore calendar.

## Work policy for the remaining window

- Prioritize required SRS/approved-decision gaps, security/data integrity,
  blocked workflows and the exact remaining acceptance cases.
- Keep optional refactors, additional AI features, hosted FAQ question
  collection and other backlog enhancements separate unless an owner shows
  they are required for the agreed delivery scope.
- Work in module-sized batches. Run focused checks for relevant changes and
  the existing required CI; do not replay passing owner suites for each doc edit.
- Use one pinned release candidate for the coordinated acceptance round.
  Record its source/build, environment, scope, result and owner/reviewer.
- Missing approval, data or tooling has a named dependency. It is not a Pass,
  and it does not justify inventing museum facts or silently dropping SRS scope.

## Milestones

| Window | Deliverable | Exit condition |
| --- | --- | --- |
| Oct 29-Nov 2 | Confirm the finite remaining list with each module owner; repair blocking fixture/workflow gaps; request missing approvals | Each required gap has an owner, next action and target. Distinguish code missing from evidence missing. No already-completed batch is reopened. |
| Nov 3-8 | Finish required implementation gaps and grouped module acceptance; incorporate approved FAQ/public content when supplied | Critical/major workflows have evidence; unresolved dependencies are escalated to the coordinator with an explicit scope decision rather than hidden. |
| Nov 9-13 | Integrate a pinned release candidate and run one coordinated end-to-end/demo pass | Roles, core workflows, failure/retry paths and module boundaries work together. Remaining defects have severity and owners. |
| Nov 14-18 | Fix remaining delivery blockers, complete bounded retests, freeze the demo and evidence | Completion checklist below is met; owners sign for their stated scope. No optional feature starts. |
| Nov 19-22 | Rehearse defense and recovery on the frozen demo | Repeatable startup, approved accounts/content and clear presentation of capabilities/limits. Any emergency change receives its relevant regression check. |

These are planning targets. Institutional approval, scope exceptions and other
people's availability must be confirmed; this file does not assign approval
to someone who has not given it.

## Immediate work queue

| Priority | Work | Owner / dependency | Finish condition |
| --- | --- | --- | --- |
| 1 | DEF-017 denial-audit fixture gap | John owns Inventory; Kyer assists test-only repair, coordinate auth contract with Voltaire | The existing isolated Developer request remains 403 and the real audit API exposes the expected synthetic denial. Full affected HTTP fixture passes without missing-delegate errors. No Inventory production changes or live writes. |
| 2 | FAQ content and bounded visitor acceptance | Kyer; facts approved by Sir Curator/content owner; independent reviewer to confirm availability | Obtain authoritative answers/sources, activate only approved entries through the normal workflow, then verify the agreed answer/clarification/fallback/follow-up scope. Existing synthetic tests are not factual approval. Request answers by Nov 5 as a planning target, subject to the approver's availability. |
| 3 | Cataloging/Storage grouped closeout | Kyer; John supplies Inventory-owned lot/placement evidence | Execute only the missing cases listed in the acceptance register/handoff. Reconcile policy questions against the retained approved decisions first. Do not absorb Inventory implementation or repeat passed owner happy paths. |
| 4 | Limited offline disposition | Kyer and independent reviewer | Preserve the passing owned SQL/HTTP and lost-response recovery evidence. DEF-019's shared-backend pilot stays stopped. Identify any actually missing required case or obtain an explicit scope decision; do not repeat unsafe diagnostics or call a historical incident resolved without evidence. |
| 5 | Audit/backup closeout | Kyer; database/deployment owner; John/Voltaire for their fixture | Finish the named correlation/access/provider cases or record an explicitly accepted limitation. Populated disposable history checks do not establish real backup/restore. BAK-002 remains Deferred until its procedure and safe target are authorized. |
| 6 | Team-owned modules and final integration | Each primary owner; coordinator consolidates | Each owner reports required remaining work and evidence for Dashboard/Inventory/Reports/Public Website/Auth/QR/AR. A Not run row is not proof code is absent. User-module progress is not a whole-project percentage. |

The public repair batch (#92/#93/#94 and backend #211/#212) is merged. The local
frontend refresh and read-only dialog checks passed; #213 records that closeout.
No additional feature or repeated testing round is required merely to wait for
its documentation review. Public content/privacy and full release acceptance
remain separate from those completed fixes.

## Completion checklist for November 18

- Required scope is mapped to approved decisions/SRS and confirmed by owners.
- No unresolved critical/major security, data-integrity or required-workflow
  blocker remains; lower-severity deferrals are explicitly accepted and listed.
- Relevant changes are reviewed/merged; demo source and served build match the
  recorded release candidate. CI/local results are labelled accurately.
- Each owner and independent reviewer records the scope they actually checked.
  Inspection, synthetic tests, disposable SQL and live checks remain distinct.
- FAQ/public facts and notices have their appropriate content approval; no
  invented answer or stock/sample detail is presented as an approved fact.
- Startup/configuration/recovery instructions and authorized demonstration
  accounts are ready without committing secrets or exporting browser sessions.
- Optional disabled/unimplemented features and operational limits are disclosed
  clearly, including the limited offline, provider and real restore boundaries.
- The team can perform the agreed defense scenario on the frozen demo.

## Daily handoff

Report only: **finished**, **next required item**, **blocked by whom/what**, and
**target date**. A review should identify the exact changed scope and actual
tests run; do not ask reviewers to rerun every historical suite. If an external
dependency misses its target, escalate the decision while continuing unrelated
required work. Do not invent a whole-project completion percentage.

Sources: [completion handoff](./COMPLETION_HANDOFF.md),
[acceptance register](./ACCEPTANCE_TEST_PLAN.md),
[defect log](./TEST_DEFECT_LOG.md),
[FAQ content review](./FAQ_CONTENT_REVIEW.md).
