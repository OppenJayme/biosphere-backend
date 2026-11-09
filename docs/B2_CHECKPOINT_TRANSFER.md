# Isolated encrypted checkpoint transfer

Prepared November 9, 2026. This is an engineering component for the existing
owned synthetic recovery lab, not a deployed backup job or approval to export
museum data. It extends the [durable checkpoint contract](./SUPABASE_RECOVERY_LAB.md)
without changing its encrypted format. The separate
[retention probe](./B2_RETENTION_RUNNER.md) remains a one-file provider experiment;
its review/acceptance does not automatically accept this component.

## Implemented boundary

`scripts/recovery/b2-checkpoint-transfer.cjs` exports two asynchronous functions:

- `publishCheckpoint({ checkpointDir, keyDir, target, session, request })`
- `recoverCheckpoint({ keyDir, destination, target, session, request })`

Both require an explicit trusted HTTP adapter. There is no default network
adapter, CLI, `.env` reader, DPAPI packet consumer, scheduler, application route
or production worker connection. Importing the module performs no I/O. The
tests use an in-memory synthetic B2 HTTP implementation, not a provider account.
This component does not authorize a session: `session` is a supplied Native API
v4 authorization response whose scope, expiry and destinations it validates.

`target` has exactly `accountId`, `bucketId`, `bucketName`, `runId` and
`namePrefix`; extra fields are refused. The prefix must be the dedicated
`synthetic/retention-<run UUID>/` scope. Target values are copied before HTTP so
later caller mutations cannot change the validated destination. A private
bucket, readable/enabled Object Lock, unset default retention and no lifecycle
rules are checked before publication and recovery downloads.

The supplied writer session must have exactly `listBuckets`,
`readBucketRetentions`, `readFileRetentions`, `readFiles`, `writeFiles` and
`writeFileRetentions`. Recovery also accepts the read-only four-capability
profile. Deletion, bypass, bucket administration and extra capabilities are
rejected. These remain temporary synthetic profiles, not approved production
credentials. At least ten minutes of a maximum six-hour key lifetime must remain.

## Publication and durable evidence

The existing loader first verifies the local committed checkpoint with its
separate key and verification material. Only the lab's full-profile v3 format is
accepted. That marker does not prove data classification or institutional
permission; the component has no hosted-source capture operation. It uploads
only encrypted `checkpoint.bsp`, never the recovery key or private verification
file. The existing 64 MiB encrypted checkpoint limit remains the ceiling; it is
not measured museum capacity or permission for a live upload of that size.

The new object name contains the immutable artifact UUID. Its per-object mode
is Governance, with a deadline 24 hours after local intent. Both documented
Native upload-URL forms are validated without following redirects or changing
the returned URL. The upload response and later metadata must identify the
same bucket/name/version/length/SHA-1/retention. Readback uses only the captured
file ID and checks the complete encrypted SHA-256, not a latest-name lookup.
Before marking publication verified, the loader rechecks the committed local
checkpoint and its separate recovery material. A key/proof change during HTTP
cannot turn a byte-identical upload into a successful recovery claim.

Immediately before upload, an exclusive create reserves
`b2-transfer.private.json` in the separate key directory. It records intent,
then the returned file ID, then verified readback. Two publishers for that
directory can reserve only one attempt. Updates write/fsync a private temporary
file before rename. This is process-level crash/retry protection, not proof of
survival under power loss or an atomic remote commit.

The receipt holds restricted provider/object references and checkpoint metadata,
but no provider token or raw key. It is authenticated with HMAC-SHA-256 using a
domain-separated HKDF-derived key; it is **not encrypted**. Keep it private with
the recovery material. Its filename is Git-ignored. Changing its version ID or
using the wrong recovery key fails authentication before any HTTP operation.

Failure before attempt reservation permits an explicit retry. Once the upload
may have been sent, a timeout or malformed response preserves intent and blocks
another publication. Do not delete the receipt to force a rerun. Intent without
a file ID needs separately authorized provider reconciliation; no file-listing,
cleanup, retry or key-creation operation is implemented. A returned file ID with
failed readback remains `uploaded`; explicit recovery can validate that version
without creating a second object. It does not silently rewrite publication state.

## Recovery and the separate package

The independently retained package needs all of:

| Local material | Purpose |
| --- | --- |
| Key-directory `.owner.json` | Bind the existing owned lab workspace identity. |
| `recovery.key` | Authenticate the receipt and decrypt the checkpoint. |
| `recovery-verification.private.json` | Supply the expected private proof whose digest is bound inside the encrypted checkpoint. |
| `b2-transfer.private.json` | Locate the exact remote version and retain authenticated checkpoint metadata. |

This is a file dependency list, not demonstrated institutional escrow or a
portable key-custody solution. A graduating student's only local copy is still
a single point of failure. None of these files is uploaded by this component.

Recovery refuses an existing destination or any target overlapping the key
directory. It downloads and checks the captured version before creating the new
target. The target stays marked with `.capture.lock` while staged files are
validated by the unchanged public `loadCheckpoint` interface. Only after that
loader authenticates the payload and its private verification material are the
files committed and the incomplete marker removed. A failed recovery keeps a
locked target for review; it does not overwrite or delete an existing target.

`B2_CHECKPOINT_PUBLISHED` confirms encrypted-byte readback at this component
boundary. `B2_CHECKPOINT_RECOVERED` confirms a loader-validated local checkpoint.
Neither means that PostgreSQL, Auth or Storage services were restored or that
the recovered application passed acceptance. Success results always have
`deploymentAuthorized: false`. Errors expose static codes and, for publication,
whether an upload may exist; raw adapter/provider errors are suppressed.

## Adapter obligations and remaining live work

The trusted `request` function accepts URL/method/headers/body plus
`timeoutMs: 20000`, `maxResponseBytes` and `followRedirects: false`, and returns
`{ status, headers, body: Buffer }`. It must enforce transport timeouts,
response-size limits and no redirects before returning. The engine checks
buffer sizes afterward; it does not itself cancel a hung adapter or provide a
streaming download cap. The adapter must not log tokens, bodies or private IDs.
No external adapter code is loaded from a path or environment variable here.

The separate [native HTTPS adapter](./B2_NATIVE_TRANSPORT.md) now supplies a
prepared implementation of these limits. It has its own mocked-stream evidence
and requires explicit caller wiring; it is not an automatically enabled transport
or a demonstrated live provider connection.

Still required before live use: a reviewed native HTTP adapter and credential
bridge, explicit destination/cost authorization, live permission/retention
evidence, measured capacity, independent recovery-package retrieval and a
reviewed full service restore. Routine credentials, intended-source capture,
freeze/drain controls, scheduling, alerts and institutional acceptance remain
separate. No Gate C/D/E or BAK-002 status is promoted by these tests.

## Tests and observed compatibility correction

```powershell
node --test test/b2-checkpoint-transfer.test.cjs
```

November 9: 29 checks passed with zero skipped on Windows Node 24.7.0 and
22.14.0. They use synthetic files, the real checkpoint encryption/loader and
mocked HTTP. Cases cover source-file loss, exact-version recovery, read-only
recovery, separate material, unknown uploads, explicit pre-upload retry,
authenticated metadata, corruption, scope rejection, existing targets and two
publishers racing one exclusive receipt. The latter is local-file/mock-provider
evidence, not live provider/distributed concurrency.

The Node 22 run initially failed before any transfer: Windows path `lstat`
reported device zero while opened-file `fstat` reported the real device. Both
file readers now tolerate that unknown-device comparison only on Windows,
retaining exact BigInt inode/size/link-count checks. A one-inode change was
also lost by Number rounding before correction; both public interfaces now
reject it. Different known device IDs still fail on every platform. The combined
transfer/store suite passed 40/40 on both runtimes. Pushed-head Linux/Windows CI
is recorded separately in the PR. No real B2 key, hosted record, database
service or running application is used by this suite.
