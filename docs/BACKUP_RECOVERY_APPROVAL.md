# Backup/recovery approval and operating record

**Prepared:** 2026-11-05. **Status:** Pending; no institutional approval or
execution permission is inferred from preparing this document.
Read the [procedure](./BACKUP_RECOVERY_PROCEDURE.md) before signing.

SRS REQ-4.15-12 requires USC/DCISM approval before deployment. Put secret values,
full target identifiers and contacts in the institution's restricted operating
record; commit only safe references and actual decisions here.

## Decisions to complete

| Decision | Proposed value / evidence required | Approved value / owner / date |
| --- | --- | --- |
| Accountable institution and approver | USC/DCISM authorized representative; team approval alone is not assumed equivalent | Pending |
| Source environment | Supabase Free; institution confirms intended project and release, PostgreSQL/Supabase versions, required schemas/buckets | Pending |
| Primary operator | Named technical maintainer with approved export/backup access | Pending |
| Alternate and key custodian | Different authorized person; demonstrates key retrieval without primary operator's laptop | Pending |
| Business validator / reviewer | Curator validates restored holdings; independent technical reviewer signs rehearsal evidence | Pending |
| Runner host | Institution-controlled always-on host, OS/version/network access, dedicated OS account and scheduler ownership | Pending |
| Capture schedule | 06:00 and 18:00 Asia/Manila daily, one job at a time; before approved high-impact changes | Pending |
| Recovery objectives | RPO 24 hours; RTO 8 elapsed hours, subject to measured rehearsal | Pending |
| Write freeze | At most 15-minute target after prefetch; technical gate/drain plus approved overrun handling | Pending |
| Backup destinations | Independent encrypted repository plus separate off-site/offline copy; resource owners and capacity confirmed | Pending |
| Retention and privacy | Seven daily/four weekly checkpoints, protected turnover checkpoint 30 days; approve expiry/deletion reconciliation and incident holds | Pending |
| Credentials and encryption | Least necessary source rights, separately scoped restore rights, restic/tool approval, institutional vault custody, alternate retrieval and rotation plan | Pending |
| Failure reporting | Monitored institutional host incident channel, protected app alert when available, independent missed-run watchdog; no operational email/SMS | Pending |
| Coverage/response | Who receives/acknowledges failures and missed runs, including nights/weekends; 15-minute signal and one staffed-hour acknowledgment proposed | Pending |
| Resource/cost limit | Measured initial/changed bytes, bandwidth, quota and retention capacity; no paid service activation without approval | Pending |
| Disposable recovery target | New private owned Supabase-compatible stack, distinct identifiers/ports/credentials, isolated network and outbound sinks | Pending |
| Sensitive rehearsal data | First synthetic; intended-source export/full restore requires separate explicit approval for data access and target custody | Pending |
| Verification/retention maintenance | Every-run capture readback; weekly integrity check; monthly/material-change full restore; reviewed retention dry-run | Pending |
| Incident authority | Named person who can stop writes/approve cutover and reconciliation; backup approval alone does not authorize live rollback | Pending |
| Turnover | Operator accepts runbook, keys, alert test, measured restore and ownership; no indefinite student support assumption | Pending |

## Execution gates

| Gate | Required outcome | Result / evidence |
| --- | --- | --- |
| A: Procedure | Approver accepts policy and completed decision fields; authorized technical scope established | Pending |
| B: Synthetic rehearsal | Implemented runner restores complete synthetic DB/Auth/files/config in isolation, with failure checks | Not run |
| C: Intended-source rehearsal | Explicit access/target approval, verified export and full isolated restore, independent review | Not run |
| D: Scheduled operation | Jobs, monitoring, least privilege, retention and key recovery verified on approved host | Not enabled |
| E: Incident cutover | Specific incident/checkpoint/target and data-loss decision approved; write freeze and rollback/reconciliation plan ready | Not authorized |

Do not mark BAK-002 Pass at A or after a database-only fixture. Record the actual
coverage at each gate. A failed or incomplete verification leaves that gate open.

## Approval statement

Approver name/role and authority: **Pending**

Procedure revision/commit and approved deviations: **Pending**

Approved source/host/destination record reference: **Pending**

Primary/alternate acceptance and date: **Pending**

Institutional approval and date: **Pending**

Next review date: **Pending**

This record approves only the explicitly completed gates. It does not authorize
shared migrations, history rewriting, deleting retained museum/test records,
changing visitor-data access or overwriting the active database.
