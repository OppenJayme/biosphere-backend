# Backup/recovery rehearsal record

**Status:** Not run. This is a blank evidence template, not a successful test.
Use with the [procedure](./BACKUP_RECOVERY_PROCEDURE.md) and
[approval record](./BACKUP_RECOVERY_APPROVAL.md).

## Identity and scope

| Field | Recorded value |
| --- | --- |
| Rehearsal/run ID and date | Pending |
| Operator / independent reviewer | Pending |
| Approval gate and decision reference | Pending |
| Source | Synthetic or intended source; private identity reference, no credentials |
| Target | New owned environment and identity reference; proof it differs from source |
| Releases | Backend/frontend commits/builds, DB/Supabase versions, tools and image digests |
| Captured checkpoint | UTC timestamp and consistent snapshot identity |
| Backup snapshots/copies | Private ledger reference, authenticated manifest/hash identifiers |
| Outbound isolation | Mail/Auth/webhooks/jobs blocked before loading; safe network proof |
| Data classification | Required access, retention, expiry/rights-request reconciliation |

## Execution results

Enter Pass/Fail/Not run with actual observations and private evidence references.
Do not replace expected outcomes with executed results before running the check.

| Check | Expected | Actual / evidence |
| --- | --- | --- |
| Source/target guard | Wrong, unknown or same-source restore target rejected before writes | Not run |
| Capture | Database, Auth dependencies, all required bytes/config and manifest captured at a coherent checkpoint | Not run |
| Independent copies/key access | Copies readable; alternate retrieves decryption materials independently | Not run |
| Database integrity | Captured counts/UUIDs/relationships and constraints/roles/RLS/migrations preserved | Not run |
| Object integrity | Every required object's length/hash/key matches, including unpublished/AR assets if present | Not run |
| Identity and isolation | Fresh target-local sign-in works; public/Developer access remains limited; source secrets/services not reused | Not run |
| Core functions | Catalog, lots, storage, FAQ, QR/media reads and one isolated synthetic write/retry operate correctly | Not run |
| Audit and receipts | Retained audits/receipts present; restore event accurately attributed; same-ID retry does not duplicate | Not run |
| Privacy/replay | Approved expiry/deletion reconciliation completed; no old emails or jobs blindly replayed | Not run |
| Broken backup | Missing/corrupted required file or wrong key fails; no success/cutover | Not run |
| Backup failure | Failed export/copy becomes failed attempt; last good snapshot preserved | Not run |
| Missed job/DB outage | Independent watchdog/operator signal and eventual idempotent record reconciliation work | Not run |
| Recovery timing | Observed checkpoint gap and elapsed recovery meet approved values or have explicit exception | Not run |
| Cleanup | Only approved owned target/staging cleaned; source, retained snapshots and existing services unaffected | Not run |

Recovery declaration time / verified ready time: **Pending**  
Observed elapsed recovery time: **Pending**  
Observed recovery-point gap and data loss: **Pending**  
Unexpected external requests/writes: **Pending**  
Failure/defect IDs and unresolved differences: **Pending**  
Source/database/file changes actually performed: **Pending**

## Decision

Overall result: **Not run**  
Coverage: **Pending; distinguish DB-only, synthetic full-service and intended-source full-service**  
Curator data validation and date: **Pending**  
Independent technical review and date: **Pending**  
Approved limitations or rejected evidence: **Pending**  
BAK-001 / BAK-002 disposition: **Unchanged pending execution and acceptance**  
Remaining resources, custodian and cleanup/retention date: **Pending**

Commit only sanitized summaries. Full manifests, dumps, objects, Auth details,
private visitor data and recovery credentials belong in approved restricted
storage, never in Git or public CI artifacts.
