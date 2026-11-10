# Hosted capture contract - November 10, 2026

**Design draft only; no hosted export or implementation authorized here.**
Companion to the [runner assessment](./BACKUP_CLOUD_RUNNER_ASSESSMENT.md) and
[operating answers](./BACKUP_RECOVERY_APPROVAL.md#team-operating-answers---november-10-2026).
Keep the working synthetic worker and historical checkpoints unchanged. Do not
describe this design as implemented, tested or approved. BAK-002 stays Deferred.

## Goal and prerequisites

A future capture adapter produces one privately retained, encrypted recovery
set for an explicitly approved source/release, including application records,
required Auth identities, uploaded bytes and recovery configuration. Normal
capture never restores, applies migrations, changes source permissions or
deletes source/retained data. Source authorization must name scope, operator,
private target and limits; it is separate from permission to implement code.

Engineering baseline reviewed: develop
`cab23ab1f511415ae274f1645ed8abd17453e761` and the unchanged full-profile source
used by the November 9 trial. The current worker validates owned Docker
fixtures. `capturePlatform` in `supabase-platform-recovery.cjs` pauses owned Auth,
REST and Storage processes; it is not a hosted Supabase adapter. The checkpoint
store accepts a synthetic v3 fixture payload and limits its envelope to 64 MiB;
the source fixture also bounds database and object archives to under 16 MiB
each. These limits and payload semantics cannot silently become production
capabilities. Do not relabel a hosted export as a fixture to pass validation.

## Recovery-set inventory

| Component                     | Required capture contract                                                                                                                                                                                                                                                                                       |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Application database          | Approved schema/data, functions, policies, required roles/grants and migration names/checksums. Use compatible pinned export tooling and record the actual snapshot boundary. Account for extensions and objects outside `public`; do not assume a three-schema allowlist covers all customizations.            |
| Auth                          | Preserve approved user/identity data and the application account mappings with supported target-version behavior. Inventory MFA, provider and encryption dependencies; document intentionally invalidated sessions/re-authentication. Never promise that a users table alone recovers every account capability. |
| Storage                       | Inventory bucket configuration, object keys/metadata and every in-scope object's actual bytes; record sizes and cryptographic hashes. Metadata-only recovery is incomplete. Use supported interfaces for hosted access and restore; do not copy fixture backend tar archives as a hosted Storage recipe.        |
| Configuration                 | Release/lockfile/tool versions, source identity, extensions, non-secret Auth/Storage/application settings and external-service dependencies. Record private custody references for required secrets; do not put source signing keys or credentials in public manifests.                                         |
| Independent recovery material | Authenticated immutable-version receipt/manifest, recovery-key version and separately retrievable key custody. A successful upload without retrievable receipts and keys is not a recoverable set.                                                                                                              |

Supabase explicitly distinguishes database backups from Storage object bytes.
Use its [backup guidance](https://supabase.com/docs/guides/platform/backups) and
[CLI migration guidance](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
as provider constraints, not a turnkey complete recovery recipe. Review the
actual schema, permissions and platform versions before choosing commands.

## Consistency requirement: unresolved deployment blocker

An internally consistent database snapshot does not make separately downloaded
files atomic with that snapshot. Blocking only Nest mutations also does not
block direct Auth/Storage/Data API writes, dashboard/SQL activity or background
jobs. A banner or GitHub concurrency setting is not a source write barrier.

Before implementing complete hosted capture, enumerate every relevant writer
and prove one approved strategy coordinates it with the database snapshot and
object inventory. Options to evaluate, without assuming hosted support:

1. A measured maintenance/write-coordination mechanism covering all relevant
   writers, draining in-flight work and establishing the capture boundary.
2. A separately designed version-preserving capture strategy that can recover
   exact historical object versions and prove their relation to the DB snapshot.

Neither mechanism is established in the current deployment. Before/after lists,
counts and hashes are useful rejection checks but cannot prove no intervening
change occurred. An off-hours schedule alone is not sufficient. If coordination
cannot be demonstrated, stop the complete-backup workflow or label the output
as partial with its explicit limitations; do not issue a complete-success record.
An accepted scope deviation requires an explicit owner decision and requirement
disposition, not a code change hiding the limitation.

A future gate must have bounded duration, identity/ownership checks, a safe
expiry strategy and recovery if the job dies. Loss/expiry of the gate during
capture invalidates the attempt; cleanup must release only its own gate.
Do not hold a source freeze across slow cloud upload once a complete, immutable
local capture is safely staged and any required source reconciliation passes.

## Credential and execution boundaries

- Source DB export, object-read access, B2 publication and history recording are
  separate roles/configuration references. Determine required privileges from
  actual interfaces; never invent a narrowly scoped provider role that does not
  exist. If broader provider access is unavoidable, document the risk and obtain
  explicit acceptance. No B2 master/admin credential in routine execution.
- Secrets enter through a tested protected provider mechanism, not source files,
  Kanban, command arguments, logs or ordinary artifacts. Do not assume masking
  protects child-process errors. Preserve existing TLS validation and fixed
  destinations; do not allow arbitrary supplied export/upload URLs.
- Use a clean ephemeral workspace with bounded disk/memory, private staging,
  pinned tooling, minimal permissions and no PR-controlled live-secret job.
- Select an encryption-key lifecycle with a separate independently retrievable
  recovery copy. GitHub secrets may supply execution material but are not the
  only recovery copy. Do not design new cryptography or change the old checkpoint
  format without a separately reviewed compatibility and recovery plan.
- Export and staging sizes must fit measured limits. Oversized sets must fail
  before unsafe allocation/publication, never truncate, omit files or merely
  raise the fixture cap. Streaming/chunking is a separate design if required.

## Run outcomes and durable evidence

The following are conceptual phases, not new database enum values or an API:

1. Preflight source/release authorization, custody, budget, versions and capacity.
2. Begin the uniquely identified attempt and establish verified consistency.
3. Export and privately stage the complete recovery set; verify inventory/hash
   agreement. Release only the owned capture gate as safely designed above.
4. Encrypt and publish once; verify the exact returned immutable version and
   content integrity. Persist authenticated receipt and key reference privately.
5. Record verified capture outcome through the approved internal history path.

Capture verification is not restore verification. A later isolated full restore
must verify schema/data, relationships, fresh login, actual private object bytes
and access denial before the recovery set is accepted for operational turnover.

If upload outcome is uncertain, retain/reconcile the same attempt and private
intent receipt; do not blindly upload a replacement. If publication succeeds but
history recording fails, retain enough independent evidence for same-ID history
reconciliation; do not recapture simply to retry recording. Ephemeral runner
files cannot be the only evidence of an uncertain operation. Independent
missed-run detection must cover jobs that never start or lose the source system.

## Implementation order and acceptance

1. Review this contract, resolve the consistency strategy and choose a supported
   hosted export approach from actual source inventory. No hosted access is
   implicit. Confirm runtime/format scale and independent receipt/key custody.
2. Agree a bounded test seam, then build the smallest adapter using synthetic
   records and owned services. Exercise source mismatch, failed coordination,
   missing/changed objects, size limits, interrupted publication and history
   reconciliation. Preserve existing synthetic guards and legacy recovery.
3. Measure a manual, credential-free owned cloud trial before approving an
   intended-source manual capture. Separately authorize real-data export and a
   private restore target; record access and test-copy removal requirements.
4. Validate that capture with an isolated restore and operator review. Only then
   evaluate schedule enablement, budget/retention controls and handover.

This contract adds no endpoint, feature flag, database migration or workflow.
It does not resolve institutional authorization or grant incident cutover rights.
