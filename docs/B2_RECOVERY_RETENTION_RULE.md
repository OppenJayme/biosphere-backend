# B2 recovery and expired retention: decision note

**Proposal, November 9, 2026. Decision owner: Kyer / Ivan (recovery tooling).**
No code is changed by this note. It asks for one decision: what checkpoint
recovery should do when an object's Object Lock retention has ended, been
changed, or cannot be read. Nothing here authorizes B2 access or real data.

## Why a decision is needed

`scripts/recovery/b2-checkpoint-transfer.cjs` (checked at `develop` `118737d`)
downloads a checkpoint only if `b2_get_file_info` reports retention that is
readable, in `governance` mode, and **exactly equal** to the deadline recorded
at publication (`fileInfo`, code `B2_TRANSFER_RETENTION_INVALID`). It does not
compare that deadline with the current time.

That was the right rule for the November 9 synthetic trial, which only
recovered while the one-day lock was active. It cannot be the production rule:
a real backup must still restore weeks after its lock ends, and that is
exactly when a disaster recovery is most likely to need an older copy.

What B2 reports after expiry is **not documented**. The
[`b2_get_file_info` reference](https://www.backblaze.com/apidocs/b2-get-file-info)
defines `fileRetention` but says nothing about its value after the
retain-until time. The
[Object Lock overview](https://www.backblaze.com/docs/cloud-storage-object-lock)
says only that after expiry a file can be changed or deleted. The
[Native API Object Lock guide](https://www.backblaze.com/docs/cloud-storage-enable-object-lock-with-the-native-api)
documents one case: a key without `readFileRetentions` gets
`isClientAuthorizedToRead: false` and `value: null`. So after expiry B2 may
keep the original mode and deadline, or may clear them. The rule must handle
both without guessing.

A mocked check on November 9 (not committed) confirmed today's behavior:
cleared, unreadable, earlier and later deadlines all stop with
`B2_TRANSFER_RETENTION_INVALID` and create no destination.

## What the retention check does not protect

Recovery integrity does not depend on retention. Independently of it, the
current code requires:

- the authenticated transfer receipt (HMAC from the separate recovery key);
- the exact recorded file version ID, file name, byte length and SHA-1;
- a downloaded-bytes hash match; and
- the existing checkpoint loader's authenticated decryption and recorded
  SHA-256 and artifact ID.

A modified or substituted object fails those checks whatever its retention
says. Retention at recovery time is therefore a **signal about the account**
(for example, someone with bypass rights shortened a lock), not a guard on the
bytes. The question is which signals should stop a recovery and which should
only be reported.

## Options

| Option                               | Behavior                                                                                                                                                                                                                                                     | Main risk                                                                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| A. Keep exact match                  | Unchanged. Any difference stops recovery.                                                                                                                                                                                                                    | If B2 clears retention after expiry, **every expired backup becomes unrecoverable** by the tool, even though its bytes are intact. |
| B. Report only                       | Integrity checks still required; retention never stops recovery, only reported in the result.                                                                                                                                                                | A shortened or removed lock before its deadline (a sign of account compromise or misuse) is easy to miss in output.                |
| **C. Time-aware rule (recommended)** | Integrity checks still required and never overridable. Retention is classified against the recorded deadline. Normal states proceed and are reported; suspicious states stop with their own code and need one explicit operator acknowledgement to continue. | Slightly more code and tests than A or B. Depends on the local clock near the deadline (handled with a margin below).              |

## Recommended rule (option C)

Let `D` be the recorded retain-until time and `now` the local time. Treat
`now` as "after `D`" only once it is more than five minutes past `D`, to absorb
clock skew.

| Reported retention                    | Before `D`                       | After `D`                        |
| ------------------------------------- | -------------------------------- | -------------------------------- |
| `governance`, deadline equals `D`     | proceed: `locked-as-recorded`    | proceed: `expired-as-recorded`   |
| `governance`, deadline later than `D` | proceed: `extended`              | proceed: `extended`              |
| mode and deadline both `null`         | **stop**: `retention-removed`    | proceed: `expired-cleared`       |
| any earlier deadline, or another mode | **stop**: `retention-shortened`  | **stop**: `retention-changed`    |
| `isClientAuthorizedToRead: false`     | **stop**: `retention-unreadable` | **stop**: `retention-unreadable` |

- A **stop** uses a new distinct code (for example
  `B2_TRANSFER_RETENTION_UNEXPECTED`) carrying the state name, so it is not
  confused with the bucket-level settings check, which today reuses
  `B2_TRANSFER_RETENTION_INVALID`.
- A stop can be overridden only by a separate explicit confirmation for that
  state (for example `--accept-retention-state retention-removed`). The
  override never relaxes integrity, version, scope or decryption checks.
- `retention-unreadable` means the key lacks `readFileRetentions`. The fix is
  the right key, so it should stay a stop.
- Every result, including a successful one, reports the state, so Backup
  History and the run record can show it once recovery recording is wired in.

## Related constraints a production recovery path will meet

These are outside the retention decision but block the same goal, so they
should be decided alongside it rather than discovered later:

1. **Bucket check.** Recovery also requires no lifecycle rules and no default
   retention on the bucket (`bucketCheck`). A production bucket may reasonably
   use lifecycle rules to remove old backups or set default retention. Recovery
   should probably check privacy and Object Lock only.
2. **Synthetic-only scope.** Recovery requires the prefix
   `synthetic/retention-<run-id>/` and a key expiring within about six hours.
   Short-lived, on-demand recovery keys are a reasonable production design,
   but the prefix rule must change for real backups.
3. **Recovery key role.** The owner bridge uses the temporary `fixtureWriter`
   for both publish and recover ([owner transfer guide](./B2_OWNER_TRANSFER.md)).
   The transfer code already accepts a read-only profile (`listBuckets`,
   `readBucketRetentions`, `readFileRetentions`, `readFiles`); a production
   recovery should use that read-only key.
4. **No current path to the November 9 objects.** The setup helper always
   creates keys for a new run prefix, so the trial checkpoint cannot be
   recovered after its keys expired. See the post-retention card in PR #289.

## Tests a change would need

Using the existing mocked-HTTP style in `test/b2-checkpoint-transfer.test.cjs`,
one case per row of the table above (ten cases), plus:

- integrity failures still stop when retention is in any proceed state;
- an override for one state does not accept a different state;
- the five-minute margin at `D` on both sides; and
- a successful result reports the retention state and leaves no destination
  on any stop.

The decision itself can then be confirmed with **one** authorized live
recovery of an expired synthetic checkpoint. Until a change lands, record
"recovery after retention expiry" as a known limitation and keep BAK-002
Deferred.

## Decision record

```text
Option chosen:            A / B / C / other: ____
Decided by:               ____        Date: ____
Related constraints 1-3:  change now / later / keep (state which)
Implementation owner:     ____        Tracking PR or defect: ____
```
