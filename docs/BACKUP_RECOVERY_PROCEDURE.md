# BioSphere backup and recovery procedure

**Prepared/revised:** 2026-11-05. **Status:** proposed $0, automated,
low-maintenance procedure, not approved or implemented. **Assessed source:**
backend `77a8b54`; Supabase Free and no recurring infrastructure budget confirmed
by Kyer. No hosted credentials, artifacts or project settings were
inspected. No backup, restore, migration, scheduler or notification was executed.

### Implementation checkpoint - 2026-11-06

The user authorized the first isolated engineering slice after reviewing this
proposal. A [manual synthetic-only CLI](../scripts/recovery/README.md) now captures
an authenticated encrypted checkpoint, restores it into an empty owned target,
and verifies schema/data/file/configuration inventory. It accepts only labeled
local Docker fixtures with networking disabled; hosted URLs/credentials and
application `.env` are not supported. The November 5 statement above describes
the proposal stage, not absence of this later bounded implementation.

Base source: `d68b851`. The final owned PostgreSQL 17 rehearsal passes **15/15**
public-CLI checks. It uses all 11 repository application migrations, 34 non-system
tables including simplified Auth/Storage stand-ins, five bucket directories,
two synthetic byte objects and three explicit empty buckets. SQL readback
confirms identity/account mapping, retained audit, quantity 7, offline receipt
identity and `TEMPORARY_ABSENCE`; file/configuration checks pass. The source is
paused/unavailable during restore/verify. A prior bounded run also passed with
the source stopped; pause is used in the final fixture to retain its tmpfs seed
for subsequent failure injections.

Failure checks cover tampered ciphertext, wrong key, populated/non-table or
colliding/unowned targets, an existing attempt lock, changed restored rows/files,
a real pg_dump execution failure and missing source object bytes. Hosted URL
flags and snapshot traversal are rejected. Failures produce no verified success
and do not replace the prior checkpoint. The non-table target guard was observed
red before repair; the original CLI and unavailable-source path also have
recorded red/green checkpoints. Seed corrections and the tmpfs restart issue
were fixture setup issues, not accepted application behavior.

At this initial checkpoint CI ran **3 guard checks**, with the 12 real-Docker
checks explicitly skipped there; the full opt-in command ran locally. The later
review follow-up below adds the full Docker CI job. Node syntax, recommended
JavaScript lint, formatting and diff checks pass. No broad Nest/Next build/test
campaign was repeated: no application routes, schema, dependencies or generated
client contract changed. No shared server, database or browser was interrupted.

Evidence custodian: **@OppenJayme**. The final synthetic fixture run is
`fe02467f-eaa8-4d17-aebc-1363f91e4f8c`, snapshot
`6c5fe5ab-45d6-4a7b-9354-4ba2bb4174cb` (133,151 encrypted bytes). The private OS
temporary evidence folder basename is `biosphere-recovery-0qWqjU`; it contains
the profile, fake inputs, random rehearsal key, encrypted snapshot, restored
files and independent attempt ledger. Both exact owned containers were removed.
These are entirely synthetic artifacts; private keys/dumps/restore files are not
committed. Local storage is not a durable institutional backup or key escrow.

**Readiness remains incomplete:** no hosted export/restore, real Supabase Auth
sign-in, Storage API/RLS, global role/ownership recovery, media renderability,
full application acceptance, independent destination/readback, proper key
custody/Windows ACLs, live history integration, retention, scheduler, write-freeze
or missed-run delivery was proved/enabled. The CLI's separate CAPTURED and
RESTORED_VERIFIED states do not write a misleading application COMPLETED event.
The existing Backup History API remains read-only. BAK-002 stays Deferred and
the full-service Gate B remains open; this prototype is its first engineering
input, not a reviewed complete recovery rehearsal or deployment approval.

### Recovery CLI review follow-up - 2026-11-06

After #247 merged at base `4eaff1d`, all four non-blocking review points were
handled together. [DEF-034](./TEST_DEFECT_LOG.md#def-034---recovery-object-inventory-disagrees-with-locale-ordering)
is now reproduced with `Z.bin` and `a.bin` in one bucket under an explicit English
ICU collation. Capture failed with OBJECT_REFERENCE_MISMATCH before repair;
explicit `COLLATE "C"` now aligns SQL bucket/key inventory with the allowed ASCII
filesystem sort. Restore and verification also pass with those four total files
across the same five bucket directories (three empty).

[DEF-035](./TEST_DEFECT_LOG.md#def-035---retained-restore-workspace-produces-a-generic-retry-error)
is reproduced with a retained partial restore directory and an empty owned
database. The old retry returned OPERATION_FAILED; it now returns the specific
RESTORE_WORKSPACE_EXISTS, preserving the partial file and leaving the DB empty.
No automatic cleanup/overwrite is introduced. The inaccurate test-retention
comment now explicitly includes the synthetic key, inputs and restored files.

Full local rehearsal: **16/16 passing**, including the nested retry case and the
previous capture/restore/failure guards. The standalone guard command still has
3 passing checks and 12 skipped top-level Docker cases. A separate dependency-
free Linux CI job now explicitly pulls the same pinned PostgreSQL digest and
runs the entire suite on Node 22, with read-only contents permission, ten-minute
timeout, no provider secrets and no key/artifact upload. Its remote result must
be checked rather than inferred from the local run. The original fifteen-case
snapshot above retains its historical scope and artifact counts.

Both findings are fixed owner-side and Ready for retest, not independently
Verified. BAK-002/full-service Gate B remain unchanged; no hosted data, scheduler,
deployed recovery adapter, application history write or production readiness is
introduced by this hardening batch.

## 1. Decision and present capability

Use a replaceable free scheduled runner, an encrypted independent backup
destination with measured available capacity, and an isolated Supabase-compatible
recovery environment. No dedicated always-on backup server or permanently
staffed technical operator is assumed. Keep execution outside the ordinary
Nest/Next request path. Retain the
existing Curator-only Backup History API; do not add a general administrator
dashboard or give routine Developer accounts access to visitor/backup data.

Supabase recommends exports and off-site copies for Free projects. Its database
backups do not contain Storage object bytes. Provider backup availability is
therefore not our recovery strategy. See [Supabase backup documentation][sb-backups].
The baseline must fit $0 recurring infrastructure spend; paid features are not
an MVP dependency. This is a budget constraint, not evidence that every required
service already fits it. A free destination, application hosting and scheduler
remain to be selected/validated. Never silently upgrade, add billable resources,
reduce required backup coverage or claim unlimited capacity when a limit is hit.

Routine capture, feasible verification, retention and status generation should
be automated. The Curator is the business/system owner, monitoring high-level
status and account continuity and requesting help for exceptions. Technical
recovery, secret rotation, broken automation and provider/deployment changes
require qualified on-demand help. The Curator is not expected to run PostgreSQL,
CLI, Docker, restic or server-maintenance commands. This model does not promise
zero future maintenance or indefinite support from the graduating team. See the
[Curator checklist](./BACKUP_RECOVERY_CURATOR_CHECKLIST.md).

The current `src/backup` module only reads history. `artifactAvailable` means
a path was recorded, not that bytes exist or a restore succeeded. The repository
contains no operational backup runner, restore runner, deployed scheduler or
backup-failure delivery integration. Historical architecture descriptions of
pg_dump orchestration are proposals, not implemented code. Existing disposable
PostgreSQL tests verify metadata reads, not recoverable backups.

## 2. SRS obligations and acceptance evidence

Source: [SRS](./BioSphere-SRS.pdf), PDF pages 89-91 / printed pages 83-85;
security/safety/recoverability pages 92-95; operational-email exclusion page 104.

| Requirement | Procedure / evidence needed |
| --- | --- |
| REQ-4.15-01/02 | Attributed backup and restore events with run ID, target identity, times and actual result; service principals must be identified without inventing a human actor. |
| REQ-4.15-03/04 | Keep audit records protected and searchable; no routine audit rewrite/deletion or public artifacts. Existing audit/history reads remain in place. |
| REQ-4.15-05 | Scheduled coverage of database including audits, required object bytes, approved AR assets and necessary configuration. Sections 4-7. |
| REQ-4.15-06 | Record every attempt, including missed/failed jobs; deliver a failure signal to the designated operator and record acknowledgment. Section 8. |
| REQ-4.15-07 | Approved storage, encryption, custody and separation of backup/restore permissions. Section 5. |
| REQ-4.15-08/09 | Restore to an explicitly identified target and verify before recording success. Sections 9-10. |
| REQ-4.15-10 | Host-side tools and runbooks, not a general-purpose application admin dashboard. |
| REQ-4.15-11 | At least one complete, documented backup/restore rehearsal before turnover, reviewed by someone other than its operator. Section 11. |
| REQ-4.15-12 | USC/DCISM approval of schedule, retention, recovery point, off-site destination and operator. Complete the [approval record](./BACKUP_RECOVERY_APPROVAL.md). |
| NFR-SAFE-04/05; NFR-REC-01 | Failed/partial backup or verification is never reported as successful; required data actually recovered. |
| NFR-SEC-08/10/11/12 | Protect visitor/account data, artifacts and secrets, including in recovery/test environments. Ordinary Developer access is not backup-operator authorization. |

The SRS excludes general operational email and SMS. Backup failure reporting
must use approved operational/in-system alerts and audit records, not silently
extend Brevo visitor email. An app badge cannot report an app outage: assess
independent missed-run detection and explicitly record any remaining gap.

## 3. Proposed policy for approval

These are recommendations, not SRS-mandated numbers or measured service promises.

| Item | Proposed operating value |
| --- | --- |
| Routine schedule | Start with a proposed daily 06:17 Asia/Manila run, away from the top of the hour, using free hosted execution; one run at a time. Twice daily is optional only after capacity/runtime/egress measurements support it. No schedule is enabled or guaranteed by this document. |
| Recovery point objective (RPO) | Aspirational 24-hour checkpoint spacing during healthy daily execution, not a guaranteed maximum loss. Delays/failures can make the last usable checkpoint older. Always show/measure its actual timestamp and age; acknowledge any gap beyond the approved objective. |
| Recovery time objective (RTO) | No end-to-end time commitment without available qualified help. Retain eight hours only as a provisional hands-on technical rehearsal benchmark, not the incident-to-recovery promise from the original draft. Measure assistance wait, approval/provisioning and technical execution separately; total incident time includes all of them. |
| Maintenance window | Automate the shortest measured off-hours write-freeze/drain. Fifteen minutes is an initial rehearsal threshold, not an SLA. Timeout/abort must safely release only the job-owned gate and retain the last good checkpoint without waiting for a staffed operator. A longer window needs explicit approval. |
| Extra captures | Before approved deployments, migrations or bulk corrections, and before/after a recovery cutover when safe. Never run a migration merely to make a backup succeed. |
| Retention | Propose seven daily checkpoints initially. Four weekly copies and a turnover checkpoint for 30 days are optional only if measured free capacity and privacy approval allow. Values are not accepted until measured/approved; never silently prune required history or the last usable copy to stay free. |
| Verification | Automate manifest/hash/readback every run and periodic repository integrity checks within runner limits. Complete one reviewed full-service restore before turnover; repeat after material schema/Auth/storage changes with qualified support. Quarterly full-rehearsal review is a planning candidate, not a claim of funded recurring support. A health check alone is not a full restore. |
| Capacity | Measure current database, object bytes, daily changes and export traffic; budget retention and transfer headroom before activation. Alert at 80% approved capacity. No automatic paid upgrade or silent coverage reduction. |

The first full object export may be large. Later captures should transfer only
new/changed objects into protected staging while producing a complete logical
checkpoint. Restic can avoid storing repeated content, but it does not reduce
Supabase downloads by itself. Actual Free-plan quotas must be checked privately
by the project owner; no quota or zero-cost guarantee is inferred here.

### Free-service facts and selection gates

Official documentation checked November 5, 2026, not an inspection of the team's
actual account usage:

- [Supabase pricing][sb-pricing] lists Free at 500 MB database, 1 GB file storage,
  and 5 GB uncached plus 5 GB cached transfer; Free projects can pause after a
  week of inactivity. Do not assume background exports prevent pausing.
- [Database backups][sb-backups] documents daily managed backups for paid plans
  and recommends Free exports/off-site copies. Our baseline therefore requires
  its own automated export. Database backup omits actual Storage file bytes.
- [Egress accounting][sb-egress] distinguishes cached and uncached pools and
  counts exported data against applicable allowances shared with normal use.
  As a worked budget, a 100 MB daily export is roughly 3 GB per 30 days before
  media and normal traffic; compression and actual transfer must be measured.
  Deduplicated destination storage does not by itself prevent repeated downloads.
- Pro is an optional future improvement, not a prerequisite: its published offer
  includes daily backups retained seven days and larger allowances. Funding and
  activation require a later decision; file backup/verification still matter.

Select an approved independent destination before choosing its encryption tool.
It must fit measured retention and restore traffic, permit institutional data
and automated access, and remain recoverable without a student's account. No
free storage provider, existing university quota or permission is assumed.
Another bucket in the source Supabase project is not the sole recovery copy.

### Replaceable scheduled execution

GitHub Actions is a practical candidate because the project already uses it and
hosted execution avoids managing a backup server. It is not a permanent mandated
provider. [GitHub billing][gh-billing] distinguishes free standard public runners
from private-repository usage allowances and artifact/cache storage. Existing CI
shares the applicable budget. Do not make private source public to obtain free
minutes, or use public logs/artifacts/Git commits as the raw backup store.

[Scheduled workflows][gh-schedule] run from the default branch and may be delayed
or dropped. Public-repository schedules can disable after 60 days without
repository activity. Verify the actual repository/account/default branch and
turnover access; do not assume active museum use keeps a repository schedule
alive. No heartbeat commits or artificial activity are a substitute for ownership
and supported provider operation.

The runner contract remains portable: protected source credentials in, encrypted
complete checkpoint/manifest and sanitized result out, with bounded retries,
one-run locking, runtime/byte limits and idempotent history updates. A replacement
institution-approved free runner must pass the same rehearsal. Persistent object
inventory/checksums must live in approved private storage; an ephemeral runner
must not rely on its cache surviving to avoid re-downloading every file.
Never expose backup secrets to pull-request/fork jobs or execute untrusted
branches with them. Restrict workflow modification, use least permissions and
pin dependencies/actions; secret masking alone does not prevent exfiltration.

### Business ownership and exceptional technical support

The Curator controls continuity of approved museum/project accounts, sees clear
backup status, authorizes business recovery and validates restored holdings.
Routine operation is automated. A qualified person is engaged on demand for
recovery or maintenance exceptions; no permanently assigned primary/alternate
administrator, on-call shift, contractor or future IT support is assumed.
Availability and any one-time cost of exceptional help are unresolved; a $0
recurring infrastructure budget does not promise free professional recovery.

Before turnover, record recovery access for GitHub/repository, Supabase, app
hosting, backup storage, domains where applicable, recovery mailbox and MFA.
Prefer institution/project-controlled organization ownership with individually
authorized users and recoverable MFA, not a shared password or departing student's
personal mailbox/phone. Separate key escrow can be an approved sealed/vaulted
record; its custody does not require a second daily technical operator. If an
institution/project account or qualified contact route is unavailable, record an
unresolved turnover risk instead of fabricating one. A Curator requests support;
they do not debug the scheduler or execute secret-rotation commands.

## 4. Recovery set: what must travel together

| Component | Capture and verification boundary |
| --- | --- |
| Application database | All required application rows, including archived records, lots, quantities, movements, revisions, audit logs, inquiries/visits/messages, FAQ, exhibits/AR metadata, notification state, backup history, import state and `offline_draft_sync` receipts. Preserve UUIDs, enum values, constraints, sequences, functions, policies, grants and migration history. Do not rebuild from Prisma models alone. |
| Managed Auth | Preserve required user/identity data and its mapping to `public.user_account.auth_user_id`, with compatible Supabase Auth schema and configuration. Auth contains sensitive hashes and tokens. Inventory actual customizations and any encryption/Vault dependency; a public-only dump is not sufficient. Sessions are not promised to survive recovery. |
| Object files | Inventory every actual bucket and copy required bytes. Source declares `specimen-media`, `exhibit-media`, `ar-assets`, `user-avatars`, `inquiry-attachments`. A declared bucket may be empty/unused; record that result. Unknown nonempty buckets require owner disposition, not silent exclusion. Include draft/unpublished assets needed to preserve authorized records, not just public covers. |
| Object configuration | Bucket IDs/names, access rules, MIME/size restrictions, necessary metadata/custom policies and object-key mappings. Preserve exact object keys. Storage metadata is not the file. Recreate/upload using supported Storage interfaces; do not invent internal Storage rows as a substitute for uploading bytes. |
| Release/configuration | Both Git commit IDs, lockfiles, build/image provenance, PostgreSQL/Supabase/client/tool versions, migration names and exact checksums, approved static content, domain/TLS/DNS plan, Auth redirect/SMTP configuration, feature flags, CORS, storage settings and scheduler definitions. Record non-secret values separately from credential custody. |
| Recovery secrets | Credential/rotation inventory and separately protected, approved recoverable key escrow for necessary secrets and any applicable provider encryption root key. Demonstrate retrieval without the graduating team's accounts/devices. This does not assume USC provides a vault or second operator. Never store decryption passwords alongside the only backup copy or in Git. |

Unsynchronized IndexedDB drafts exist only on their originating devices. Server
backup cannot recover them. Preserve devices and ask owners to retain pending
drafts; never clear browser storage as a restore step. External email delivery,
uncommitted work and data after the selected checkpoint are not magically undone
or recovered. Keep idempotency receipts with their associated rows.

Default CLI schema exclusions, managed schema versions and non-database settings
make Supabase recovery different from a generic PostgreSQL import. The pinned
export adapter must prove its scope using [Supabase's migration guidance][sb-cli]
and its actual generated dump; do not assume a command named `dump` includes Auth.

## 5. Permissions, encryption and copies

Record the Curator business owner, automated service identity, key/account custody
arrangement and route for requesting authorized on-demand technical help in the
approval record. Independent technical review is required for the turnover
rehearsal, not a permanently staffed role. No student is assigned perpetual support.

- Source capture uses a dedicated role with the minimum verified read/export
  privileges and Storage download access. RLS must not silently omit required
  rows. If managed Auth needs privileged export, approve that narrow credential
  separately; do not reuse a general service-role key merely for convenience.
- The capture identity cannot restore, change quantities, migrate or delete
  source records. A separate narrowly scoped result-writer records history/audit
  events; it has no museum-record mutation privileges. Source export and artifact access are privileged technical
  permissions, separate from BioSphere's two routine application roles.
- Use authenticated encrypted repositories (proposed: restic), TLS with server
  identity verification for remote access, protected OS secret files/vaults,
  and protected ephemeral or encrypted staging with verified cleanup.
  No secrets in CLI URLs, shell history,
  process listings, CI logs or public Actions artifacts. Tool credentials must
  enter through a tested protected configuration mechanism, not printed args.
- Require the live service plus at least one encrypted complete independent
  recovery copy in a different failure/account domain. A second independent or
  offline copy is desirable if available at $0; it is not assumed funded.
  Record single-copy deletion/account-lockout risk and the accepted custody/
  restore test. Do not claim three-copy resilience.
- Separate writer access from retention/deletion administration. Prefer enforced
  append-only/offline protection where available; encryption alone cannot stop
  an attacker deleting a repository. Automate only an approved bounded retention
  policy that was rehearsed; changing it or resolving holds needs authorization.
- Keep the authoritative verification manifest inside the authenticated backup;
  a loose SHA-256 file alone does not establish provenance. A sanitized external
  run ledger identifies the snapshot/run without exposing paths or personal data.

Restic is one candidate encryption/retention tool, not a mandatory curator-managed
service, installed dependency or assumption about destination compatibility.
Pin and verify tool releases before implementation. See its [repository][restic-repos],
[restore][restic-restore] and [retention][restic-retention] documentation.

## 6. Preflight: stop unless these checks pass

1. The approval record identifies the source project/environment, runner and exact
   destination. A connection-string match alone does not establish deployment
   identity. Do not place passwords/project connection strings in the public record.
2. Inventory PostgreSQL/Supabase versions, extensions, roles, Auth/Storage
   customizations, triggers/webhooks/jobs and actual bucket contents. Record
   migration checksums with line endings; preserve historical migration bytes.
   Resolve unknown state through the owner, not `migrate resolve`, reset or db push.
3. Pin the capture/restore toolchain compatible with those versions. Use an
   approved direct connection or session pooler, not the runtime transaction
   pooler; verify network/TLS and permissions without writing source data.
4. Verify independent repository access, capacity and non-student-dependent key retrieval.
   The source backup account cannot delete retained snapshots. Confirm no raw
   staging/artifact location is within Git, a web root, cloud-sync personal folder
   or application-served uploads.
5. Prepare a dedicated disposable Supabase-compatible target with distinct
   ports/project identity, empty owned storage and network isolation. Existing
   tiny PostgreSQL metadata-test containers do not constitute this full target.
6. Validate fail-closed source/destination allowlists, unique run lock, timeouts,
   maintenance/write-freeze controls and safe cleanup. Current source has no
   dedicated backup maintenance mode; implement/verify it before claiming a
   coordinated checkpoint. A browser banner alone is not a write freeze.

## 7. Scheduled/manual capture procedure

The runner below is an implementation contract, not an existing command.
Schedule it only after a synthetic end-to-end rehearsal and approval.

1. Allocate a random run ID and append STARTED to the independent private ledger.
   Create `backup_history` IN_PROGRESS through the deployment job identity when
   the source is available. Use null `created_by` for a service actor, with its
   technical identity in the correlated audit/ledger. Never forge a Curator ID.
2. Acquire the single-run lock. Prefetch object changes into protected staging
   using paginated listings and bounded concurrency; retain version/hash metadata.
   Never propagate a source deletion into retained backup snapshots.
3. Enter the approved write-freeze window. Drain in-flight writes and pause
   all cooperating writers: application mutations, imports/sync, admin changes,
   workers, retention cleanup and direct maintenance scripts. Pause schema changes.
   The host gate must cover public forms too. Record any non-cooperating writer;
   if consistency cannot be established, mark the attempt incomplete/failed.
4. Establish checkpoint time T. Capture one consistent database data snapshot
   covering the approved schemas; capture matching roles/schema/customizations
   while DDL is frozen. Record counts/checksums from that same snapshot or
   quiesced dataset. Independent unsynchronized exports are not one checkpoint.
   `pg_dump` supports consistent database export, but it does not coordinate
   Storage bytes; see [PostgreSQL guidance][pg-dump].
5. Reconcile the final object listing and retrieve missing/changed bytes. Compare
   every required DB object reference with the captured bucket/key, length and
   SHA-256; record extra/orphan objects separately. A failed listing, missing page,
   unreadable required object or object changed during capture fails coverage.
6. Seal the recovery set with the manifest from section 10. After the local
   complete set is durable, release the maintenance gate and resume writers in
   the recorded order. If capture fails or the runner disappears, the verified
   gate lease must expire safely; preserve the failure and last good backup and
   surface understandable failure/overdue status. Do not leave the museum
   permanently read-only waiting for a technical operator.
7. Write the encrypted snapshot to the approved independent destination and any
   additionally approved copies within the measured budget.
   Require tool exit success, manifest reconciliation and repository readback of
   the captured run; a listable snapshot alone is not enough. Restore its manifest
   and verify snapshot/file inventory and hashes. Mark source history COMPLETED
   only when required coverage, copies and checks succeed; otherwise FAILED. Record actual
   checkpoint/finish time, copy status and verification level in the private ledger.
8. Append a correlated backup audit result when the database is available. Publish
   sanitized history to Curator reads. The completion row/audit is normally newer
   than its own snapshot: preserve the independent ledger so recovery does not
   depend on a completion event having existed at checkpoint T.
9. Apply only the approved retention policy, in a separate automated job after
   verification. Review a dry-run and exact snapshot/host grouping before any
   removal. Never prune the last known-good or incident-held snapshot. Check
   repository health afterward. Partial failures do not trigger destructive cleanup.

Use stable source/environment tags and paths for retention grouping, with run IDs
inside manifests/ledger. Do not accidentally make each run its own retention group.
Before pruning, verify the snapshots that will remain include a tested recovery
set. Approval must also cover maximum age and legal/privacy holds; retaining the
last good copy is not an authorization to retain personal data indefinitely.

Do not use a broad `--clean`, reset, table truncation or delete step on the source.
Raw staging cleanup must target an exact owned directory after resolved-path
verification, with evidence retained securely according to policy.

## 8. Failure, missed-run and result semantics

| Event | Required behavior |
| --- | --- |
| Export/object/encryption/copy failure | Failed attempt, no COMPLETED state; retain last good checkpoint and sanitized error/run ID. Show an understandable Curator warning and escalation route; delivery timing is measured, not guaranteed. |
| Source DB unavailable | Independent private ledger remains the evidence source; queue correlated history/audit reconciliation. App status may be unavailable too. Never invent successful writes or claim queued alerts were delivered. |
| Runner/job never starts | Independent free heartbeat/freshness detection is preferred if a supportable approved option exists. At minimum the working app checks last success age when opened; this cannot notify while nobody opens it or the app is down. No-start detection/delivery remains an acceptance gap until implemented/tested or formally scoped. |
| Run stuck IN_PROGRESS | Bound execution/retries and safe gate expiry; surface failed/stale state without overlapping runs. Request on-demand help rather than require constant technical monitoring. |
| Help unavailable | Curator records the incident/request. No guaranteed acknowledgment or recovery time; retain data/devices and safe state until qualified help is engaged. No funded on-call service is assumed. |
| Restore check fails | Record restore FAILED, quarantine target and preserve evidence; no cutover, no success notification and no destructive fallback. |

Do not assume a USC/DCISM pager or monitoring team exists. Proposed Curator UI:
show last eligible checkpoint time/age and explicit unknown/failed/overdue status,
with a short instruction to retain work and request help. Never show green solely
because a synthetic history row says COMPLETED. A proposed daily policy warns
after 24 hours without an eligible checkpoint and escalates visually at 48 hours;
these are indicators, not guaranteed RPO bounds. No history means UNKNOWN.

This UI is not implemented by the existing Backup History reader. An unobserved
badge/log is not proactive failure delivery. Test the approved in-system signal
and recipient behavior and any independent missed-run route. If free resources
cannot meet REQ-4.15-06/approved alert expectations, record the limitation and
seek a requirements disposition; do not mark it satisfied. No new operational
email/SMS integration is proposed.

Existing history has IN_PROGRESS/COMPLETED/FAILED only. Define COMPLETED as
capture-and-copy verified, not full-restoration verified. Record full restore
verification separately in append-only evidence/audit. Failed notification
delivery is also a distinct failure, not a reason to label good bytes nonexistent.
Only complete coverage/copy/readback checkpoints from a rehearsed toolchain are
eligible for the freshness calculation; record the most recent full restore's
date and versions alongside them. A changed untested export format is not eligible
merely because a dump command exits zero.
Implement idempotent run-ID reconciliation so a DB outage/retry cannot create
contradictory or duplicate success records. The current table has no dedicated
run-ID/verification fields; schema/ledger integration is still to be designed.

## 9. Recovery procedure: isolated rehearsal and real incident

1. **Declare and authorize.** The Curator identifies the business incident and
   requests qualified on-demand technical help. That person records incident/
   rehearsal ID, scope, operator,
   approver, affected release and acceptable checkpoint. Preserve current evidence.
   Treat a suspected compromise as a security incident: use trusted tooling,
   rotate exposed credentials and choose a clean checkpoint, not automatically
   the newest snapshot. Authorize any real cutover separately from a rehearsal.
2. **Select and retrieve.** Obtain a specific authenticated snapshot ID, manifest,
   required copies and separately held secrets. Check retention/privacy holds
   and available keys. Record expected data loss since T and affected users;
   generic `latest` selection is not adequate incident approval.
3. **Isolate target.** Prove source and target differ. Restrict restore credentials
   to the owned target. Disable outbound email, Auth invitation delivery, webhooks,
   scheduled jobs, cleanup, publication hooks and sync/replay before loading data.
   Use local sinks/test accounts for rehearsal. Restored SQL/functions can execute
   code: review trusted artifacts and enforce egress isolation before import.
4. **Restore the package to disk.** Retrieve the selected restic snapshot into a
   new protected owned directory. Verify inventory, authenticated manifest and all
   required hashes. A repository check or successful decrypt alone does not prove
   usable application data. Never reuse the live staging or web-served directory.
5. **Restore a compatible service.** Provision the recorded Supabase-compatible
   base, extensions and managed schema version. Restore approved roles/custom
   schema/data with fail-on-error behavior, respecting managed Auth ownership and
   foreign keys. Inspect actual pinned tooling before selecting SQL versus custom
   archive restore commands. Stop on unapproved ownership/permission/schema errors;
   do not remove RLS or ignore constraint failures to force success. No Prisma
   baseline/reset/migration rewrite substitutes for recovering the captured state.
6. **Restore Storage/config.** Recreate approved buckets/access settings, upload
   captured bytes under exact keys using supported APIs, and reconcile metadata
   ownership and DB references. Check applicable provider encryption-key/Vault
   dependencies separately. Restore non-secret settings from inventory and issue
   target-specific secrets/redirect URLs through the custodian. Do not point a
   restored app at the source project's Auth, Storage or mail service.
7. **Verify before enabling.** Run every applicable check in section 10, including
   actual local Auth/API/Storage behavior. Reset/revoke restored sessions through
   the supported Auth process and require fresh sign-in before release. Check
   Auth UUID mappings, MFA/account recovery and role separation with the Auth owner.
   Captured sessions/tokens are sensitive data, not a promise of resumed sessions.
8. **Reconcile time-sensitive state.** Keep mail/outbox/reply jobs paused to avoid
   resending messages already delivered after T. Reconcile idempotency receipts,
   pending imports/FAQ expiry/visit status and restored notification state with
   owners. Preserve evidence of any approved expiration/deletion reconciliation;
   do not expose resurrected expired visitor content or blindly replay old jobs.
   For a source compromise, receipt verification must not rely on untrusted logs.
9. **Approve release or stop.** Curator checks business data; technical owner and
   independent reviewer record pass/fail and data-loss disposition. Real cutover
   requires a controlled write freeze, a pre-cutover preservation copy if safe,
   target config/DNS/QR-origin checks and session reauthentication. There must be
   one authoritative writer. Do not enable writes on both old and new systems.
10. **Close and hand over.** Record incident/restore audit result in the independent
    ledger and available recovered audit service. Record elapsed RTO and observed
    checkpoint gap, then resume workers deliberately. If a writable cutover later
    fails, stop new writes and preserve them before rollback/reconciliation;
    blindly switching back would lose new work. Retain the old target read-only
    under approved incident retention. Destroy only approved owned rehearsal
    resources after evidence acceptance; preserve existing browsers and devices.

## 10. Manifest and verification checklist

Keep full manifests and detailed logs private. A sanitized report may contain
run IDs, versions, counts, digests and outcomes, not names/emails, private paths,
tokens, hashes of passwords or signed URLs. The manifest includes:

- Run/checkpoint IDs and UTC times with Asia/Manila presentation; environment,
  schema/release/tool versions; export scope/exclusions and reason; consistent
  snapshot identity; operator/service identity and approval reference.
- Table inventory/counts and integrity expectations from checkpoint T; migration
  checksums; constraints/enums/roles/grants/RLS/customization inventory; Auth UUID
  mapping checks; artifact hashes, byte sizes, encrypted snapshot/copy identifiers.
- Bucket/key inventory, required reference set, MIME/length/SHA-256, version/change
  markers, explicit empty buckets and orphan/missing disposition; no signed URLs.
- Config/secret-reference inventory and custody references; capture/copy/check
  outcomes; failures; source of result evidence and independent acknowledgment.

| Recovery check | Pass evidence |
| --- | --- |
| Completeness | All required tables and buckets accounted for; counts match checkpoint expectations; critical UUIDs and associations preserved. Extra/missing scope is explicitly failed or approved, not silently omitted. |
| Database integrity | No unexpected FK/check/unique violations; sequences/defaults work; enum `TEMPORARY_ABSENCE` remains readable; retained lots/quantities/history are unchanged. No arbitrary quantity recalculation. |
| Retry durability | A captured offline receipt still returns the same specimen on same-owner/same-ID retry in the isolated environment. Restoring after T cannot recover uncaptured receipts or records; record that loss. |
| Identity/authorization | Fresh Curator sign-in works; Developer and public clients cannot access visitor/audit/private media/history data. Source logins are not used for rehearsal. |
| Files and AR | Every required object's restored length/hash matches; representative specimen image, exhibit image, avatar/attachment if present, GLB/USDZ if present open through the intended access boundary. Private buckets stay private. |
| Core workflows | Catalog search/detail/readiness, lot/storage history, approved FAQ and QR public page work against the restored target. One synthetic isolated save/import retry verifies write-path integrity without touching original records. |
| Public configuration | Permanent approved origin/QR slugs and public field allowlists preserved; rehearsal cannot publish externally or send email. |
| Accountability | Original audits retained; restore action/operator/checkpoint/result recorded; failure injection produces no success event or cutover. |
| Recovery measurements | Actual start/verified-release time and checkpoint age recorded, compared with approved RPO/RTO. A missed target is a measured exception requiring approval, not a Pass label. |

Privacy lifecycle and backup retention must be approved together: restoring an
older checkpoint may reintroduce expired/deleted records. Apply approved expiry
and rights-request reconciliation before user access, preserving a private
deletion/reconciliation record. Do not invent a retention policy in this runbook.

## 11. Implementation order and finish line

Before defense, prepare the design, actual synthetic rehearsal evidence if
available and honest remaining gates. Institutional approval may be completed
after defense if official deployment is later; it is still required before that
deployment. One full reviewed backup/restore is required before turnover.
Confirm academic timing with the adviser. A prototype/defense demonstration
does not establish official production approval or waive the SRS.

1. Record the $0 constraints, source/runner/destination candidates, account/key
   custody and approval questions in the [decision record](./BACKUP_RECOVERY_APPROVAL.md).
   First measure synthetic/authorized data size, change rate, transfer and runner
   usage. Do not invent spare institutional capacity or a permanent maintainer.
2. Implement source/target allowlists, export/Storage inventory adapters,
   write-freeze/drain, protected staging and encrypted snapshot verification.
3. Implement schedule/locking, independent result ledger, idempotent history/audit
   recording and tested failure/watchdog delivery. Keep all features disabled
   until these gates and credentials are provisioned by the owner.
4. First rehearse with synthetic full-service data, object bytes and test Auth
   identities; test wrong target, corrupt/missing file, failed export/copy,
   missing key, no-start and failed verification. No shared writes required.
5. Under separate approval, capture the intended source and restore it only into
   the approved private disposable full-service target. Complete the verification
   and [rehearsal record](./BACKUP_RECOVERY_REHEARSAL_TEMPLATE.md). No deployment
   cutover is implied. Record whether real or synthetic source was actually used.
6. Enable approved scheduling only after successful reviewed recovery, Curator
   account/checklist handover, recovery-key retrieval and retention/alert tests.
   Explicitly accept or resolve on-demand-support and missed-run limitations.
   Update BAK-001/002 with actual evidence; documentation, a metadata screen or
   an untested free workflow alone closes neither case nor SRS section 4.15.

No copy-paste production restore commands are supplied before target identity,
tool version, managed-schema export scope and custody are settled. The next
implementation must produce a reviewed target-specific command manifest, not
guess flags from an old CLI or issue a destructive generic restore.

## References and assessment limits

Repository sources inspected: `src/backup/backup.service.ts`,
`src/backup/backup.controller.ts`, `src/backup/entities/backup-history.entity.ts`,
`database/sql/015_backup_history.sql`, `src/supabase/storage.config.ts`,
`src/supabase/storage.service.ts`, `prisma/schema.prisma`, `prisma.config.ts`,
`.env.example`, `.github/workflows/ci.yml`, `scripts/`, and the linked guides.
The Prisma baseline knows external Auth dependencies; it is not a Supabase
platform restoration specification. Installed host tools, live quotas, bucket
policies, encryption configuration, infrastructure and operator access were not
verified. Record those facts at preflight rather than assume their defaults.

Official technical sources checked November 5, 2026:

- [Supabase database backups][sb-backups]
- [Supabase pricing][sb-pricing] and [egress accounting][sb-egress]
- [GitHub scheduled workflows][gh-schedule] and [Actions billing][gh-billing]
- [Supabase CLI migration and managed-service recovery][sb-cli]
- [PostgreSQL pg_dump][pg-dump] and [pg_restore][pg-restore]
- [Restic repositories][restic-repos], [restore][restic-restore] and [retention][restic-retention]

[sb-backups]: https://supabase.com/docs/guides/platform/backups
[sb-pricing]: https://supabase.com/pricing
[sb-egress]: https://supabase.com/docs/guides/platform/manage-your-usage/egress
[gh-schedule]: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule
[gh-billing]: https://docs.github.com/en/billing/concepts/product-billing/github-actions
[sb-cli]: https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
[pg-dump]: https://www.postgresql.org/docs/current/app-pgdump.html
[pg-restore]: https://www.postgresql.org/docs/current/app-pgrestore.html
[restic-repos]: https://restic.readthedocs.io/en/stable/045_working_with_repos.html
[restic-restore]: https://restic.readthedocs.io/en/stable/050_restore.html
[restic-retention]: https://restic.readthedocs.io/en/stable/060_forget.html
