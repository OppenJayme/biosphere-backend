# B2 post-retention observation and cleanup card

**Draft, November 9, 2026. Not executed, not authorized.** This card plans what
may happen to the [November 9 synthetic trial](./B2_LIVE_SYNTHETIC_TRIAL_20261109.md)
objects after their Governance retention ends. Writing or reviewing it grants
no B2 access, credential creation, deletion or retention change. Every live step
below needs its own explicit owner authorization.

## Deadlines

| Object                                       | Retention ends, Asia/Singapore  | UTC                        |
| -------------------------------------------- | ------------------------------- | -------------------------- |
| Synthetic probe (`probe.enc`, at most 1 KiB) | November 10, 2026, 22:45:27.320 | `2026-11-10T14:45:27.320Z` |
| Synthetic checkpoint (73,845 bytes)          | November 10, 2026, 22:47:17.311 | `2026-11-10T14:47:17.311Z` |

These are lock end times, **not deletion times**. B2 does not remove either
object automatically. Begin no step before **23:00 Asia/Singapore** to leave a
margin after the later deadline. There is no deadline for acting afterwards:
the objects together are under 75 KB, so leaving them stored is a valid choice.

The bucket also holds the earlier 181-byte synthetic probe from November 8
([approval record](./BACKUP_RECOVERY_APPROVAL.md#b2-selection-and-bounded-provider-checkpoint---november-8-2026)).
It was uploaded without retention. It is in scope only if the owner names it.

## What current tooling cannot do

Checked against `develop` at `118737d`:

1. **The original trial keys cannot be reused.** They expired six hours after
   creation. The [owner bridge](./B2_OWNER_TRANSFER.md) refuses a packet with
   ten minutes or less remaining.
2. **New keys from the setup helper cannot reach these objects.**
   `b2-owner-key-setup.ps1 -Create` always generates a new run ID and scopes
   its keys to a new `synthetic/retention-<new-run-id>/` prefix (it rejects
   `-RunId` with `-Create`). The bridge requires the packet's run ID to match
   the checkpoint's prefix. The trial objects are under the old prefix.
3. **Recovery after expiry is conditional.** `b2-checkpoint-transfer.cjs`
   (`fileInfo`, `B2_TRANSFER_RETENTION_INVALID`) accepts a download only if the
   key can read retention, the mode is `governance`, and `retainUntilTimestamp`
   equals the recorded value exactly. It does not compare that value with the
   current time.

A throwaway mocked check on November 9 (not committed, mocked HTTP only)
confirmed the refusal paths. Recovery stopped with
`B2_TRANSFER_RETENTION_INVALID` and created no destination when the reported
retention was cleared, unreadable, or set to any different deadline, earlier or
later. The existing round-trip test covers the unchanged case. **Which of these
B2 actually reports after expiry is unknown.**

So a post-expiry recovery of the original checkpoint is **not runnable
tomorrow** with reviewed tooling. Do not write ad hoc scripts, hand-made keys
or packet edits to get around this. Running that check needs a reviewed change
first (see "Later, separately reviewed").

## Owner steps for November 10

Each step is a separate decision. Stop at any step and record why.

### Step 1: Key inventory (owner, B2 web console, read-only)

In **App Keys**, check:

- the three `biosphere-test-<role>-<run-id>` keys from the trial: expired or no
  longer listed;
- any earlier standard or test application key that was exposed, including the
  November 8 test key: revoked, or still listed;
- no unexpected key exists.

Rotating the master key does **not** revoke standard application keys. If an
exposed key is still listed, revoking it is an owner decision; record only
"revoked on <date>", never its ID or secret.

### Step 2: Retention observation (owner, B2 web console, read-only)

After 23:00 Asia/Singapore, open the file details for the two trial versions in
the bucket browser. Record, for each version, only what the console shows:

- Object Lock / retention mode (for example Governance, none, or not shown);
- retain-until date and time as displayed, with its timezone;
- legal hold (on, off, or not shown);
- whether exactly one version exists (no extra, hidden or missing versions).

This needs no new key. If the console does not show retention, record
"not shown". Do not create a key just to read it.

### Step 3: Keep-or-delete decision (owner)

| Choice                     | Effect                                                                                                                                       |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Keep (recommended now)** | Preserves the only real objects that can test post-expiry recovery once a reviewed path exists. Storage cost for under 75 KB is negligible.  |
| Delete                     | Irreversible. Ends any chance of testing post-expiry recovery on these objects. Also removes the remote copy the trial's evidence refers to. |

The recommendation to keep holds until Step 2's observation is recorded and
the team decides how recovery should treat expired retention.

### Step 4: Deletion (only if chosen and separately authorized)

The owner deletes in the B2 web console:

- only the exact versions named in the authorization (two trial versions, plus
  the November 8 probe only if named);
- only after 23:00 Asia/Singapore on November 10;
- **without** any governance-bypass option. If the console reports the lock is
  still active, or offers to bypass it, stop.

Afterwards, record whether each named version is gone and that nothing else in
the bucket changed. Keep the private receipts and the local checkpoint copies;
deleting remote objects does not authorize deleting local evidence.

## Sanitized result record

Share only this. No key IDs, secrets, account or bucket IDs, file or version
IDs, screenshots of the console, or private paths.

```text
Observed at (Asia/Singapore):
Operator:                         Reviewer:
Step 1  trial keys gone:          yes / no / not checked
        exposed key revoked:      yes / still listed / not checked
        unexpected keys:          none / present (described privately)
Step 2  probe:      mode=____  retain-until=____  legal hold=____  versions=__
        checkpoint: mode=____  retain-until=____  legal hold=____  versions=__
Step 3  decision:                 keep / delete (authorized by ____ on ____)
Step 4  deleted versions:         __ of __ named; other objects unchanged: yes / no
        bypass used:              no
Not run: post-expiry recovery (no reviewed path), anonymous/hiding checks.
```

Label anything not done as "not run", never as passed.

## Later, separately reviewed

Only if the team wants post-expiry recovery evidence:

1. **Decide the rule first.** Should a production recovery accept an object
   whose lock has ended or whose retention it cannot read? Long-term backups
   must remain restorable after their lock ends, so the current exact-match rule
   cannot be the final production rule. Step 2's observation tells you what B2
   reports.
2. **Then make one reviewed change.** For example, a recovery-only path for an
   existing run prefix with a read-only key, and an explicit, tested rule for
   expired retention. It needs regression tests and review before any live use.
3. **Then run one authorized recovery** of the kept checkpoint into a new
   directory and the owned restore lab, as in run card stages 8–9.

Until then, record post-expiry recovery as a known limitation.

## What this card does not establish

Console observation shows what B2 reports, not what the recovery code would do
with it. Deletion shows that an expired Governance lock no longer blocks the
owner. It does not test anonymous access or hiding of these objects, does not
prove recovery after expiry, and does not settle account custody, operators,
schedule, RPO/RTO, retention for real backups, or SRS REQ-4.15-12 approval.
BAK-002 stays Deferred.
