# B2 synthetic retention and application recovery — November 9, 2026

**Day-one engineering result: passed for the bounded synthetic scope below.**
Expiry/cleanup observations, independent acceptance and operational deployment
are still pending. This is not a real museum-data backup or BAK-002 sign-off.

## Baseline and authorization

Executed against merged source `3ffb3bd5c309cc5ee9a821a14f9a70638c70830f`,
following #275, #276, #278, #279 and #280. The operator's complete tracked-source
snapshot matched all 739 repository file hashes. It was built separately using
Node 22.14.0 with a verified recovery source/runtime fingerprint. Windows
PowerShell 5.1 was the locally tested owner host; CI's PowerShell 7 result is a
separate claim.

The owner explicitly authorized three six-hour scoped keys and two encrypted
synthetic uploads totaling under 75 KB, each with one-day Governance retention.
The owner confirmed sufficient unused free storage and no paid activation.
Quota and a measured 350 Mbps upstream rate are owner-reported, not independent
billing or B2-path guarantees. The 73,845-byte checkpoint's body-only estimate
was about 0.00169 seconds; the existing 20-second transport deadline remained.

The administrative credential was entered by the owner only in hidden local
prompts. No agent read of `backblaze.env`, master-credential file, hosted export,
bucket-policy change, paid activation or existing-object modification occurred.
Generated test keys remained in the current Windows user's protected DPAPI
packet. Actual account, bucket, object/version and key references are omitted.

## Observed sequence

| Step                             | Observed outcome                                                                                                                                           |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Credential-free preflight        | 147/147 checks passed with zero skipped; all three plan previews reported no live changes.                                                                 |
| Immediate owner-setup preflight  | 16/16 synthetic checks passed with zero skipped on the selected local host.                                                                                |
| Owner key setup                  | `B2_TEST_KEYS_CREATED`, `createdCount: 3`, `bucketSettingsChanged: false`; protected metadata and actual authorizations matched the required role scopes.  |
| Local capture                    | Full-profile v3 checkpoint captured in a separate process; encrypted size 73,845 bytes; authenticated loader succeeded.                                    |
| Local restore before B2          | Fresh-process full application restore passed after capture resources were absent; cleanup completed.                                                      |
| Live retention probe             | `B2_RETENTION_VERIFIED`, `deleteDenials: 2`, `versionReads: 3`, `receiptRetained: true`.                                                                   |
| Live checkpoint publication      | `B2_CHECKPOINT_PUBLISHED`, `encryptedBytes: 73845`, `uploadVerified: true`.                                                                                |
| Live exact-version recovery      | `B2_CHECKPOINT_RECOVERED`, `checkpointValidated: true`; downloaded artifact, encrypted digest and loaded payload matched the original.                     |
| Application restore from B2 copy | A separate process consumed the newly downloaded checkpoint, not the original directory; `RESTORED_DURABLE`, `RESTORED_API_VERIFIED`, exit 0.              |
| Final local cleanup              | All rehearsal containers/networks removed; none remained under the lab ownership label. Running container count returned to the pre-existing count of ten. |

The private bucket, enabled/readable Object Lock, unset default retention and
empty lifecycle settings were checked by the reviewed tools. Exactly two
synthetic objects were uploaded: the at-most-1-KiB encrypted probe and the
73,845-byte checkpoint (at most 74,869 object-body bytes combined).

The probe was read by immutable version before either deletion check and after
each expected denial. The ordinary publisher's permission denial and the
separate deletion-capable probe's Object Lock denial are distinct observations.
These deletion checks concerned the **probe version**; no checkpoint deletion
was attempted. The checkpoint's requested retention metadata and encrypted
bytes were verified through its own readback and exact-version recovery.
No automatic upload retry, hiding operation, retention shortening or Governance
bypass was used. Governance is not a claim of protection against an authorized
account administrator with bypass privileges.

## Verification of the downloaded application

The restore result reported all of:

- Source capture resources absent; checkpoint authenticated before target creation.
- Migration history applied/verified, public row contents and relationships
  preserved, and foreign keys enforced.
- Protected Nest application reads verified; Auth identity preserved through
  fresh sign-in; old source access/refresh sessions rejected.
- Private bytes preserved and anonymous object access denied in the restored
  local Storage API.
- All five buckets verified: `user-avatars`, `specimen-media`, `exhibit-media`,
  `inquiry-attachments` and `ar-assets`.
- Restore cleanup complete, with no change to pre-existing application services.

Anonymous denial here concerns **restored local Storage**, not an anonymous
download from either new B2 object. The run card's distinct B2 anonymous/hiding
observations remain unexecuted. The trial wrote no shared Backup History/Audit
rows; this is CLI/receipt evidence, not proof of a deployed recording job.

## Preserved failures and evidence boundary

The initial service-free lab guards were 10/11: one child exceeded its configured
30-second timeout during Docker startup and low-memory conditions. The same
unchanged check passed a focused retry 1/1 in about 13 seconds. The cause was not
established; this is not represented as an uninterrupted 11/11 run. No memory
guard or test deadline was weakened.

An initial owner setup stopped at authorization with zero keys created and no
unknown creation outcome. Its generic error lacked HTTP detail. A local
read-only diagnostic subsequently reported HTTP 200 and the required admin
capabilities; the next setup succeeded. The original authorization failure's
cause remains unknown. Diagnostic code stayed in ignored local support material;
no product implementation changed for this evidence update. Owner confirmation
that any previously exposed legacy test credential was revoked remains pending;
master-key rotation alone does not demonstrate that standard keys were revoked.

Private evidence includes protected owner/probe packets, an authenticated
transfer receipt, separate recovery key/proof, the original and downloaded
checkpoint, and sanitized capture/publication/recovery/application outcomes.
These are retained in the operator's ignored local package; no keys, raw
responses, private paths or version IDs belong in this report. Current-user
DPAPI and local retained files do not establish portable institutional custody.

## Next-day observations and remaining gates

| Object               | Verified retention deadline, Asia/Singapore | UTC                        |
| -------------------- | ------------------------------------------- | -------------------------- |
| Synthetic probe      | November 10, 2026, 22:45:27.320             | `2026-11-10T14:45:27.320Z` |
| Synthetic checkpoint | November 10, 2026, 22:47:17.311             | `2026-11-10T14:47:17.311Z` |

These are retention deadlines, **not automatic deletion times**. Do not attempt
cleanup of both versions before the later deadline. The six-hour trial keys
expire before then. A later observation/cleanup requires separately authorized
credentials restricted to the original scope and exact synthetic versions;
verify current retention and any holds before deleting anything. Do not create
replacement keys, change policy or erase receipts automatically.

Post-expiry recovery remains unverified. The current engine conservatively
requires exact recorded retention metadata; if B2 clears/changes it after expiry,
the engine may refuse an otherwise intact object. A future change requires
provider evidence and regression review, not an assumption that this run proves
next-day or long-term recovery.

Still open: independent review/acceptance of this observed scope, later expiry/
cleanup evidence, B2 anonymous/hiding observations, continuing account and key
custody, operating owner/alternate, approved operational scope/RPO/RTO/retention,
intended-source recovery, deployed scheduling and failure handling. Account
transfer to curators is planned, not completed. No additional university approval
requirement is invented here, and no deployment/incident-cutover authorization
is inferred from this trial.

Use the [run card](./B2_SYNTHETIC_RUN_CARD.md),
[retention procedure](./B2_RETENTION_RUNNER.md),
[owner transfer guide](./B2_OWNER_TRANSFER.md) and
[full-profile lab](./SUPABASE_RECOVERY_LAB.md#full-biosphere-schema-and-five-bucket-rehearsal)
for the applicable boundaries. Reviewer sign-off must distinguish this day-one
result from the outstanding gates; additional live operations need their own
scope rather than an automatic repetition of this run.
