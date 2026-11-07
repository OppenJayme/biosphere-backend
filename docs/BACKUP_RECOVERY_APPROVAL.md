# Backup/recovery approval and operating record

**Prepared/revised:** 2026-11-05. **Status:** Pending; no institutional approval or
execution permission is inferred from preparing this document.
Read the [procedure](./BACKUP_RECOVERY_PROCEDURE.md) before signing.

SRS REQ-4.15-12 requires USC/DCISM approval before deployment. Put secret values,
full target identifiers and contacts in the institution's restricted operating
record; commit only safe references and actual decisions here.

The requested baseline is $0 recurring infrastructure, Supabase Free, automated
routine operation and no permanently staffed technical administrator. The Curator
is business/system owner, not a database operator. Qualified technical help is
engaged on demand. This is an operating proposal, not promised free resources,
guaranteed availability or indefinite support by the graduating team.

Before defense, present the proposal, actual rehearsal results and unresolved
decisions honestly. Final institutional approval is required before official
deployment; one complete reviewed recovery test is required before turnover.
Those events may occur after defense, but defense does not waive the gates.
Confirm the academic timing with the adviser; do not invent a university process.

## Decisions to complete

| Decision | Proposed value / evidence required | Approved value / owner / date |
| --- | --- | --- |
| Accountable institution and approver | USC/DCISM authorized representative; team approval alone is not assumed equivalent | Pending |
| Source environment | Supabase Free; institution confirms intended project and release, PostgreSQL/Supabase versions, required schemas/buckets | Pending |
| Business/system owner | Museum Curator handles account continuity, high-level status, recovery authorization and business validation; no CLI/server duties | Pending |
| Routine operator | Automated service identity with limited capture/result credentials; qualified setup accepted at turnover | Pending |
| Exceptional support | Approved way to request qualified on-demand help; record any unavailable contact/support risk, not a fictitious permanent maintainer | Pending |
| Recovery custody | Approved recoverable keys/account/MFA access independent of students' personal devices; no second daily technical operator assumed | Pending |
| Business validator / reviewer | Curator validates restored holdings; independent technical reviewer signs rehearsal evidence | Pending |
| Scheduled runner | Replaceable free hosted execution candidate; verify terms, private-runner/CI allowance, default branch, account ownership and safe secrets; no dedicated server | Pending |
| Capture schedule | Daily 06:17 Asia/Manila proposed; one run at a time; twice daily only after measurements; extra authorized high-impact-change captures | Pending |
| Recovery objectives | 24-hour spacing is an unmeasured design target; no total RTO commitment. Eight-hour hands-on benchmark may be measured, with support wait and approvals reported separately | Pending |
| Write freeze | Short automated lease/drain with safe expiry/abort, tested without an attending operator; 15 minutes is a rehearsal threshold only | Pending |
| Backup destinations | At least one complete encrypted independent copy with measured $0 capacity, permission and recoverable accounts; second copy only if available, single-copy risk explicit | Pending |
| Retention and privacy | Seven daily checkpoints proposed first; four weekly/30-day turnover checkpoint only if measured capacity allows; approve expiry/deletion reconciliation and holds | Pending |
| Credentials and encryption | Least necessary source rights, separately scoped restore rights, compatible encryption and recoverable escrow; no institutional vault or personal student key custody assumed | Pending |
| Failure reporting | Understandable in-system failure/unknown/overdue state plus assessed independent missed-run detection; any outage/delivery gap remains explicit; no operational email/SMS | Pending |
| Coverage/response | Curator's high-level check/escalation arrangement; no funded on-call shift or guaranteed response time; limitations require disposition, not a false alerting pass | Pending |
| Resource/cost limit | Measured initial/changed bytes, bandwidth, quota and retention capacity; no paid service activation without approval | Pending |
| Disposable recovery target | New private owned Supabase-compatible stack, distinct identifiers/ports/credentials, isolated network and outbound sinks | Pending |
| Sensitive rehearsal data | First synthetic; intended-source export/full restore requires separate explicit approval for data access and target custody | Pending |
| Verification/retention maintenance | Automated per-run readback/integrity and approved retention; full rehearsal before turnover and after material changes; periodic on-demand review arrangements explicit | Pending |
| Accounts after graduation | GitHub/repository, Supabase, app hosting, backup destination, recovery mailbox and MFA are institution/project-controlled or explicitly unresolved; no fabricated institutional account | Pending |
| Incident authority | Named person who can stop writes/approve cutover and reconciliation; backup approval alone does not authorize live rollback | Pending |
| Turnover | Curator accepts simple checklist/account continuity; authorized technical setup and rehearsal reviewed, custody demonstrated and exception-help route recorded; no indefinite student support | Pending |

## Execution gates

| Gate | Required outcome | Result / evidence |
| --- | --- | --- |
| A: Procedure | Approver accepts policy and completed decision fields; authorized technical scope established | Pending |
| B: Synthetic rehearsal | Implemented runner restores complete synthetic DB/Auth/files/config in isolation, with failure checks | Partial engineering input: [CLI, recorder and standalone worker](../scripts/recovery/README.md#standalone-synthetic-worker) have real PostgreSQL/child-process evidence with fake/minimal Auth/Storage. Separate [real Auth/Storage smoke checks](SUPABASE_RECOVERY_LAB.md) passed locally, but have not restored those services. Full-service/application recovery remains unverified; gate stays open. |
| C: Intended-source rehearsal | Explicit access/target approval, verified export and full isolated restore, independent review | Not run |
| D: Scheduled operation | Jobs, status/delivery limitations, least privilege, capacity, retention and recovery custody verified on selected approved free runner/destination | Not enabled |
| E: Incident cutover | Specific incident/checkpoint/target and data-loss decision approved; write freeze and rollback/reconciliation plan ready | Not authorized |

Do not mark BAK-002 Pass at A or after a database-only fixture. Record the actual
coverage at each gate. A failed or incomplete verification leaves that gate open.

The user authorized the November 6 isolated implementation/rehearsal only. No
institutional policy approval, real-source access/export, destination selection,
scheduled deployment or incident cutover follows from that authorization.

## Approval statement

Approver name/role and authority: **Pending**

Procedure revision/commit and approved deviations: **Pending**

Approved source/host/destination record reference: **Pending**

Curator ownership, automated service identity and custody acceptance/date: **Pending**

On-demand support route and unavailable-support risk disposition: **Pending**

Institutional approval and date: **Pending**

Next review date: **Pending**

This record approves only the explicitly completed gates. It does not authorize
shared migrations, history rewriting, deleting retained museum/test records,
changing visitor-data access or overwriting the active database.
