# B2 synthetic rehearsal run card

Prepared November 9, 2026. This is the execution procedure, not a status checklist.
The [November 9 observed trial](./B2_LIVE_SYNTHETIC_TRIAL_20261109.md) records the
completed day-one synthetic scope and the still-pending expiry/operating gates.
This card joins the existing procedures into one finite run. It does not
authorize provider access, museum exports, deployed backups or BAK-002 closure.

## Execution baseline

Review and merge #276, then #278, #279 and #280. #275 supplies the owner setup
helper and is already merged. Child PR diffs include their parents until those
parents merge; review the child-specific commits as well as the final integration.
Use one trusted integrated checkout and record its exact commit. Require CI on
that integration; an earlier branch's success is not integration evidence.

No key creation is needed while waiting for reviews. The temporary keys last
six hours, so finish local preparation before starting their lifetime.

**Live timing gate:** stages 6–8 (retention probe, publication and recovery)
must all finish while every required temporary identity has **more than ten
minutes left** of its six-hour lifetime. The window begins at key creation,
not at stage 6. Allow for operator pauses and all readbacks; do not begin if
the remaining time is insufficient. Expiry requires a stop and a separately
authorized reconciliation/credential plan, not automatic key recreation.

**Upload feasibility gate before stage 7:** record the actual encrypted byte
count and conservative measured upstream speed on the intended connection.
The body-only estimate is `bytes * 8 / bitsPerSecond`; it must fit comfortably
inside the adapter's 20-second total deadline, leaving room for connection
setup, request handling and response. A 64 MiB body needs about 26.8 Mbit/s
even without overhead, so the size ceiling alone is not evidence of feasibility.
Use an existing trusted measurement with no backup/credential payload; never
benchmark by attempting the live publication. If throughput is unknown or the
margin is inadequate, stop or prepare a smaller owned synthetic checkpoint
before creating keys. Do not relax timeouts or clear an uncertain-upload receipt.

### Account handover decision received November 9

The user reports that the team currently controls the Gmail account associated
with B2 and plans to transfer it to the curators. This is a planned handover,
not completed transfer or demonstrated institutional custody. No named receiving
curator, handover date, recovery-access verification or removal of former team
access has been confirmed. Do not record credentials or recovery codes here.

The user deferred the remaining operational decisions: primary/alternate backup
operator, encryption-key custody and separate recovery copy, restore authority,
backup scope, acceptable data loss/frequency, runner location, retention/budget,
recovery-time target and authorization/access/disposal for a real-data rehearsal.
Keep these pending; do not infer agreement from the account-transfer plan.
They do not prevent an independently authorized synthetic demonstration, but
the existing procedure, intended-source and scheduled-operation gates remain open.

| Stage                                       | Action and evidence                                                                                                                                                                                                                                                                                  | Stop condition                                                                                                                                                                                                       |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Local baseline                           | Record source commit, Node version, chosen PowerShell executable/version, operator and independent reviewer. Check that the setup, retention, transfer and lab scripts and their guides exist in this checkout.                                                                                      | Missing dependency, unresolved review, failing CI or an untrusted host. Do not copy scripts or credential packets between worktrees to bypass it.                                                                    |
| 2. Credential-free preflight                | On the operator machine run the setup, retention and bridge synthetic tests using the same PowerShell host planned for live use, plus the transport/transfer/store checks below. Preview setup, retention and bridge with no live flags.                                                             | Any failure/skip, host mismatch or preview that attempts a live change. PowerShell policy remains unchanged.                                                                                                         |
| 3. Owned synthetic source                   | Follow the [full-profile lab](./SUPABASE_RECOVERY_LAB.md#full-biosphere-schema-and-five-bucket-rehearsal) to produce a loader-valid synthetic full-profile v3 checkpoint and separate recovery material. Finish capture before creating B2 keys.                                                     | Hosted source, real museum/account data, incompatible recipe/build, inadequate resources or incomplete capture. This card grants no Docker/service launch authorization.                                             |
| 4. Owner go/no-go                           | Record explicit authorization for three temporary scoped keys, the retention probe and one encrypted synthetic checkpoint in the exact private test bucket. Check actual quota/caps and ciphertext size.                                                                                             | Approval covers only one of those operations, costs/capacity are unknown, or bucket privacy/Object Lock/default retention/lifecycle settings fail the guides. Do not change bucket settings to force a pass.         |
| 5. Owner key setup                          | Follow the merged owner-key setup guide. The owner enters the administrative credential only in hidden local prompts. Require `B2_TEST_KEYS_CREATED`, three keys and no bucket-setting changes; inspect metadata locally. Preserve the DPAPI packet and run UUID privately.                          | Partial creation, unknown outcome, incorrect roles/expiry or packet failure. Reconcile in the owner console before another creation attempt. No keys in chat, Git, shell arguments or application environment files. |
| 6. Retention probe                          | Follow the [retention runner sequence](./B2_RETENTION_RUNNER.md#operator-sequence-and-evidence) once. Require `B2_RETENTION_VERIFIED`, two expected deletion denials, three exact-version reads and a retained verified receipt.                                                                     | Any unexpected code, unrelated denial, unknown upload outcome or successful deletion. Preserve receipts; do not erase them to permit a rerun.                                                                        |
| 7. Checkpoint publication                   | Follow the [owner bridge](./B2_OWNER_TRANSFER.md), using that packet's run UUID, the synthetic checkpoint directory and separate key directory. Explicitly confirm one publication. Require `B2_CHECKPOINT_PUBLISHED` and retain the authenticated transfer receipt with separate recovery material. | Scope/expiry mismatch, uncertainty marker or failed readback. Do not automatically repeat publication. A 64 MiB code ceiling is not an approved upload budget.                                                       |
| 8. Exact-version recovery                   | Recover through the owner bridge to a new absolute directory, without deleting or modifying the original checkpoint. Require `B2_CHECKPOINT_RECOVERED`; the existing loader must authenticate the recovered checkpoint and private verification material.                                            | Existing/overlapping destination, failed integrity, missing key/proof/receipt or expired provider identity. Keep any incomplete target for diagnosis. Do not overwrite it or silently obtain broader credentials.    |
| 9. Application recovery, separately bounded | If separately authorized and resources permit, feed the recovered directory and original separate key directory into the same-recipe owned `biosphere-restore` lab. Record protected API, fresh Auth and private Storage verification results.                                                       | File recovery alone must not be reported as a restored application. No shared or hosted restore target is permitted by this card.                                                                                    |
| 10. Later observations                      | Leave anonymous access, hiding resistance and post-retention expiry/cleanup explicitly pending unless independently executed under their own bounded plan. Keep independent key custody, destination ownership, schedule and production approval open.                                               | Six-hour keys expire before the one-day lock. Do not extend them, delete objects, alter retention or create replacement identities without separate authorization.                                                   |

The probe uploads `probe.enc`; checkpoint publication uploads a distinct encrypted
artifact. A combined run therefore involves **two synthetic object uploads**, not
one. The probe is at most 1 KiB; record the checkpoint's actual bytes separately.
There is no claim of guaranteed zero charges. The routine publisher, fixture
writer and deletion probe have different capabilities; do not substitute roles.

## Credential-free operator commands

Run from the integrated repository root. These tests use synthetic credentials
and mocked provider responses. They do not use `backblaze.env` or `.env`.

```powershell
# Native Windows PowerShell 5.1 alternative, tested immediately before live use:
node test/b2-owner-key-setup.test.cjs
node test/b2-retention-runner.test.cjs
node test/b2-owner-bridge.test.cjs
node --test test/b2-native-transfer.test.cjs test/b2-checkpoint-transfer.test.cjs test/supabase-checkpoint-store.test.cjs

powershell.exe -NoLogo -NoProfile -File scripts/recovery/b2-owner-key-setup.ps1
powershell.exe -NoLogo -NoProfile -File scripts/recovery/b2-retention-runner.ps1
node scripts/recovery/b2-owner-transfer.cjs
```

For the fixed Program Files PowerShell 7 installation, append `--powershell7`
to each of the first three test commands, use `pwsh.exe` for the two previews
and the guide's default bridge host for live operations. For native 5.1, live
bridge commands need `--host windows-powershell`. Never silently switch hosts.
No installation or execution-policy change is required by this card.

The later live command templates and confirmations remain in the component
guides. Do not run the internal pipe-only DPAPI helper manually.

## Shared evidence to record

Use the existing [rehearsal template](./BACKUP_RECOVERY_REHEARSAL_TEMPLATE.md).
Record only date/time/timezone, exact source commit, runtime versions, operator
and reviewer, synthetic counts/bytes, static outcome/stage, whether an upload may
exist, and opaque private-receipt references. Label each observation as passed,
failed or not run; preserve failures and distinguish simulated from provider
results. Public PR evidence must exclude credentials, packet contents, account/
bucket IDs, object/file IDs, raw provider responses and encryption material.

No live execution is recorded by writing or reviewing this card. Stop after
the authorized finite rehearsal; scheduling and museum-data backup remain
separate release decisions.
