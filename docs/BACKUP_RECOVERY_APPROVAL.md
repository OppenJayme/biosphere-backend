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
| Backup destinations | At least one complete encrypted independent copy with measured $0 capacity, permission and recoverable accounts; second copy only if available, single-copy risk explicit | Team selected Backblaze B2, November 8, 2026; tiny synthetic provider probe passed. November 9: a [live synthetic trial](./B2_LIVE_SYNTHETIC_TRIAL_20261109.md) verified one-day Governance retention on a probe, published and recovered one encrypted synthetic checkpoint by exact version, and restored the application from the downloaded copy. Recovery after retention expiry is unverified. Institutional permission, actual capacity, continuing custody and production acceptance remain pending. |
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
| B: Synthetic rehearsal | Implemented runner restores complete synthetic DB/Auth/files/config in isolation, with failure checks | November 8 engineering result: the [full-schema, five-bucket profile](SUPABASE_RECOVERY_LAB.md#full-biosphere-schema-and-five-bucket-rehearsal) passed separate-process encrypted capture/restore, real migration verification, retained public data, recreated pinned lab configuration and protected Nest/Auth/Storage reads, including identity-denial controls. The [CLI, recorder and standalone worker](../scripts/recovery/README.md#standalone-synthetic-worker) retain their separate evidence. November 9: the same full profile was also restored in a fresh process from a checkpoint downloaded from B2 ([live synthetic trial](./B2_LIVE_SYNTHETIC_TRIAL_20261109.md)); the reviewer did not reproduce that run. Named independent review/acceptance of the fixed synthetic scope is pending; Gate B is not automatically closed by the local result. Hosted settings, custody, intended-source rehearsal and scheduling remain separate gates. |
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
implementation in [PR #265](https://github.com/OppenJayme/biosphere-backend/pull/265)
merged November 8 at `5d55820`, from synchronized head `05410da`. MarQtie approved
the corrections at `d464412`; the later integration head passed all three CI jobs
in [run 564](https://github.com/OppenJayme/biosphere-backend/actions/runs/42464282968).
Historical local evidence at `d464412` comprises 34 native checks and five owned
service workflows. After synchronization, a fresh build and 38 focused native
checks passed, including the 27 planning-readiness checks. The service workflows
were not rerun on that integration head. These are synthetic engineering results,
not intended-source recovery or Gate B acceptance. A merged implementation and
code review do not complete the separate rehearsal acceptance/turnover record.

### B2 selection and bounded provider checkpoint - November 8, 2026

The team selected **Backblaze B2** and reported creating a private test bucket
in US West, enabling account MFA and saving a short-lived test application key.
Continuing ownership/recovery custody after graduation is still unconfirmed;
the account's creation and this test are not institutional deployment approval.

A one-off local probe used the explicitly supplied, Git-ignored credential file.
Only its setting names and sanitized safety flags were displayed. No key values,
tokens, provider account/bucket/object identifiers or private receipts are in
this record. The active checkout initially did not ignore `backblaze.env`;
an exact ignore rule was added before authorization. It was untracked, not
committed. The same rule is included in this change for future checkouts.

Observed through the real B2 Native API:

- Key restricted to one bucket, the `synthetic/` prefix, and an expiry within
  25 hours; required read/write capabilities present.
- Bucket access is private and lifecycle rules are empty. Region and account
  MFA are user-reported, not independently verified by this API probe.
- The console Read/Write preset includes `deleteFiles` and `writeBuckets`.
  This is a temporary test identity, not a demonstrated least-privilege routine
  publisher. No settings, deletion or permission changes were attempted.
- The key cannot read default retention. Its filtered absence is **not** proof
  that retention is disabled; the unset setting remains user-reported.
- Exactly one generated **181-byte** AES-256-GCM envelope was uploaded under a
  unique synthetic name. It contains generated text only, no application data.
  The encryption key was retained locally and was not uploaded.
- Download by the returned immutable file-version ID matched the encrypted
  bytes and SHA-256; authenticated decryption recovered the exact source bytes.
  Anonymous download of that same version returned an authorization denial.
  The synthetic object remains stored; no automatic deletion/retry was performed.

Local generated-byte checks also rejected a wrong decryption key and corrupted
ciphertext. Initial probe stops exposed deliberately strict assumptions about
the console key preset and readable retention metadata; no upload occurred in
those preflight attempts. The final probe explicitly records those limitations
rather than calling them verified permissions/retention protections. This was a
one-off operator check, not a shipped provider adapter or a reusable backup CLI.

**Still open:** custom routine-publisher permissions and adversarial denial
tests; Object Lock/retention/expiry behavior; quota/caps and measured full-copy
capacity; durable independent key retrieval; intended-source capture/restore;
runner integration, scheduling, reconciliation, missed-run detection and
institutional/Curator acceptance. No payment setup, retention configuration,
hosted museum export, source migration, real-data backup or production cutover
was performed. Do not promote BAK-002 or Gate C/D/E from this small provider test.

**Historical discovery before selection: none yet confirmed.** Read-only discovery found:

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

Earlier preferred candidate, now team-selected as recorded above: **Backblaze B2**, subject to confirmed museum/project account
custody, capacity and an authorized synthetic provider trial. Its Object Lock
and separately scoped upload/delete capabilities provide a concrete way to
evaluate protected retention. This is an engineering recommendation, not a
institutionally approved destination or permission to upload museum data.
The later bounded account/test authorization is recorded above. Google Drive and OneDrive remain documented
alternatives rather than the preferred recommendation.

| Candidate | Current published allowance / capability | Decision still needed |
| --- | --- | --- |
| Backblaze B2 | The first **10 GB** of storage are free; signup says **no credit card required**. Object Lock has no extra feature charge, but locked storage remains subject to normal storage charges. [Pricing](https://www.backblaze.com/cloud-storage/pricing), [signup](https://www.backblaze.com/sign-up/cloud-storage), [Object Lock](https://www.backblaze.com/docs/cloud-storage-object-lock). | Continuing account/MFA/key custody, measured retention budget, permitted data location, actual free-account capability and private-bucket/readback/denial tests. No paid activation is authorized. |
| Google Drive | Google describes consumer storage as **up to 15 GB**, shared with Gmail/Photos. This is not a guaranteed initial allowance for a newly created account: inspect its actual granted quota, remaining space and any verification requirements before budgeting. [Google storage](https://support.google.com/drive/answer/9312312?hl=en). | Continuing account/MFA custody, verified actual quota, authorized use for encrypted museum exports and an automation configuration that remains within approved cost limits. |
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
At the original assessment no account, key, bucket, trial, payment method or
upload had been created. The later synthetic-only checkpoint above supersedes
that account/test status; payment activation and real-data uploads remain unperformed.

Google's [Drive API limits](https://developers.google.com/workspace/drive/api/guides/limits)
changed for newer projects in May 2026 and include a daily billing threshold;
the page says usage below that threshold incurs no extra charges, with further
billing details subject to notice. Therefore, storage being free does not
establish indefinitely free automation. Verify the intended API project and
enforce the agreed spending limits before enabling anything; do not add billing
or a payment method as an incidental setup step.

If rclone is selected, its [Drive documentation](https://rclone.org/drive/)
currently calls for an owned OAuth client because its shared client is being
retired during 2026. Google's own [OAuth token-expiration documentation](https://developers.google.com/identity/protocols/oauth2#expiration)
states that refresh tokens for external apps in Testing expire after seven days,
except when requested scopes are limited to basic identity information; that
exception does not cover Drive file access. Resolve the approved client,
consent/scope and durable authorization
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
| 1 | Technical reviewer and team/business owner: complete the separate synthetic rehearsal acceptance record using the merged #265 evidence and its stated limits; identify the accountable approver, intended source, continuing account/key custodians and on-demand support route. | Named acceptance tied to the reviewed/tested versions; actual decisions recorded above. #265 code approval/merge is recorded, not a substitute for rehearsal acceptance. |
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


## Team operating answers - November 10, 2026

**Status: team-reported proposals and engineering recommendations; not deployment
approval.** Kyer/Ivan supplied the answers below. John Mark's willingness is
reported by Kyer/Ivan, not a recorded acceptance by John Mark. No real-data
export, scheduled execution, credential creation, retention change or restore is
authorized by this update. Existing execution gates and BAK-002 remain unchanged.

This dated record qualifies the older all-pending entries above. It does not
mark their approval fields complete. Secret values, the exact project mailbox,
account recovery details and private destination identifiers belong in the
restricted operating record, not this document.

| Item | Team answer | Disposition and remaining evidence |
| --- | --- | --- |
| Account ownership | Use the existing BioSphere project mailbox; hand it over to whoever manages the system after graduation. | Project mailbox selected in principle. Name the present accountable custodian and successor, confirm their acceptance, and demonstrate mailbox/B2/MFA recovery without a graduating student's device. Account transfer is not complete. |
| Backup operator | John Mark has reportedly expressed willingness. | Proposed primary human operator for checking outcomes and handling failures. His explicit acceptance, availability/contact route and a named alternate remain pending. This does not replace the least-privilege automation identity. |
| Encryption-key custody | Store keys in repository Kanban boards. | **Do not adopt this method.** No encryption keys, application keys, passwords or recovery codes in Kanban, issues, comments or committed files, including private repositories. Recommended: a restricted password manager plus a separately held encrypted offline recovery copy, with named custodians and a demonstrated retrieval process. Record only safe custody references here. Custody is pending; no existing key placement was inspected or inferred. |
| Restore authorization | John Mark or Sir Fidel. | Proposed roles, not confirmed authority. Recommend that Sir Fidel or the designated museum/business owner authorizes the checkpoint, acceptable data loss and any live cutover; John Mark or another qualified administrator executes the approved technical work. Record delegation explicitly if one person fills both roles. Existing SRS approval requirements remain separate. |
| Backup scope | Database and authentication accepted in principle; files/images questioned, with engineering guidance requested. | Recommend database records including audit/history, required account-recovery data, uploaded object bytes/images/attachments/AR assets, object metadata and necessary reproducible configuration. Database rows alone cannot recover missing object bytes. Reproducible caches/build outputs can be excluded; any other exclusion needs an explicit accepted loss statement. Measure real scope and size before approving retention. Final scope is pending. |
| Schedule and acceptable loss | Follow the proposal/SRS. | Existing proposal: daily 06:17 Asia/Manila, one run at a time, targeting 24-hour checkpoint spacing. Failed/delayed jobs can leave an older usable copy. This is a proposed schedule, not an enabled job or a guaranteed maximum loss. Confirm acceptance and measure actual checkpoint age. |
| Running location | Cloud, using Backblaze B2. | B2 is the storage destination, not the compute runner executing capture, encryption and upload. A separate cloud runner, ownership, network compatibility, allowances, protected secrets and missed-run detection are still pending. No provider has been selected or enabled by this answer. |
| Retention and budget | Warn the administrator/Curator before storage fills; move backups elsewhere and clear/reuse storage if needed. | Retain the proposed seven daily checkpoints only if measured free capacity fits retained/locked versions, the incoming copy and reserve. Alert before exhaustion; stop/report work that would exceed the approved budget. An alert is not a spending guarantee. Before retiring old copies, verify the replacement destination, exact-version readback and recovery/key access; preserve the last usable approved recovery set. Never automatically clear a bucket, bypass locks/holds or activate payment. Thresholds, migration/deletion authority and final retention remain pending. |
| Recovery time | Follow the proposal; desired recovery within one day. | Record one working day as the team's desired end-to-end target. The existing proposal has an unmeasured eight-hour hands-on benchmark and no end-to-end commitment. Measure incident detection, assistance wait, approvals, provisioning and technical execution separately; do not report the desired target as proven. Target acceptance and staffing remain pending. |
| Real-data rehearsal | The system administrator should handle it. | An administrator may execute the rehearsal. Before export, obtain explicit intended-source/data-owner authorization naming scope, private target, allowed operators/reviewers and test-copy removal deadline. Retain only sanitized evidence after authorized cleanup. No real-data copy or deletion is authorized here. |

### Next bounded work

The [cloud runner assessment](./BACKUP_CLOUD_RUNNER_ASSESSMENT.md) and
[hosted capture contract](./BACKUP_HOSTED_CAPTURE_CONTRACT.md) describe the
candidate and implementation prerequisites. Both are design drafts, not live
adapters, accepted deployment choices or permission to run real backups.

1. Obtain John Mark's acceptance and an alternate; name the present account
   custodian, successor and business restore approver/delegate.
2. Choose the protected key-custody method and independently retrievable recovery
   copy; keep only custody references in project boards. Do not move secrets into
   repository content as part of documentation.
3. Evaluate a cloud runner against the existing worker, required export access,
   resource/time limits, the actual account allowance and strict budget. Prepare a
   concrete candidate and isolated verification plan before enabling a schedule.
4. Measure intended-scope capacity only under separately authorized access; then
   finalize retention, warnings, spending guards and the real-data rehearsal
   record. Synthetic checkpoint size is not a museum-capacity estimate.

The [Curator checklist](./BACKUP_RECOVERY_CURATOR_CHECKLIST.md) remains conditional.
The completed [November 9 synthetic B2 trial](./B2_LIVE_SYNTHETIC_TRIAL_20261109.md)
is preserved as bounded engineering evidence; none of these answers closes
production readiness, post-retention recovery, rehearsal acceptance or turnover.

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

