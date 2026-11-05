# BioSphere backup and recovery procedure

**Prepared:** 2026-11-05. **Status:** proposed operating procedure, not approved
or implemented. **Assessed source:** backend `be0571f`; Supabase Free confirmed
by Kyer on November 5. No hosted credentials, artifacts or project settings were
inspected. No backup, restore, migration, scheduler or notification was executed.

## 1. Decision and present capability

Use a deployment-owned backup job, an encrypted restic repository on approved
independent storage, and an isolated Supabase-compatible recovery environment.
Keep backup execution outside the ordinary Nest/Next request path. Retain the
existing Curator-only Backup History API; do not add a general administrator
dashboard or give routine Developer accounts access to visitor/backup data.

Supabase recommends exports and off-site copies for Free projects. Its database
backups do not contain Storage object bytes. Provider backup availability is
therefore not our recovery strategy. See [Supabase backup documentation][sb-backups].
Free software does not guarantee free capacity, bandwidth or an always-on host.
The owner must approve those resources before enabling the job.

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
extend Brevo visitor email to backup messages. A database outage also requires
host monitoring that does not depend on the failed database.

## 3. Proposed policy for approval

These are recommendations, not SRS-mandated numbers or measured service promises.

| Item | Proposed operating value |
| --- | --- |
| Routine schedule | 06:00 and 18:00 Asia/Manila daily on an institution-controlled always-on host; one run at a time. A student's sleeping laptop is not the deployment scheduler. |
| Recovery point objective (RPO) | At most 24 hours of committed server data lost. Twice-daily capture gives recovery margin; alert at 18 hours since the last eligible checkpoint and escalate at 24. Track checkpoint age, not merely job completion time. |
| Recovery time objective (RTO) | Target 8 elapsed hours from incident declaration to verified service release, including approvals and provisioning. Measure in rehearsal; publish a revised target if resources cannot meet it. |
| Maintenance window | Prefer off-hours; target at most 15 minutes for final write freeze/capture after initial media prefetch. This limit requires measurement and an implemented maintenance mechanism. Exceeding it requires the operator's explicit continuation/abort decision. |
| Extra captures | Before approved deployments, migrations or bulk corrections, and before/after a recovery cutover when safe. Never run a migration merely to make a backup succeed. |
| Retention | Keep the newest seven daily checkpoints and four weekly checkpoints, plus a protected turnover checkpoint for 30 days. No indefinite monthly archive by default. USC privacy/retention approval may change these values. |
| Verification | Every run: manifest, byte/hash and independent-readback checks. Weekly: repository integrity check. Monthly and after material schema/Auth/storage changes: complete isolated restore. One complete rehearsal before turnover is mandatory. |
| Capacity | Measure current database, object bytes, daily changes and export traffic; budget retention and transfer headroom before activation. Alert at 80% approved capacity. No automatic paid upgrade or silent coverage reduction. |

The first full object export may be large. Later captures should transfer only
new/changed objects into protected staging while producing a complete logical
checkpoint. Restic can avoid storing repeated content, but it does not reduce
Supabase downloads by itself. Actual Free-plan quotas must be checked privately
by the project owner; no quota or zero-cost guarantee is inferred here.

## 4. Recovery set: what must travel together

| Component | Capture and verification boundary |
| --- | --- |
| Application database | All required application rows, including archived records, lots, quantities, movements, revisions, audit logs, inquiries/visits/messages, FAQ, exhibits/AR metadata, notification state, backup history, import state and `offline_draft_sync` receipts. Preserve UUIDs, enum values, constraints, sequences, functions, policies, grants and migration history. Do not rebuild from Prisma models alone. |
| Managed Auth | Preserve required user/identity data and its mapping to `public.user_account.auth_user_id`, with compatible Supabase Auth schema and configuration. Auth contains sensitive hashes and tokens. Inventory actual customizations and any encryption/Vault dependency; a public-only dump is not sufficient. Sessions are not promised to survive recovery. |
| Object files | Inventory every actual bucket and copy required bytes. Source declares `specimen-media`, `exhibit-media`, `ar-assets`, `user-avatars`, `inquiry-attachments`. A declared bucket may be empty/unused; record that result. Unknown nonempty buckets require owner disposition, not silent exclusion. Include draft/unpublished assets needed to preserve authorized records, not just public covers. |
| Object configuration | Bucket IDs/names, access rules, MIME/size restrictions, necessary metadata/custom policies and object-key mappings. Preserve exact object keys. Storage metadata is not the file. Recreate/upload using supported Storage interfaces; do not invent internal Storage rows as a substitute for uploading bytes. |
| Release/configuration | Both Git commit IDs, lockfiles, build/image provenance, PostgreSQL/Supabase/client/tool versions, migration names and exact checksums, approved static content, domain/TLS/DNS plan, Auth redirect/SMTP configuration, feature flags, CORS, storage settings and scheduler definitions. Record non-secret values separately from credential custody. |
| Recovery secrets | Credential/rotation inventory and a separately protected institutional vault entry for necessary secrets and any applicable provider encryption root key. Recoverability of that vault must be demonstrated by the alternate operator. Never include decryption passwords alongside the only backup copy or in this repository. |

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

Assign institutional roles in the approval record: accountable USC/DCISM owner,
primary operator, alternate/key custodian, Curator data validator and independent
reviewer. Team authors may prepare tooling but are not perpetual operators.

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
  and an encrypted staging volume. No secrets in CLI URLs, shell history,
  process listings, CI logs or public Actions artifacts. Tool credentials must
  enter through a tested protected configuration mechanism, not printed args.
- Keep the live service, an encrypted recovery copy on approved infrastructure,
  and an independent off-site/offline encrypted copy in a separate failure and
  credential domain. If only one independent copy is initially available, record
  that exception; do not claim three-copy resilience. Another bucket in the same
  Supabase project is not the independent recovery copy.
- Separate writer access from retention/deletion administration. Prefer enforced
  append-only/offline protection where available; encryption alone cannot stop
  an attacker deleting a repository. An authorized custodian reviews pruning.
- Keep the authoritative verification manifest inside the authenticated backup;
  a loose SHA-256 file alone does not establish provenance. A sanitized external
  run ledger identifies the snapshot/run without exposing paths or personal data.

Restic is a proposed dependency, not installed or approved by this document.
Pin and verify tool releases before implementation. See its [repository][restic-repos],
[restore][restic-restore] and [retention][restic-retention] documentation.

## 6. Preflight: stop unless these checks pass

1. The approval record identifies the source project/environment, host and exact
   destination. A connection-string match alone does not establish deployment
   identity. Do not place passwords/project connection strings in the public record.
2. Inventory PostgreSQL/Supabase versions, extensions, roles, Auth/Storage
   customizations, triggers/webhooks/jobs and actual bucket contents. Record
   migration checksums with line endings; preserve historical migration bytes.
   Resolve unknown state through the owner, not `migrate resolve`, reset or db push.
3. Pin the capture/restore toolchain compatible with those versions. Use an
   approved direct connection or session pooler, not the runtime transaction
   pooler; verify network/TLS and permissions without writing source data.
4. Verify independent repository access, capacity and alternate key retrieval.
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

1. Allocate a random run ID and append STARTED to the independent host ledger.
   Create `backup_history` IN_PROGRESS through the deployment job identity when
   the source is available. Use null `created_by` for a service actor, with its
   technical identity in the correlated audit/ledger. Never forge a Curator ID.
2. Acquire the single-run lock. Prefetch object changes into encrypted staging
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
   the recorded order. If capture fails, release only the gate this job owns,
   preserve the failed result and last known-good backup, and alert the operator.
7. Write the encrypted snapshot to the approved repository and independent copy.
   Require tool exit success, manifest reconciliation and repository readback of
   the captured run; a listable snapshot alone is not enough. Restore its manifest
   and verify snapshot/file inventory and hashes. Mark source history COMPLETED
   only when required copies and checks succeed; otherwise FAILED. Record actual
   checkpoint/finish time, copy status and verification level in the private ledger.
8. Append a correlated backup audit result when the database is available. Publish
   sanitized history to Curator reads. The completion row/audit is normally newer
   than its own snapshot: preserve the independent ledger so recovery does not
   depend on a completion event having existed at checkpoint T.
9. Apply only the approved retention policy, in a separate controlled job after
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
| Export/object/encryption/copy failure | Failed attempt, no COMPLETED state; retain last good snapshot and sanitized error/run ID. Signal operator promptly; proposed delivery within 15 minutes. |
| Source DB unavailable | Independent host ledger and monitor remain authoritative. Queue a correlated history/audit result for later safe reconciliation; never invent successful source writes. |
| Host/job never starts | An independent watchdog checks expected run/checkpoint freshness; scheduler exit handling alone cannot detect a dead host. Alert/escalate using the approved institutional monitoring channel. |
| Run stuck IN_PROGRESS | Watchdog compares run deadline/heartbeat, alerts and requires operator investigation. Do not blindly kill unrelated processes or overlap another backup. |
| Operator unavailable | Alert alternate and accountable owner; record acknowledgment and incident decision. Proposed acknowledgment within one staffed hour; approve off-hours coverage explicitly. |
| Restore check fails | Record restore FAILED, quarantine target and preserve evidence; no cutover, no success notification and no destructive fallback. |

The proposed alert route is an existing USC/DCISM monitored host incident
console/pager plus BioSphere's protected operational alert when the app is up.
If no such monitored route exists, that is an implementation/approval blocker;
an unobserved log file or dashboard badge is not failure notification. Do not add
operational email/SMS against the SRS merely to fill this gap. Delivery adapter,
watchdog, technical-operator access and acknowledgment need testing; none exists
for backup operations in the assessed repository.

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

1. **Declare and authorize.** Identify incident/rehearsal ID, scope, operator,
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

1. Approve the concrete policy, custody and monitored host/destinations using the
   [decision record](./BACKUP_RECOVERY_APPROVAL.md). List unresolved fields explicitly.
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
6. Enable approved scheduling only after successful reviewed recovery, operator
   handover and retention/alert tests. Update BAK-001/002 with the evidence level;
   documenting a plan alone does not close either case or certify section 4.15.

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
- [Supabase CLI migration and managed-service recovery][sb-cli]
- [PostgreSQL pg_dump][pg-dump] and [pg_restore][pg-restore]
- [Restic repositories][restic-repos], [restore][restic-restore] and [retention][restic-retention]

[sb-backups]: https://supabase.com/docs/guides/platform/backups
[sb-cli]: https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
[pg-dump]: https://www.postgresql.org/docs/current/app-pgdump.html
[pg-restore]: https://www.postgresql.org/docs/current/app-pgrestore.html
[restic-repos]: https://restic.readthedocs.io/en/stable/045_working_with_repos.html
[restic-restore]: https://restic.readthedocs.io/en/stable/050_restore.html
[restic-retention]: https://restic.readthedocs.io/en/stable/060_forget.html
