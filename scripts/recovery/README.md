# Synthetic manual recovery CLI

This first implementation is an engineering rehearsal tool. It accepts only
owned local Docker PostgreSQL fixtures with networking disabled and no bound
ports/host mounts. It cannot take a PostgreSQL URL, Supabase credentials or the
application `.env`. It is not a production backup command or a deployment gate
pass. The [deployment procedure](../../docs/BACKUP_RECOVERY_PROCEDURE.md) remains
the operational contract.

## Run the bounded rehearsal

Prerequisites: Node 22+, local Docker engine on Windows or Linux, dependencies
already installed, and this reviewed PostgreSQL image already available locally:

```text
postgres@sha256:eee6c6e1b0894fa4fe0075eb054af9fd1cf39a35321c2d4110626cfe506411fb
```

The local commands never download an image automatically. The dedicated
`synthetic-recovery` CI job explicitly pulls this exact reviewed digest before
running the dependency-free full rehearsal on Node 22/Linux. It has read-only
repository permissions, a ten-minute timeout and no application/provider
secrets. No application servers or browser sessions are started/stopped.

```powershell
npm run recovery:synthetic -- help
npm run test:recovery:guards
npm run test:recovery:cli
```

The opt-in full test owns two temporary containers, applies the repository's
actual application migrations, seeds synthetic records and fake Auth/Storage
tables, creates encrypted checkpoints and restores into its empty target. It
checks SQL results and file bytes independently through Docker/SQL/filesystem
interfaces. Only the exact fixture containers with the matching ownership label
are removed. The OS temporary folder named in the sanitized result retains the
synthetic profile, random test key, checkpoint, restored files and attempt ledger.
These files contain no hosted data or real credentials; keep all recovery material
out of Git even during manual experiments. Normal guard checks need no Docker.
The full suite now contains 16 passing cases, including one nested retained-
workspace check. Its mixed-case `Z.bin`/`a.bin` objects deliberately use an English
SQL collation; reference inventories use `COLLATE "C"` so they agree with the
CLI's permitted ASCII filesystem ordering. CI runs this full Docker suite as a
separate job instead of relying only on the three argument guards. It consumes
the repository's existing Actions allowance; no paid service is enabled or
unlimited free execution promised. Keys/dumps/restore directories are never
uploaded as CI artifacts.

## Manual interface and profile

```text
node scripts/recovery/cli.cjs capture --profile FILE
node scripts/recovery/cli.cjs restore --profile FILE --snapshot UUID
node scripts/recovery/cli.cjs verify --profile FILE --snapshot UUID
```

Use only the disposable fixture produced by the test or an equivalently owned
synthetic setup. A profile's directory is its private workspace. Its JSON has
exactly these fields:

```json
{
  "format": "biosphere-synthetic-recovery-v1",
  "owner": "a fixture-generated UUID v4",
  "sourceContainer": "full 64-character owned container ID",
  "targetContainer": "different full 64-character owned container ID",
  "image": "postgres@sha256:eee6c6e1b0894fa4fe0075eb054af9fd1cf39a35321c2d4110626cfe506411fb",
  "operator": "synthetic-rehearsal"
}
```

The workspace needs `.recovery-owner` containing that exact owner UUID,
`recovery.key` containing 32 random bytes, `configuration.json` with
`"mode": "synthetic"`, and `objects/` with exactly the five declared buckets:
`specimen-media`, `exhibit-media`, `ar-assets`, `user-avatars`,
`inquiry-attachments`. Keys and object references must agree with the synthetic
Storage metadata. Explicit empty buckets are retained. Containers must carry
`biosphere.recovery.owner=<owner>`, use the pinned image, `--network none`, only
tmpfs mounts, and database `biosphere_recovery_fixture` accessible as its
synthetic `postgres` account. Necessary fixture roles must already exist on the
target. Source and target must differ; populated targets are refused.

The CLI never creates, resets, deletes or cuts over databases/containers itself.
It never prunes a previous checkpoint or automatically removes stale locks.
After a failed restore, retain/quarantine its owned target and partial restore
directory for diagnosis; do not infer a clean retry target or use this tool to
overwrite it. A new attempt requires a deliberately prepared fresh fixture.
If the owned database is still empty but `restores/<snapshot>` already exists,
the CLI returns `RESTORE_WORKSPACE_EXISTS` and leaves its contents intact. A
populated database still returns `TARGET_NOT_EMPTY`; neither condition triggers
automatic deletion or overwriting.

## Checkpoint and result semantics

Capture uses real `pg_dump --format=custom --no-owner` and records a bounded
inventory of non-system tables, row fingerprints, sequences and a schema
fingerprint. Separate pre/post inventories detect observed source changes; this
is not a production write-freeze or concurrency proof. PostgreSQL's randomized
psql restrict guards are excluded from the schema fingerprint. The two exact
equivalent PG17 serializations of the existing FAQ status CHECK are normalized;
arbitrary expressions/casts are not stripped.

The database archive, object bytes, empty bucket inventory, configuration and
manifest are kept inside one AES-256-GCM authenticated encrypted envelope. The
format is `BSPREC01` + 12-byte random nonce + 16-byte authentication tag +
ciphertext, with `BSPREC01` also authenticated as AAD. This uses Node's built-in
crypto; it is not a new cryptographic primitive or a reviewed production key
custody design. The key is a separate file, never embedded in the snapshot.
The prototype caps each bounded read/process buffer and the package at 64 MiB,
with at most 1,000 object files; it is not a streaming large-dataset exporter.

Restore authenticates and validates all file paths and digests before its DB
write. It requires an empty owned target and uses real `pg_restore` with
`--single-transaction --exit-on-error`. After restore, actual schema, table rows,
sequence state, file lengths/digests, object references and configuration are
compared with the authenticated inventory. Source availability is not required
for restore/verify. PostgreSQL restore runs SQL from the authenticated package;
never accept untrusted archives/keys even for this owned synthetic tool.

The private `recovery-events.jsonl` ledger records attempt ID, snapshot ID,
operator, operation, UTC time and sanitized state/error code. `CAPTURED` means a
package was sealed and authenticated by readback, not a complete restore pass.
`RESTORED_VERIFIED`/`VERIFIED` require the actual restore verification checks.
Failure produces nonzero exit and `FAILED`; no raw SQL, connection strings,
object contents, key material or provider error text is printed by the CLI.
Ledger write failures cannot yield a successful result. This ledger is local,
not an append-only institutional audit store or an application Backup History
integration. Process interruption can leave IN_PROGRESS/stale lock/partial files;
no watchdog, automatic cleanup or crash-durable independent delivery is claimed.

## Coverage limits and next slice

### Owned recording adapter

The CommonJS module now exports `runRecorded(input, recorder)` and
`reconcileRecorded(input, recorder)` for an explicitly assembled synthetic
rehearsal. Importing the module does not execute the CLI. The ordinary
`recovery:synthetic` command remains local-ledger-only; no database URL flag,
application bootstrap, public write route or scheduler was added. A trusted
internal caller supplies the real default-off `RecoveryHistoryService` instance;
it must have an explicitly owned history destination, separate from the
network-disabled source/restore containers. No application `.env` is loaded by
the engine. Existing ownership/image/network/empty-target checks still execute.
The future operator bootstrap must treat FAILED, RECORDING_PENDING and
`lock: RELEASE_FAILED` as
unsuccessful command exits; this library does not alter an embedding process's
exit code or supply deployment credentials.

**Process boundary:** the engine uses synchronous Docker subprocesses (up to
60 seconds per subprocess). An async function does not make that work
non-blocking. Run this adapter only in a separate worker/standalone operator
process, with an explicitly configured recorder/provider assembly (or standalone
Nest application context) and approved history connection.
Do not invoke it from a controller, cron callback or background task hosted
inside the request-serving Nest process: that would block Curator and public
requests. A standalone application context must not start an HTTP listener.
The owned test worker may co-locate its synthetic HTTP fixture; this is not a
deployment pattern. No deployed worker is provisioned by this PR.

`runRecorded` accepts only `operation`, `profileFile` and, for restore/verify,
`snapshotId`. A capture gets a new snapshot UUID. Every execution gets a new
attempt UUID; calling `runRecorded` again means a new operation, not a retry of
an uncertain previous result. The adapter hashes the non-secret configuration
bytes and fixed owner/container/image/operator identity before recording start.
It refuses observed configuration changes before/after engine execution. This
is not a source write-freeze or protection against all concurrent filesystem
changes. Do not edit or reuse a workspace while an attempt is active.

Under the workspace's exclusive lock, it fsyncs a private
`recording/<attemptId>.jsonl` receipt containing the command and UTC time, then
records start through the internal service before running the real engine.
If start recording fails, the engine does not run. After execution, it appends
and fsyncs the distinct terminal outcome before attempting the remote finish.
The encryption-key buffer is cleared before the asynchronous finish write.
History/artifact semantics remain those in the
[recording contract](../../docs/BACKUP_HISTORY_GUIDE.md#internal-synthetic-recorder---november-6-2026).

| Result | Meaning and next action |
| --- | --- |
| CAPTURED / RESTORED_VERIFIED / VERIFIED with `history: RECORDED` | The engine outcome and its history transition both completed. CAPTURED still does not establish a successful restore. |
| FAILED / HISTORY_START_FAILED with `history: PENDING`, `execution: WITHHELD` | No engine operation ran. Retain the receipt; reconciliation records an explicit EXECUTION_WITHHELD diagnostic attempt after history service recovery. |
| RECORDING_PENDING / HISTORY_FINISH_FAILED | The engine outcome is retained locally, but its history finish was not confirmed. Reconcile the same attempt; do not rerun capture/restore as a history retry. |
| RECORDING_PENDING / OUTCOME_UNKNOWN | Only the start receipt is available. Preserve the workspace, lock and target for diagnosis; never infer a terminal outcome or automatically rerun. |
| LOCAL_RESULT_WRITE_FAILED | Local recording needs technical diagnosis. A terminal receipt may be unavailable; no automatic deletion or recovery rerun occurs. |
| `lock: RELEASE_FAILED` alongside any result | Lock cleanup failed or ownership changed. Original status/history/error code remain intact; this warning does not mean history is pending. Follow the stale-lock procedure below. |

`reconcileRecorded({profileFile, attemptId}, recorder)` validates the owned local
receipt (maximum 8 KiB/two events) and current configuration/workspace binding,
then retries only the same start/finish bookkeeping. It never calls the engine,
reads the encryption key or contacts the source/target containers. The service
rejects any conflicting pre-existing command/outcome. Missing or malformed
receipts, stale configuration, unsafe paths and an active workspace lock are
rejected. An incomplete receipt remains unknown without new terminal evidence.

New start-rejection receipts store `FAILED/EXECUTION_WITHHELD`; reconciliation
returns `execution: WITHHELD` and the finish audit retains that distinct code.
This is a failed invocation whose engine never ran, not a failed backup/restore.
History timestamps are the times of bookkeeping writes, which may occur during
later reconciliation; they are not backdated execution times. The private
receipt retains its original UTC event time. Older HISTORY_START_FAILED receipts
keep their original code on replay and gain the same withheld annotation; no
existing terminal audit/result is rewritten.

#### Stale lock and cleanup failure

1. Stop new rehearsal submissions and identify the standalone worker/job and any
   Docker/SQL subprocess for the affected workspace. Confirm they have exited
   and the source/target are quiescent. The marker contains an attempt UUID,
   **not a PID**; its age or a failed unlink is not proof that it is stale.
2. Verify the absolute workspace/profile path, `.recovery-owner` and profile
   owner. Preserve the private receipt, marker and diagnostic output. Read the
   marker and identify that exact attempt's receipt. If ownership changed or an
   active worker/another operator cannot be ruled out, leave it untouched and
   involve the technical owner. Do not clear it merely to bypass RUN_LOCKED.
3. Only after those checks and explicit operator clearance, re-read the marker
   and remove **only** that verified `.recovery-lock` file using its exact literal
   path. Stop if its bytes changed since inspection. Never recursively delete
   the workspace, remove a different attempt's live lock, clear checkpoints or
   reset the restore database. There is no automatic stale-lock takeover.
4. For a valid terminal receipt, call `reconcileRecorded` with the same attempt
   ID. An already-recorded outcome is an idempotent replay; no engine operation
   is needed. If only a start receipt exists, preserve/quarantine the target and
   diagnose the unknown result. Do not invent a terminal outcome or rerun restore.

The standalone CLI and adapter use the same acquire/release ownership checks.
The CLI emits one JSON result and exits unsuccessfully for a cleanup warning;
the embedding caller must apply the same rule to adapter results.

#### Original configuration required for reconciliation

Reconcile pending receipts **before editing configuration**. Keep a private,
byte-identical copy of the approved non-secret `configuration.json` with each
workspace's diagnostic records; retain newer configuration separately.
Reconciliation binds to that original hash and deliberately has no override.

If configuration was edited, first stop workers and establish quiescence as
above. Compare the SHA-256 of the retained original bytes with the receipt's
`command.configurationFingerprint` (for example, use `Get-FileHash` on Windows).
Restore those exact bytes temporarily only in the verified owned workspace,
reconcile the same attempt, then restore the newer configuration before any new
run. This changes no restored database or object bytes; reconciliation never
calls the engine. Do not normalize line endings or edit a receipt/hash to make
it match. If the original bytes are unavailable or ownership/source identity
changed, keep the history pending and seek an explicitly authorized technical
remediation; this prototype supplies no automatic history rewrite or forced
completion.

Receipts are trusted local diagnostic records, not signed/tamper-evident proof
or a disaster-independent institutional audit store. File fsync does not prove
directory/power-loss durability, Windows ACL restriction, process-crash recovery
or missed-run alerting. No receipt, key or restored bytes are uploaded by this
slice. Keep receipts private and do not accept externally supplied receipts.

The approved integration boundary runs explicitly on Windows Docker Desktop or
the Linux CI runner's fixed local Docker socket:

```powershell
npm run test:recovery-recording:db
```

It owns three separate PostgreSQL containers: a real recorder/history database
with synthetic authentication, and network-disabled source/target fixtures with
minimal stand-in Auth/audit/schema scope. It verifies actual capture/restore,
start/finish SQL audit failures, same-ID reconciliation, populated-target refusal,
incomplete/stale receipts, workspace locking and option/configuration guards.
It is not the full public-migration rehearsal from `test:recovery:cli`, nor a
Supabase platform recovery or deployed operator workflow.

The synthetic-recovery CI job now runs the full CLI suite plus both owned
recorder/adapter database suites against the pinned image. Only the two recovery
profiles gain Linux support in the shared fixture helper; other profiles keep
their existing platform restrictions. No environment-provided Docker host or
database destination is accepted.

The separate `test:recovery:cli` fixture includes the actual public schema/migrations plus representative
Auth-to-account mappings, retained audit rows, lot quantity and offline receipt
identity. Auth tables are deliberately simplified stand-ins: this does not
prove Supabase Auth sign-in/session/token/encryption compatibility. Object bytes
and bucket metadata are synthetic local files, not a real Supabase Storage
upload/access/RLS rehearsal; the fake image/model bytes are not renderability
tests. PostgreSQL global roles/ownership, real secrets, SMTP, external providers
and full application workflows are not recovered by this prototype.

Next work is an approved operating destination/custody and result delivery/watchdog,
then real provider adapters and a complete isolated Supabase-compatible
rehearsal. Approved independent storage/key custody, restrictive Windows ACLs,
streaming, source write-freeze/drain, retention, scheduler/missed-run delivery,
operator approval and reviewed full-service recovery remain deployment gates.
No paid service or hosted export is enabled here. BAK-002 remains Deferred.

### Standalone synthetic worker

`scripts/recovery/worker.cjs` is a real, short-lived command process. It reuses
the compiled Prisma/recording providers directly, without AppModule, dotenv,
controllers, an HTTP listener, email or a scheduler. Build/install it in a
**separate worker checkout**, not the directory whose dist/ is serving the API.
Do not let a build overwrite a running backend's output.

After installing the locked dependencies and building that checkout, inspect
the command without connecting to anything:

```powershell
npm run recovery:synthetic:worker -- help
```

For an explicitly prepared, still-running owned synthetic lab:

```powershell
npm run recovery:synthetic:worker -- capture --profile "<owned-workspace>/profile.json" --history "<owned-workspace>/recovery-history.private.json"
npm run recovery:synthetic:worker -- restore --profile "<owned-workspace>/profile.json" --history "<owned-workspace>/recovery-history.private.json" --snapshot <snapshot-uuid>
npm run recovery:synthetic:worker -- reconcile --profile "<owned-workspace>/profile.json" --history "<owned-workspace>/recovery-history.private.json" --attempt <attempt-uuid>
```

`verify` takes the same flags as `restore`. UUIDs must be the exact returned
identities. Reconciliation starts a fresh process and retries bookkeeping only;
it is not a second capture/restore. Never replace it with a new run as a retry.

The private history manifest is generated by the owned rehearsal setup, not
copied from `.env` or filled with a Supabase connection. Its exact five fields
are `format` (`biosphere-synthetic-history-v1`), `owner` (UUIDv4), `containerId`
(full Docker identity), `port` (inspected loopback binding) and `password`
(generated synthetic secret). It must be named `recovery-history.private.json`
beside the owned profile, be a regular non-symlink file at most 4 KiB, and have
no group/other permissions on Linux. It is ignored by Git. Windows ACL privacy
is not established by Node file modes; this prototype uses synthetic credentials
only. Never publish this file, keys or checkpoint/restored bytes.

Before constructing a database client, the worker verifies the fixed local
Docker socket, exact owner label, pinned image, running/non-paused container,
temporary data storage with no bind/persistent mounts, log driver and a single
matching 127.0.0.1 port. Source, restore target and history container identities
must be distinct. The history database/role are fixed to the owned fixture's
`biosphere_recovery_recording_disposable` / `service_role`; no database URL or
remote host flag is accepted. Application/provider environment values are
stripped before loading the recording runtime; all required configuration is
provided explicitly. This is accidental-target protection in a trusted lab,
not authentication of an untrusted operator or a hostile Docker host.

The worker creates no database, role, schema or container and applies no
migration. It requires a prepared owned lab, current compiled providers and
reviewed synthetic source/target profiles. It does not provision an official
backup destination or authorize a hosted export. The rehearsal test helper's
manifest expires when its temporary history container is removed; retained
diagnostic files do not represent a reusable live database or institutional
backup service.

Output is one JSON result, with a diagnostic worker PID and no credentials or
connection strings. Exit 0 requires a confirmed successful recorded operation
(or help). Failed, unknown/pending recording, lock-release warnings and history
disconnect warnings exit nonzero without overwriting an already known engine
outcome. Use the receipt and the same-ID reconciliation/lock/configuration
procedures above; never automatically rerun restore. A missing build returns
WORKER_BUILD_REQUIRED; no application server is started to compensate.
Record the launching process/job identity separately; the final PID output is
not proof that an old lock is stale or that a crashed operation never ran.

For a reproducible owned rehearsal that creates its own source/target/history
containers, runs actual child commands and removes only those containers:

```powershell
npm run build
npm run test:recovery-worker:db
```

The nine cases check real capture/restore and protected history readback,
actual child PID separation, inherited destination rejection/ignoring,
wrong-owner/port/identity/extra-URL manifest refusal, argument rejection, nonzero
engine-failure exits, malformed source identity rejection, and pending-finish reconciliation in a fresh process with
unchanged checkpoint bytes/count and exactly two transition audits. The test's
fixture is synthetic and minimal; it proves neither Supabase Auth/Storage
compatibility, API capacity under load, process/power-loss recovery, real key
custody nor an approved deployed backup schedule. The Linux recovery CI job
builds the worker and runs this suite after the existing 52 recovery checks.

The next full-service slice has a [Supabase lab preflight and execution order](../../docs/SUPABASE_RECOVERY_LAB.md).
Its November 7 launch was withheld for low host-memory headroom and unresolved
platform-version selection. No real Auth/Storage smoke or recovery pass follows
from the raw PostgreSQL worker results.

References: [PostgreSQL pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html),
[pg_restore](https://www.postgresql.org/docs/17/app-pgrestore.html),
[Node authenticated encryption](https://nodejs.org/docs/latest-v22.x/api/crypto.html).
