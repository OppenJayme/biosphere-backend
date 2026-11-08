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

For the next practical handoff, use the [November 8 closeout order](#closeout-order---november-8-2026)
below. It groups the decisions without marking any of them approved.

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
| B: Synthetic rehearsal | Implemented runner restores complete synthetic DB/Auth/files/config in isolation, with failure checks | November 8 engineering result: the [full-schema, five-bucket profile](SUPABASE_RECOVERY_LAB.md#full-biosphere-schema-and-five-bucket-rehearsal) passed separate-process encrypted capture/restore, real migration verification, retained public data, recreated pinned lab configuration and protected Nest/Auth/Storage reads, including identity-denial controls. The [CLI, recorder and standalone worker](../scripts/recovery/README.md#standalone-synthetic-worker) retain their separate evidence. Named independent review/acceptance of the fixed synthetic scope is pending; Gate B is not automatically closed by the local result. Hosted settings, custody, intended-source rehearsal and scheduling remain separate gates. |
| C: Intended-source rehearsal | Explicit access/target approval, verified export and full isolated restore, independent review | Not run |
| D: Scheduled operation | Jobs, status/delivery limitations, least privilege, capacity, retention and recovery custody verified on selected approved free runner/destination | Not enabled |
| E: Incident cutover | Specific incident/checkpoint/target and data-loss decision approved; write freeze and rollback/reconciliation plan ready | Not authorized |

Do not mark BAK-002 Pass at A or after a database-only fixture. Record the actual
coverage at each gate. A failed or incomplete verification leaves that gate open.

The user authorized the November 6 isolated implementation/rehearsal only. No
institutional policy approval, real-source access/export, destination selection,
scheduled deployment or incident cutover follows from that authorization.

## Closeout order - November 8, 2026

### What exists and what has not been established

The standalone synthetic worker, history/audit recorder and durable encrypted
Auth/Storage rehearsal are implemented. The expanded full-schema/five-bucket
candidate in [PR #265](https://github.com/OppenJayme/biosphere-backend/pull/265)
at `d464412` has 34 native checks and five owned service workflows passing
locally, with both CI jobs passing in
[run 547](https://github.com/OppenJayme/biosphere-backend/actions/runs/42398525474).
It remains open for independent review as of this checkpoint. These are
synthetic engineering results, not intended-source recovery or Gate B acceptance.

**Backup destination: none yet confirmed.** Read-only discovery found:

- No selected destination, storage-account owner or custody reference in the
  tracked procedure, approval record, recovery scripts or environment example.
- No backup/recovery or object-store destination settings in the checked local
  backend `.env` or frontend `.env.local`. Only matching setting names and
  populated/not-populated flags were inspected for the report; no secret values
  were printed or committed.
- The repository workflow runs isolated synthetic recovery tests. It has no
  scheduled backup trigger or configured retained-checkpoint upload.

This does not prove that no team member owns a suitable storage account.
Provider dashboards, repository secret values, external storage accounts and
their available quotas were not inspected. Confirm ownership with the team
before creating an account or purchasing anything. Local rehearsal files,
source Supabase buckets and the CI test job are not an established independent
backup destination.

### Storage and runner candidates - checked November 8, 2026

Preferred candidate: **Backblaze B2**, subject to confirmed museum/project account
custody, capacity and an authorized synthetic provider trial. Its Object Lock
and separately scoped upload/delete capabilities provide a concrete way to
evaluate protected retention. This is an engineering recommendation, not a
selected/approved destination or permission to create an account, connect
credentials or upload museum data. Google Drive and OneDrive remain documented
alternatives rather than the preferred recommendation.

| Candidate | Current published allowance / capability | Decision still needed |
| --- | --- | --- |
| Backblaze B2 | The first **10 GB** of storage are free; signup says **no credit card required**. Object Lock has no extra feature charge, but locked storage remains subject to normal storage charges. [Pricing](https://www.backblaze.com/cloud-storage/pricing), [signup](https://www.backblaze.com/sign-up/cloud-storage), [Object Lock](https://www.backblaze.com/docs/cloud-storage-object-lock). | Continuing account/MFA/key custody, measured retention budget, permitted data location, actual free-account capability and private-bucket/readback/denial tests. No paid activation is authorized. |
| Google Drive | Google describes consumer storage as **up to 15 GB**, shared with Gmail/Photos; actual available space must be inspected. [Google storage](https://support.google.com/drive/answer/9312312?hl=en). | Continuing account/MFA custody, actual quota, authorized use for encrypted museum exports and an automation configuration that remains within approved cost limits. |
| OneDrive | Microsoft's free account storage is **5 GB**, shared with other Microsoft storage uses. [Microsoft storage FAQ](https://support.microsoft.com/en-us/onedrive/microsoft-storage-faqs). | Same ownership/privacy/capacity checks; consider it if a suitable approved account already exists. No education/organization entitlement is assumed. |
| GitHub-hosted runner | Private execution uses a plan-dependent included compute allowance; the current GitHub Free table lists 500 MB artifact storage. [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions). | Check the repository owner's actual plan, remaining allowance, budgets and existing CI consumption. Evaluate as a runner; ordinary CI artifacts are not the proposed retained independent recovery copy. |

For B2, propose a private, Object Lock-enabled bucket with an explicitly approved
default retention duration/mode; enabling the feature alone does not apply a
default retention policy. Keep bucket/retention administration and bypass
capabilities out of the routine publisher identity. Use bucket-restricted
application keys with only the necessary capabilities, never the master key.
The [capability reference](https://www.backblaze.com/docs/cloud-storage-application-key-capabilities)
separates `writeFiles`, `deleteFiles` and retention/bypass powers. However,
`writeFiles` also permits hiding a file: use unique checkpoint object names,
retain immutable version IDs in the authenticated manifest and verify version
readback. A no-delete capability list alone is not an append-only proof.

Before accepting B2, use synthetic objects to demonstrate private access,
upload/readback hashes, protection of a locked version, denial of deletion and
retention bypass by the routine identity, and expiry handling that preserves the
last usable checkpoint. Do not apply an irreversible retention setting to real
data as a test. Locked and prior object versions consume space; their complete
retention/restore headroom must fit the measured budget. Assess storage, transfer
and API use with the provider's [caps and alerts](https://www.backblaze.com/docs/cloud-storage-data-caps-and-alerts),
including that not every transaction class supports a cap. Free signup is not
proof of unlimited free operation or a guarantee that an alert prevents charges.
No account, key, bucket, provider trial, payment method or upload has been created.

Google's [Drive API limits](https://developers.google.com/workspace/drive/api/guides/limits)
changed for newer projects in May 2026 and include a daily billing threshold;
the page says usage below that threshold incurs no extra charges, with further
billing details subject to notice. Therefore, storage being free does not
establish indefinitely free automation. Verify the intended API project and
enforce the agreed spending limits before enabling anything; do not add billing
or a payment method as an incidental setup step.

If rclone is selected, its [Drive documentation](https://rclone.org/drive/)
currently calls for an owned OAuth client because its shared client is being
retired during 2026. It also documents weekly grant expiry for an OAuth app left
in Testing. Resolve the approved client, consent/scope and durable authorization
setup before treating unattended operation as maintainable. No tool installation
or OAuth consent was performed in this assessment.

**Retention protection is a separate open design check.** A folder and encrypted
files alone do not establish that a compromised writer cannot remove retained
copies. Google's [file-delete API](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/delete)
supports `drive.file` authorization; Microsoft's
[app-folder documentation](https://learn.microsoft.com/en-us/graph/onedrive-sharepoint-appfolder)
states that the owning user can delete/replace its contents. These consumer
storage options therefore do not, by themselves, prove the procedure's protected
retention/separation requirement. Demonstrate the actual permission boundary and
independent-copy protection, or obtain an explicit policy deviation with its
risk accepted by the authorized approver. Do not silently weaken the procedure
to fit a free provider or mark the requirement passed from a no-delete script.

Before choosing a provider, record its owner and measured available space, then
compare them with the intended-source checkpoint size, retained full copies,
incoming-copy headroom and reserve. Synthetic example sizes are not estimates of
the museum's real holdings. Public documentation research did not inspect any
actual account, approve a provider or establish its suitability.

### Four remaining work packages

| Order | Work and responsible role | Completion evidence |
| --- | --- | --- |
| 1 | Independent technical reviewer: finish #265 review; team/business owner: identify the accountable approver, intended source, continuing account/key custodians and on-demand support route. | Named review tied to the fixed commit; actual decisions recorded above. A merge alone is not rehearsal acceptance. |
| 2 | Account owner and technical implementer: select a recoverable independent destination and runner; measure capacity, transfer, runtime and account recovery. | Restricted identity references; verified access without student devices; measured space for the proposed retention and temporary restore/export needs. No free-capacity or permanent-support assumption. |
| 3 | Technical implementer, after explicit source/target authorization: complete the intended-source adapter and coordinated checkpoint controls, restore into an isolated target, then obtain technical and Curator validation. | Version-specific capture/restore manifest, write-freeze/drain/abort checks, DB/Auth/object/config integrity, fresh login, protected application checks, rollback/failure outcomes and the completed rehearsal record. No live cutover. |
| 4 | Technical implementer and account owner: provision the approved schedule, protected copy/readback, retention, independent missed-run detection, history reconciliation and handover. | Least-privilege operation; failed/no-start jobs visible; last usable copy retained; approved expiry/holds verified; independent key retrieval and Curator checklist demonstrated. Enable only after the prerequisite gates pass. |

Packages 2–4 contain remaining engineering and deployment work; they are not
completed by selecting values in this document. No new public restore endpoint
is needed. Avoid another broad synthetic test campaign unless review finds a
defect or a changed implementation needs verification.

### Short decision request for the owner/approver

The team may send the following manually. It is a request for decisions, not a
claim that Sir Fidel alone has institutional deployment authority.

> We have implemented and tested BioSphere's synthetic backup/restore path.
> Before configuring real backups, please help us confirm:
>
> 1. Who is authorized to approve the procedure, and which project is the intended source?
> 2. Who will retain the project/storage accounts, MFA recovery and encryption-key access after graduation?
> 3. Is there an existing approved independent storage account and a runner we may use at no recurring cost? None is confirmed in our current setup.
> 4. Is the proposed daily capture and seven-daily-checkpoint retention acceptable, subject to measured capacity and privacy requirements?
> 5. Who authorizes a recovery, validates restored museum data and can request qualified technical assistance when needed?
>
> Please identify the role/account owner and decision date. Keep passwords,
> keys, MFA codes and database connection details out of the reply. We will
> separately request permission for any real-data export and isolated restore.

Until those answers arrive, preserve the reviewed synthetic evidence and leave
hosted export, scheduler enablement and retention deletion unexecuted. This is
not a waiver of SRS 4.15 or approval to overwrite the live service.

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
