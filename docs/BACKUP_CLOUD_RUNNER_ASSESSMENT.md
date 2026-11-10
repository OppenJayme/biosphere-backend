# Backup cloud runner assessment - November 10, 2026

**Candidate assessment only.** No workflow, schedule, credential, live export,
upload, deletion or account setting is created or enabled by this document.
Read the [operating answers](./BACKUP_RECOVERY_APPROVAL.md#team-operating-answers---november-10-2026)
and existing execution gates first. BAK-002 remains Deferred.

## Recommendation

Evaluate a standard GitHub-hosted Ubuntu runner as the first cloud execution
candidate, with B2 as the independent encrypted storage destination. The
repository already uses Actions and Linux recovery tests; this avoids adding a
second compute-provider account solely for a scheduler. This is a candidate,
not a verified free deployment or a claim that the current worker can capture
the hosted application. Do not use a larger runner or expose the repository
publicly to obtain free compute.

## Evidence checked

Backend source checked at develop `cab23ab1f511415ae274f1645ed8abd17453e761`:

| Evidence                                                                                                                                                                                                              | Consequence                                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository metadata reports a private repository with default branch `main`.                                                                                                                                          | Verify the owner's actual Actions allowance and budget; merging to `develop` alone cannot enable a scheduled workflow. Record which approved release is captured. |
| `.github/workflows/ci.yml` triggers on pull requests and pushes, with isolated recovery checks.                                                                                                                       | Existing CI is test evidence, not daily museum backups. No live credentials belong in the PR test job.                                                            |
| `scripts/recovery/worker.cjs` accepts `biosphere-synthetic-recovery-v1` source profiles and `biosphere-synthetic-history-v2` history manifests; verifies owned local Docker identities, markers and loopback history. | It is deliberately synthetic-only. Do not substitute hosted URLs, weaken its identity checks, or relabel a synthetic history run as a production backup.          |
| `scripts/recovery/b2-owner-transfer.cjs` requires Windows and the owner helper's DPAPI packet; the packet is scoped to the trial run prefix.                                                                          | The owner-operated bridge cannot simply run on Ubuntu or another ephemeral Windows user. Do not upload the DPAPI packet and expect unattended decryption.         |
| B2 transfer scope and short-lived credentials are designed for the bounded synthetic trial.                                                                                                                           | A separately reviewed production capture/publication configuration and credential lifecycle are still required. No master B2 key belongs in an unattended job.    |

The Linux-native transfer adapter is reusable design groundwork, not proof that
hosted export, recovery-key custody, history integration or scheduling exists.
This assessment did not inspect real credentials, account billing settings,
actual remaining allowances or the hosted source's network configuration.

## Cost and schedule constraints

GitHub documents plan-dependent included compute for private repositories and
shared consumption with other eligible work. Artifact/cache storage has its own
billing considerations. Inspect the owner's actual allowance and current CI
consumption; do not infer capacity from the repository being private or from a
generic free-plan number. See [Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions).

Budget using measured quantities:

```text
expected monthly backup compute = runs per month * measured per-run usage
required allowance = existing CI/other usage + backup compute + agreed reserve
retained storage = full checkpoint size * (retained copies + incoming copy)
                   + reserve + any additional locked/old object versions
```

These are planning estimates, not spending controls. Check the actual billing
units, account budget/stop behavior, API/transfer costs and B2 quota before live
use. A job timeout and notification do not guarantee zero charges. Do not add
payment details, enable paid overages or silently switch to a paid runner.

Proposed daily capture time remains 06:17 Asia/Manila. If encoded as UTC cron,
that is `17 22 * * *` (22:17 UTC on the preceding calendar day). This is not an
installed workflow. GitHub warns that schedules can be delayed or dropped and
run only from the default branch. A 24-hour schedule does not guarantee a
24-hour recovery point. See [schedule behavior](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

## Required engineering before live scheduling

1. **Hosted capture contract.** Define the authorized DB/Auth/object/config
   scope, a consistent capture/write-coordination strategy, supported versions,
   source identity checks and safe export credentials. Test it in owned fixtures
   before using the explicitly approved intended source. Never run restore as
   part of daily capture or apply migrations as incidental backup setup.
2. **Unattended publication and custody.** Use narrowly scoped publisher rights,
   unique object names, immutable-version receipts and integrity readback.
   Define separately recoverable encryption material and private receipt storage
   outside the ephemeral runner. Do not put keys in Kanban, logs, caches, ordinary
   artifacts or unencrypted backup objects. Do not replace the existing owner's
   Windows bridge with copied credentials. Scope any new credential adapter as
   its own reviewed change. [Actions secret storage](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)
   is an execution mechanism, not independent recovery-key escrow.
3. **Real history integration.** Record actual backup attempts and verified
   outcomes through the authorized internal recording path; retain same-ID
   reconciliation evidence if history writes fail. Connect the new workflow
   explicitly rather than weakening the synthetic worker's Docker guards.
4. **Failure and capacity behavior.** Preserve the last usable recovery set;
   report failed, pending and overdue states. Define independent missed-run
   detection because a job that never starts cannot send its own failure
   notification. No automatic bucket clearing, lock bypass or blind publication
   retry after an uncertain upload outcome.
5. **Release and execution restrictions.** Manual dispatch first on an approved
   release; minimal token permissions, reviewed pinned actions/dependencies,
   protected credentials, no untrusted PR execution with live secrets, bounded
   timeout and one capture at a time without cancelling an in-progress capture.
   Add a schedule only after manual evidence and owner decisions are accepted.

## Next bounded milestone

Prepare the hosted capture contract and runner configuration design using the
existing capture/restore invariants. The first execution check should be a
manually invoked, credential-free owned synthetic cloud trial measuring runtime,
disk and network suitability. Agree its test seam and limits before adding
tests. It must not export hosted data or generate a real-data backup receipt.
Repeat broad existing tests only if changes or a concrete failure justify it.

Before a later live manual capture, require accepted scope, named operator and
alternate, independent key/receipt retrieval, verified account budget, explicit
source access, and a new private recovery destination with a removal deadline.
Then obtain authorized isolated restore evidence before accepting scheduling.

The runner candidate remains **pending selection and feasibility verification**.
No implementation, acceptance or university policy approval is inferred from
this assessment.
