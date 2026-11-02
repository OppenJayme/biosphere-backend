# Delivery plan: November 18, 2026

Working completion target: **November 18**. Defense starts **November 23**.
Reserve November 19-22 for rehearsal, recovery practice and urgent corrections.
The November 18 target covers the entire capstone: required system modules,
testing and acceptance evidence, the final paper, technical documentation,
user instructions, appendices, approved screenshots/diagrams, defense slides,
demo preparation and required reviews/approvals. Paper and documentation work
must proceed alongside implementation rather than start after testing ends.
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
| Nov 3-8 | Finish required features and grouped module acceptance; incorporate approved FAQ/public content when supplied; draft paper, manuals and slides in parallel | Feature completion target is Nov 8. Critical/major workflows have evidence; unresolved dependencies are escalated to the coordinator with an explicit scope decision rather than hidden. |
| Nov 9-13 | Integrate a pinned release candidate, run one coordinated end-to-end/demo pass and reconcile the paper/documentation against it | Roles, core workflows, failure/retry paths and module boundaries work together. Required paper sections, diagrams, screenshots and evidence describe the actual system. Remaining defects have severity and owners. |
| Nov 14-18 | Fix remaining delivery blockers, complete bounded retests and final reviews, package the paper/docs/slides and freeze the demo | Completion checklist below is met; owners sign for their stated scope. Required adviser/institutional approvals are obtained. No optional feature starts. |
| Nov 19-22 | Rehearse defense and recovery on the frozen demo | Repeatable startup, approved accounts/content and clear presentation of capabilities/limits. Any emergency change receives its relevant regression check. |

These are planning targets. Institutional approval, scope exceptions and other
people's availability must be confirmed; this file does not assign approval
to someone who has not given it.

## Immediate work queue

| Priority | Work | Owner / dependency | Finish condition |
| --- | --- | --- | --- |
| Done | Review and integrate prepared dependency repair | Kyer; independent teammate reviewer | Backend #220 merged at `ef491c8`; the merged backend build and local refresh were checked on November 1. The recorded production audit had zero entries and eight low development entries; deployed security and independent acceptance are not established. Do not prepare the same repair again. |
| Done | DEF-017 denial-audit fixture gap | John owns Inventory; Kyer assisted test-only repair; Voltaire independently retested | PR #214 merged; independent 5/5 confirms Developer 403 and denial-audit readback without missing-adapter errors. Verified for the isolated fixture, not live persistence or Inventory acceptance. Do not queue the same repair again. |
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

## Kyer's finite module closeout groups

There are **five module closeout groups plus one final handoff**. This is a
planning grouping, not a count of remaining tests, PRs or sessions. A group
closes when its required acceptance gaps have evidence and owner/reviewer
acceptance, or an authorized explicit scope disposition. The acceptance register
remains authoritative; do not add optional cases merely to occupy review time.

| Group | Remaining acceptance scope | Already available / dependency |
| --- | --- | --- |
| Cataloging | Reconcile CAT-001/011/013/014/015/016: independent release acceptance, exact remaining media access/failure cases, duplicate ordering/archive policy and complete restoration branch. Include DEF-011 performance disposition. | Core lifecycle, date validation, import/metadata recovery and phone checks already have evidence. Reuse it; live provider/concurrency claims require their own safe target. |
| Storage | Finish independent hierarchy/archive/read-only acceptance and the Inventory-owned lot/placement boundary under STO-004. | STO-001/002/003 and original archive restrictions pass. John supplies the Inventory-side evidence; this does not reopen lot implementation. |
| Limited offline | Reconcile OFF-001 through OFF-004: independent acceptance, remaining negative boundaries and actual expiry/re-login scope. | Owned SQL/HTTP and accepted-write/tab recovery already pass. DEF-019 shared-backend pilot remains stopped; keep its safety disposition explicit. |
| FAQ | Approve real content; settle duplicate-knowledge policy; accept the approved active/inactive lifecycle and bounded visitor answer/clarification/fallback/follow-up flow. | Synthetic quality is 25/25. Sir Curator's authoritative facts and independent DEF-024 acceptance remain dependencies. Optional collection stays disabled. |
| Audit / Backup History | Reconcile AUD-001/002 and BAK-001: exact access/correlation/failure gaps, populated browser/provider evidence, OBS-001 disposition and independent fixture review. | Collection/Backup disposable checks have independent results. DEF-017 is independently confirmed 5/5 and merged in #214. BAK-002 real restore is separately Deferred, not silently accepted or dropped from required scope. |
| Final module handoff | One pinned integration/demo round, explicit defect dispositions, source/build identification, user instructions and evidence/paper alignment. | #213/#214 merged with their scoped reviewer evidence recorded. #216/#217 and frontend #96 also merged; local rollout/XLSX preview is recorded in the import guide. Do not repeat their passed checks merely to occupy review time. Whole-module acceptance remains distinct. |

## Paper and defense deliverable check - 2026-10-29

Repository inventory found `docs/BioSphere-SRS.pdf` and
`docs/BioSphere-Final-Capstone-1.pdf`, plus technical guides for Cataloging,
Storage, Offline, FAQ, Audit and Backup History. The user confirmed on Oct 29
that Capstone-1 is the latest paper and Capstone-2 Chapters 5-6 (results,
recommendations and related required material) have not received substantial
updates. Treat these chapters as remaining work, not final proofreading.
An existing technical guide does not establish a complete user manual.
The checked repository filenames did not identify a final user manual, defense
slide deck or dedicated defense/demo runbook; these may exist outside the repo.
Locate the editable source and school checklist before altering paper content
or claiming other deliverables are absent from the team's work. The user's
confirmation settles the paper-version question; do not ask it again.

Before Nov 18, consolidate rather than duplicate existing guides: identify the
current paper and assigned chapter owners, map required modules to results and
known limits, prepare role-based user instructions and a repeatable demo/startup
sequence, then finish required appendices, diagrams, sanitized screenshots and
slides. Use the school's required format and actual approved results. Never
include credentials, private visitor data, signed media URLs or unsupported
claims of complete accessibility, concurrency or production deployment.

### Capstone-2 writing tasks, in parallel with module closeout

1. Check the school's required Chapter 5-6 headings, methods and assessment
   instruments against the current paper. Do not invent a chapter template,
   sample size, survey, participant result or required approval.
2. Build the results tables from the existing acceptance register and defect
   log, linking each claim to its actual requirement, tested revision, method,
   environment, result and limitation. Keep automated checks, owner-reported
   manual checks and independently executed tests distinct.
3. Identify any required external/user evaluation that is still missing and
   assign its owner and date. Engineering test counts do not substitute for
   usability scores, stakeholder acceptance or statistical findings.
4. Draft conclusions against the objectives using only supported results;
   draft recommendations from documented limitations and accepted future work.
   Do not describe disabled collection, real restore or broad chatbot language
   understanding as completed capabilities.
5. Reconcile earlier chapters, architecture/ERD, scope and methodology with the
   final implementation; obtain adviser review before submission packaging.

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
- The final paper, user/technical documentation, required appendices, diagrams,
  screenshots and slides match the frozen system and the school's checklist.
- Required team/adviser reviews and submission packaging are complete; a draft
  file or merged software PR is not substituted for academic approval.

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
