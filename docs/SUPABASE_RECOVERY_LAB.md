# Supabase recovery lab: preflight and next execution

Date: November 7, 2026. Scope: synthetic data only. Engineering base:
`bf6ea48948c31fd5e81d9303234528842c4a74c6` (standalone worker, PR #251).

**Status: local containment, reduced Auth/Storage smoke and the bounded
Auth/Storage restore scenario passed.**
The initial launch was withheld until capacity and version checks were resolved;
that history follows below. Complete BioSphere recovery has not been tested.
This is a lab engineering record, not a BAK-002 pass or a deployment approval.

## Authorization and observed environment

The user authorized containment preflight followed by real local Auth sign-in
and Storage upload/download with synthetic data in a fresh owned lab. The
existing Supabase stack and installed CLI must remain untouched. No hosted
export, shared migration, real email or operational scheduler is authorized.

Read-only checks used the fixed local Docker Desktop Linux-engine named pipe,
container names/image inventory, image identity inspection, Docker capacity and
Windows available memory. No container environment, credentials, application
`.env`, project login or hosted service was read.

| Check | Observed result | Disposition |
| --- | --- | --- |
| Windows memory | About 1.4–1.5 GiB available of 23.7 GiB; repeat Node OS sample: 1,559 MiB available | Insufficient headroom for this full-service rehearsal; no launch |
| Docker engine | Linux, 20 logical CPUs, 12,376,518,656 bytes configured memory | Configured VM capacity is not evidence of available Windows memory |
| Existing services | Ten running `supabase_*_next-swc-sp` containers | Unrelated stack; preserve all containers, networks, volumes, ports and credentials |
| Installed CLI | Supabase 2.0.0 | Not upgraded or used to start a project; update notices do not verify compatibility |
| Cached Supabase PostgreSQL | `15.6.1.139` | Different major version from the PostgreSQL 17 synthetic worker; not a selected compatible restore target |
| Cached Auth / Storage / REST | GoTrue `v2.164.0`, Storage API `v1.11.13`, PostgREST `v12.2.0` | Inventory only; no claim that this older combination is current, supported, secure or source-compatible |
| Intended source versions | Not queried | No hosted compatibility claim; synthetic lab version selection is still required |

Cached image IDs observed (not a release lock file or approval to launch):

```text
postgres:15.6.1.139  sha256:7d911961e145550c4a20b56fc3fc8eff51dceafeeaf24f76f9d23a256e133ca8
gotrue:v2.164.0     sha256:f8b871f46f3f9c5306af00d2fb856fb5479db730bb6d4fd2757b2da8abe953f9
storage:v1.11.13    sha256:1e85dad48e8b3e85890a555e5114dc7ee48c2e8be4cfd97dd4e3564b4f104fcd
postgrest:v12.2.0   sha256:2cf1efd2c9c2e7606610c113cc73e936d8ce9ba089271cb9cbf11aa564bc30c7
```

Supabase's [Docker self-hosting guide](https://supabase.com/docs/guides/self-hosting/docker)
lists 4 GB RAM as the minimum for all components and permits removing unneeded
services to reduce resource requirements. For this rehearsal, use a conservative
**5 GiB free-host-memory launch threshold**: a 4 GiB lab budget plus 1 GiB host
reserve. This threshold is a local engineering policy, not a provider guarantee
or a measured minimum for a reduced stack. A reduced configuration needs its own
documented resource budget before changing that threshold. Recheck immediately
before launching; earlier samples expire as other applications consume memory.

Do not stop existing services to satisfy the threshold automatically. Free
unneeded desktop resources or use a separately approved suitable machine.

The standalone **containment-only** command has a separate reduced budget:
two Node probe/counter containers, each capped at 128 MiB with memory-swap equal
to memory, one CPU and 256 PIDs. No database/Auth/Storage server runs in this
command. Require **3 GiB free host memory**: 256 MiB container allowance plus
1 GiB host reserve and 1.75 GiB additional engine/cache headroom. This is a
resource-bounded HTTP/network check, not a reduction of the 5 GiB full-service
launch threshold. Memory is rechecked at execution; images must already be
cached, and this command never pulls or builds images.

The reduced **Auth/Storage smoke** command requires **4 GiB free host memory**.
It adds only PostgreSQL (768 MiB), Auth (256 MiB), Storage (512 MiB) and REST
(128 MiB) to the two 128 MiB probes: 1,920 MiB maximum combined container
memory, with swap disabled beyond those caps. The remaining 2,176 MiB of the
launch budget reserves 1 GiB for the host and 1,152 MiB for engine/cache
overhead. Database data and object bytes use bounded tmpfs inside those caps.
It omits Studio, gateway, Realtime, image transformation, functions, pooler and
analytics. Services publish no ports; real HTTP requests run inside the owned
network probe, with HTTP request payloads passed on stdin and responses kept in
process memory. This is not a claim that every credential uses stdin: generated
database passwords and JWT/service configuration also enter Docker argv and
container environment, visible to local process listings and Docker inspection
while the lab runs. These are synthetic, short-lived lab values only; this
pattern must be redesigned/reviewed before real credentials or data are used.
Only the outside counter has a loopback host port. In-network service
requests do not prove a complete platform,
gateway integration or recovery. The full recovery rehearsal retains its
5 GiB policy until separately budgeted. Neither command lowers thresholds
automatically or accepts a bypass flag.

### Follow-up preflight on November 7

After the user closed unused applications, available Windows memory increased
to **2,569 MiB**. Docker was available and the same ten unrelated containers
were still running. This remains below the 5 GiB launch threshold. No service
was launched or stopped.

The official documented release `self-hosted/v0.8.4` was resolved with public
`git ls-remote`. It is an annotated tag: the tag object is
`3f8e6c2e2bdca35bd6eacc8b7782aa73acb58ebc`, and its underlying source commit is
**`189adda99d1b56da55fc5a6ee3f849354aaea92a`**. Fetch source files by the
underlying commit; using the tag-object hash as a raw source revision returned
404 and was not accepted as a successful source check.

The [pinned official configuration](https://github.com/supabase/supabase/blob/189adda99d1b56da55fc5a6ee3f849354aaea92a/docker/docker-compose.yml)
selects PostgreSQL `17.6.1.136`, GoTrue `v2.197.0`, Storage `v1.89.12` and
PostgREST `v14.18`. Public registry manifest reads verified their Linux/amd64
child digests and index digests, recorded in
[the candidate image lock](../scripts/recovery/supabase-lab-images.json).
The Compose UTF-8 SHA-256 is recorded there as well. No image was pulled.

This selects a coherent upstream **candidate** for the four core services,
not a tested complete lab or a security certification. Gateway/sink/probe
images, startup SQL, mounts, secrets, reduced-service dependencies, network
configuration and resource caps still need review and immutable pins before
launch. None of the upstream Compose startup commands may be run as-is: its
default names, published ports and mounts are not the isolated lab contract.
Matching PostgreSQL major 17 does not prove compatibility with BioSphere's
hosted platform or remove the managed-schema restore issue below.

## Execution order after prerequisites pass

1. **Select one coherent platform release.** Record an immutable official
   Supabase Docker configuration commit, all selected image digests, PostgreSQL
   major and platform migration versions. Review its configuration and startup
   SQL before executing it. Do not combine the old cached images with a newer
   Compose file or change the installed CLI. Pulling images and compatibility
   checks must finish before starting services. Do not treat an image tag or a
   CLI update notice as a pinned release.
2. **Prepare a separate owned lab.** Generate a unique owner ID, project name,
   credentials and JWT material. Use a dedicated internal network, explicit
   resource caps and private lab-only storage. No existing networks, application
   directories, Docker socket mounts, hosted URLs, default demo keys or real
   credentials inside services. Any host endpoint must bind only to loopback
   on a verified free port. No default `supabase start` or linked `db dump`.
   Default CLI `db dump` can target a linked project; it is not a safe lab
   capture command.
3. **Prove containment before creating application fixtures.** Inspect actual
   network membership, port bindings and mounts against the exact owner record.
   Exercise the intended loopback path. Use a synthetic request counter outside
   the lab network to verify that attempted outbound HTTP is blocked and leaves
   its count unchanged; combine that observation with internal-network and
   network-membership checks. An HTTP counter alone does not prove all-protocol
   egress isolation. Auth email delivery must be disabled, or point only to an
   owned internal sink with no forwarding. Fail closed on any unexpected route,
   binding, mount, container identity or external destination.
4. **Exercise real service boundaries.** Create one generated synthetic Auth
   identity through the local service, sign in with its password and read its
   user identity. Upload known synthetic bytes into a private Storage bucket;
   verify authenticated download bytes and anonymous denial. Use real platform
   schemas/services, not the minimal stand-in Auth/Storage fixture from #251.
   Keep tokens, passwords and raw service logs out of checked-in evidence.
5. **Implement the platform-specific recovery adapter.** Rehearse capture of
   database data, Auth state, Storage metadata **and object bytes**, plus the
   required compatible configuration and key custody. Restore only to a new
   owned target. Supabase initializes managed roles/schemas: the existing raw
   PostgreSQL worker's whole-database-empty guard will reject that target.
   Keep that guard; define and review a separate managed-platform restore
   contract rather than bypassing it or running `pg_restore` over populated
   managed schemas. Existing #251 success does not establish this adapter.
6. **Verify recovery independently.** Make the source unavailable, then verify
   restored database contents, existing synthetic user's password sign-in and
   identity, private object byte equality and anonymous denial against the
   target. Record platform versions, source/target identities, checkpoint hash,
   timings, expected/actual results, failure evidence and exact coverage. Auth
   and Storage smoke checks alone do not satisfy this recovery step.
7. **Clean up exact owned resources only.** Validate full IDs and owner labels
   immediately before removal. Preserve sanitized evidence and record any
   failed cleanup. Never use global Docker prune, name-prefix deletion or
   commands against the unrelated stack. Do not delete retained recovery
   evidence, shared records or the user's browser sessions.

## Remaining gates and handoff

### Completed local checks on November 7

The four selected core images were pulled by their Linux/amd64 digests. The
existing CLI and unrelated running stack were unchanged. Two public CLI cases
exercise real Docker/network and service HTTP interfaces:

- `containment`: a loopback-published outside counter accepts one control hit;
  the private-network probe cannot reach it and adds zero hits. Inspect checks
  establish internal network mode, single-network membership, immutable image
  identity, exact memory/swap/CPU/PID caps, no privileged mode or bind/persistent
  mounts, and loopback-only publication for the counter.
- `smoke`: containment passes before PostgreSQL/Auth/REST/Storage start. A
  generated user is created with confirmed email through the real Auth admin
  API, signs in with its generated password, and reads back the same identity.
  A private bucket accepts an authenticated upload under owner-scoped RLS;
  authenticated download equals the known input bytes, and an anonymous JWT
  is denied. Services have no published host ports. Email signup is disabled;
  password login remains enabled, admin creation confirms email, and SMTP is
  fixed to the Auth container's own loopback port 1. No real email is requested.

Both commands inspect exact IDs and owner labels before removing only their
own containers/networks, report cleanup status, and exit nonzero on failure or
incomplete cleanup. Credentials/JWTs stay generated and in memory/container
environment; API request secrets cross into the probe on stdin. No credentials
or raw logs are written to checked-in evidence. Database data and object bytes
are tmpfs; required public image configuration stays in the disposable
container layer. Cleanup does not remove cached images.

Final local combined run: **2/2 passed, zero skipped**, about 28 seconds,
including deliberately invalid inherited database/provider/Docker/proxy
destinations. Docker child processes receive only OS environment values and
the fixed local socket. Proxy environment entries are explicitly cleared on
container creation and checked afterward so Docker CLI proxy configuration
cannot inject host proxy credentials into the lab. Focused CJS lint, syntax,
local documentation links and `git diff --check` also passed. These are local
results, not an independent reviewer or CI execution claim.

The first containment case failed because the command did not yet exist, then
passed after implementation. The smoke case first rejected its unimplemented
command, then exposed these **new harness setup issues**, all corrected before
the successful service check:

1. Empty tmpfs over `/etc/postgresql-custom` hid required image configuration
   includes, so PostgreSQL exited. Keep those image files; only data needs the
   database tmpfs. The pinned image's public entrypoint, initialization SQL and
   migration script were inspected via an exact owned stopped review container,
   which was removed afterward.
2. A socket `SELECT 1` observed the temporary initialization server. Readiness
   now uses authenticated loopback TCP and the image's `supabase_admin` role,
   waiting for the final server before configuring service roles.
3. Published endpoints on the internal network did not provide the expected
   host binding. Auth/Storage now publish no ports at all; real HTTP requests
   execute from the owned internal probe. No second external network was added
   to make them reachable.

Memory refusals produced `INSUFFICIENT_HOST_MEMORY` before resource creation.
Failed setup attempts reported complete owned cleanup. These observations are
test-harness findings, not evidence of a BioSphere production defect or a
change to shared database data.

### Running and limits

On a reviewed Windows Docker Desktop/Linux-engine or Linux x86_64 host, first
pull each immutable `image` reference from the candidate JSON for `linux/amd64`.
The command never pulls, builds or upgrades images automatically. With 4 GiB
free host RAM and the cached images, run:

```powershell
npm run test:recovery:supabase
```

Or, without application dependencies:

```powershell
$env:RUN_SUPABASE_LAB = 'true'
node --test test/supabase-lab.test.cjs
```

`node scripts/recovery/supabase-lab.cjs containment` needs 3 GiB; `smoke` needs
4 GiB. There are no supplied URL, credential, Docker-host or threshold flags.
The fixed local socket and an OS-only child environment ignore inherited
application/provider destination settings. This protects a trusted disposable
lab from accidental target selection, not from an adversarial Docker host or
repository editor. Only Windows Docker Desktop execution was observed here;
Linux execution remains for independent verification. The heavy suite is opt-in
and has not been added to CI as a claimed Linux pass.

Normal failure cleanup was observed; host/process crashes, forced termination,
power-loss cleanup, SMTP-provider behavior, gateway/browser integration and
all-protocol egress testing are not established. If a process is forcibly
terminated, inspect remaining exact IDs/owner labels before manual cleanup;
never use global prune or prefix deletion. A resource refusal is an unexecuted
test, not a skipped acceptance pass.

### Subsequent same-version Auth/Storage restore

The `recover` command adds a separate managed-platform **fixture** recovery
contract. The first public CLI case rejected the unimplemented command before
implementation. The implemented focused restore case then passed locally.
It requires **5 GiB free RAM**, the same four cached image digests, and the
existing containment preflight. Source and target run sequentially; no second
live stack is kept concurrently. It changes no raw worker/recorder code.

1. Initialize an owned source and create only the known synthetic user,
   owner-scoped RLS policies, private bucket and known object used by smoke.
2. Freeze Auth/REST containers and the Storage server process. Capture an
   explicit custom `pg_dump` of Auth/Storage **data**, excluding each service's
   migration ledger and the listed transient session/token/challenge/flow
   tables. Preserve account identities/password hashes but require fresh
   authentication. Capture physical object bytes separately. Compare source
   schema and table-count inventories before/after capture.
3. Authenticate/encrypt a bounded in-memory checkpoint with AES-256-GCM,
   including platform pins, schema fingerprint, retained-data inventory,
   database archive and object archive, with no source signing-secret field.
   A deliberately changed
   ciphertext byte must fail authentication before target construction/writes.
4. Stop and disconnect every source service. Inspect their stopped/disconnected
   state and verify that the source Auth endpoint is unreachable from the
   probe. Initialize a **new** same-version target with a fresh DB password,
   a new target-specific JWT signing secret and target-local URLs.
5. Freeze target applications, require its complete Auth/Storage table-count
   inventory to equal the fresh source baseline, recreate only the two known
   fixture RLS policies, and require an equal normalized schema fingerprint.
   Restore data transactionally with `pg_restore --single-transaction
   --exit-on-error`, keeping foreign-key triggers enabled. A real orphaned
   Storage insert must fail with a foreign-key violation inside a rolled-back
   probe transaction. Preserve the target's platform-managed
   DDL/migration history; do not drop schemas or weaken the raw worker guard.
6. Restore physical bytes in the target Storage mount, verify schema/count
   inventories (excluded transient tables must be empty), resume target apps,
   reject the old source-issued access and refresh tokens, and require a new
   password sign-in. Verify the same user ID, exact private bytes and the exact
   pinned anonymous-denial response through the real APIs. Confirm
   source services remain stopped; remove exact owned resources afterward.

An implementation run recovered Auth but failed file download: Docker's archive
copy saw only `./` for the paused tmpfs mount. A database-only success therefore
was **not** counted as recovery success. Physical capture/restore now uses `tar`
inside the Storage mount namespace while its server PID 1 is SIGSTOP-frozen;
auxiliary exec can access the real mount. The harness checks `/proc/1/status`
for the stopped state and refuses an archive missing the known `probe.txt`.
The archive check matches a whole filename component on a non-directory entry
in the pinned backend's nested tenant/bucket/version layout; suffixes such as
`probe.txt.tmp`, prefixes and a directory without payload do not pass.
Auth/REST stay Docker-paused during this operation. The server is resumed with
SIGCONT only after restoration. The repaired end-to-end case passed with the
source unavailable and complete owned cleanup.

Run `node scripts/recovery/supabase-lab.cjs recover` for this case, or
`npm run test:recovery:supabase` for all three cases. The full suite now needs
5 GiB free host RAM. No supplied target/URL/key/profile is accepted.

Final combined local result: **3/3 passed, zero skipped**, approximately
73 seconds (restore 47 s, source smoke 19 s, containment 6 s). The focused
restore case also passed independently. Invalid inherited provider/database/
Docker/proxy settings remained present in the child environment. Syntax,
focused CJS lint, local document links and diff checks passed. No CI or
independent Linux/reviewer execution is implied by these local results.

**Limits:** this checkpoint/key exist in one process's memory, not a persistent
recoverable institutional backup or restart/custody mechanism. No retained
encrypted artifact, disk durability, source crash, independent-key recovery,
large-file streaming or scheduled operation is established. This is a fixed
same-version synthetic Auth/Storage recipe, not a general schema/role migration
adapter. Schema compatibility and fresh-data guards are implemented; deliberate
nonempty-target and alternate-version negative cases have not been exercised.
The tested platform has no BioSphere public tables, all five project buckets,
AR/browser workflow or deployed Auth configuration. Linux/CI and independent
verification remain unclaimed. BAK-002 and full Gate B therefore stay open.

**Next:** integrate a durable encrypted checkpoint and the complete synthetic
BioSphere database/bucket/configuration set, then run the application-level
restore rehearsal. Intended-source rehearsal and operating approval remain
separate. This subset pass must not be relabelled complete system recovery.

### Review reconciliation for #252, including merged #253

#253 was merged into #252, not directly into develop. Its review findings
therefore apply to this branch. The original restore pass above did not prove
the procedure's reauthentication rule: a new regression actually observed a
source-issued token still being accepted by the restored target. That run
failed and was not counted as policy-compliant acceptance.

The corrected v2 fixture checkpoint omits the source signing-secret field and
transient Auth state listed in `REAUTH_TABLES`. A fresh target generates its own
secret; old source access/refresh tokens must fail before a new password sign-in
is verified. Retained account identities, object ownership and bytes stay
unchanged. This tests the password-based fixture, not every OAuth/MFA/provider
recovery scenario. No shared Auth records or real credentials are modified.

Restore no longer disables triggers. Native foreign keys run during the
single-transaction restore; a real orphan insert is rejected and rolled back
before restoring. AES key-buffer cleanup is in `finally`, including failure
paths; this is not complete JavaScript-memory erasure or custody proof.
Archive checks recognize whole filename components on non-directory entries.

Pinned Storage v1.89.12 returns HTTP **400** with JSON
`{"statusCode":"404","error":"not_found","message":"Object not found"}`
for the anonymous request to the same object URL just read successfully with
authentication. Both smoke and restore now require that exact contract.
Malformed responses, route errors and unrelated authentication errors do not
count as the expected RLS-hidden-object result.

Final local review run: **9/9 native response/archive contracts and 3/3 real
owned service workflows passed, zero skipped**. Native contracts are included
in normal CI; real service execution remains opt-in and locally verified only.
The develop merge retains #251's build/marker safeguards and both acceptance
checkpoint sections. Recheck CI and review on the new #252 head before merging;
approval at 31ef817 does not cover these subsequent restore/security changes.

Gate B remains partial until complete isolated synthetic recovery succeeds.
Intended-source access/export, institutional custody and operating decisions,
deployed scheduling and incident cutover remain separate in
[the approval record](BACKUP_RECOVERY_APPROVAL.md). Neither this authorization
nor an engineering PR closes those gates. A second reviewer must assess the
actual completed evidence; no university approval process is invented here.

## Durable synthetic checkpoint across separate processes

This opt-in extension addresses the earlier in-memory limitation. It remains
a same-version synthetic Auth/Storage lab, with no hosted source, application
`.env`, supplied service destination or production restore command.

Run `npm run test:recovery:supabase:files` for native disk, fresh-reader-process
and real CLI rejection checks. These need no services. Run
`npm run test:recovery:supabase:durable` for the owned real-service workflow;
this requires the pinned images, Docker and at least 5 GiB free host RAM.
Run it sequentially with the original service suite, not concurrently.

For manual rehearsal, `node scripts/recovery/supabase-lab.cjs checkpoint-init`
creates two owned temporary directories and prints their paths. Pass those
exact paths to separate invocations:

```text
node scripts/recovery/supabase-lab.cjs checkpoint-capture --checkpoints <checkpointDir> --keys <keyDir>
node scripts/recovery/supabase-lab.cjs checkpoint-restore --checkpoints <checkpointDir> --keys <keyDir>
```

Capture generates a synthetic account and private object, freezes its owned
services and captures the retained Auth/Storage data and file bytes. It writes
`checkpoint.bsp` using AES-256-GCM with a fresh 256-bit key. The encrypted
wrapper binds its owner, artifact ID, source container IDs and verification
fixture hash. `checkpoint.json` records the ciphertext size and SHA-256.
Each file is flushed before the receipt is written last. A completed capture
exits and removes its owned service containers/networks before restore starts.

The separate key directory holds `recovery.key` and
`recovery-verification.private.json`. The latter contains generated synthetic
login details and old tokens used solely for the rejection checks, alongside
expected bytes/identity. Neither directory belongs in Git, a PR attachment or
public logs. The source signing secret is never included in these files.
Source transient login rows are excluded; target signing authority is fresh.

Restore authenticates bounded, regular, non-linked files and the verification
fixture before creating any target. Missing keys, wrong keys, corrupt bytes,
changed verification material and incomplete receipts refuse recovery. The
CLI does not consume or overwrite the checkpoint. A separate process verifies
that all four source service containers are absent, creates a fresh target,
then checks password sign-in with the preserved user ID, exact private bytes,
old-token rejection, foreign keys and the pinned anonymous-denial response.

Files are retained for inspection. Partial captures and stale locks are not
automatically erased or retried into the same directories. Inspect only owned
lab material; initialize a new pair for a new capture. A lock-release failure
returns nonzero while preserving whether the receipt was already committed.
Do not delete a lock unless the owning process has been confirmed stopped.
If capture returns `CHECKPOINT_ALREADY_EXISTS` and restore returns
`CHECKPOINT_NOT_COMMITTED`, retain that partial pair for diagnosis and run
`checkpoint-init` to obtain a new pair. Do not overwrite or repair the receipt.

### Evidence and remaining limits

Native file/CLI checks: **12 passed, zero skipped**, plus the existing **9/9**
Storage response/archive contracts. The real fresh-process Auth/Storage case
passed **1/1, zero skipped**, approximately 66 seconds, on November 7. Capture
and restore ran in different child processes; capture cleanup completed before
restore, and source-container absence was rechecked before and after target
verification. The artifact ID and ciphertext hash matched across processes.
Fresh password sign-in preserved the user ID and private file bytes; old
access/refresh tokens were rejected, foreign keys remained enforced, and the
exact anonymous-denial contract passed. All owned service cleanup completed.
An earlier attempt refused before creating resources because free host memory
was below 5 GiB; it was not counted as a service pass. Execution resumed only
after the existing capacity guard passed.

Separate directories on the same machine are not independent custody or an
offsite copy. Unix permission checks are enforced; Windows ACL isolation has
not been established. Exclusive writes prevent API overwrite, not owner edits
or filesystem tampering. File flushes and normal process exit do not prove
power-loss durability, directory fsync, interrupted-write recovery or crash
recovery. Key-buffer clearing is not complete JavaScript memory erasure.
Checkpoints are bounded in memory, not a large-backup streaming implementation.
The threat model excludes a hostile host administrator or Docker daemon.
Files are flushed, but directory entries are not. A crash can lose or reorder
those entries; receipt-last describes normal process ordering, not ordering
or durability across power loss.

The original three service cases also passed after the shared capture/restore
adapter refactor: containment and source smoke passed together; the original
restore case passed separately after a capacity-only refusal. No skipped case
is counted as a pass. Recommended CJS lint, Node syntax, workflow YAML,
source/test formatting and local document/diff checks passed. The fast file
checks are included in normal CI; the four real-service cases remain opt-in
and locally verified. New-head CI and independent review are still required.

Full BioSphere public tables, all five buckets,
application-level restoration, institutional custody, intended-source recovery
and deployed scheduling remain separate open gates. This extension alone does
not close BAK-002 or authorize any hosted export or operating rollout.

## Full BioSphere schema and five-bucket rehearsal

This subsequent profile extends the synthetic recipe to the repository's
BioSphere migration schema, representative linked public records and every
configured storage bucket. It uses the real Prisma migration command, local
Supabase Auth/Storage APIs and compiled Nest `AppModule`. It does not read
application `.env` files, accept supplied service destinations, export hosted
data or replace an existing server.

Build in a dedicated checkout with no `.env`: install the locked dependencies,
generate its Prisma client and run `npm run build`. Do not replace dependencies
or compile in a workspace serving an existing application. The lab verifies
the source/runtime build stamp before starting its full profile.

```text
npm run test:recovery:supabase:application-guards
npm run test:recovery:supabase:biosphere
```

The first command needs a fresh build but no Docker services. The second is an
opt-in owned Docker workflow. It initializes a new checkpoint/key pair, runs
capture to completion, then restores in a different process after all source
containers have been removed. Manual invocation uses the same owned paths:

```text
node scripts/recovery/supabase-lab.cjs checkpoint-init
node --max-old-space-size=128 --max-semi-space-size=16 scripts/recovery/supabase-lab.cjs biosphere-capture --checkpoints <checkpointDir> --keys <keyDir>
node --max-old-space-size=128 --max-semi-space-size=16 scripts/recovery/supabase-lab.cjs biosphere-restore --checkpoints <checkpointDir> --keys <keyDir>
```

The original commands remain the smaller Auth/Storage profile. Cross-profile
checkpoints are rejected. Full-profile manifests bind migration-file checksums,
bucket rules, compiled application/source identity, the settings/recipe and a
public-data fingerprint. Incompatible release metadata is refused before
Docker work. This is a strict same-recipe/build lab, not a general migration
between releases or a proved cross-platform recovery format.

On each fresh owned database only, the initializer applies the baseline SQL,
records it through Prisma's baseline command and deploys subsequent migrations.
It verifies every applied name/checksum and rejects unfinished history. During
restore the destination's freshly verified migration ledger is retained rather
than copying source ledger UUIDs/timestamps. All public business tables are
captured, including empty tables. A representative fixture links the Curator
account, collection, specimen, taxonomy, provenance, lot/transaction, location,
tags, revisions, media, exhibit/AR, inquiry, FAQ and audit/backup metadata.
This setup never baselines or migrates the configured hosted project.

The full schema fingerprint includes grants and RLS definitions. Public
business-row contents are fingerprinted before API verification; foreign keys
stay enabled throughout restore. Source login sessions are excluded and target
signing credentials are regenerated. The private identity marker is a new lab
guard outside the captured application schemas, not museum or backup data.

The five buckets are `user-avatars`, `specimen-media`, `exhibit-media`,
`inquiry-attachments` and `ar-assets`. Each holds a distinct tiny PNG/GLB payload
with a corresponding application reference; the original primary probe is
also retained. Verification checks each bucket's privacy, size/MIME settings,
exact file bytes and pinned anonymous-denial response. Storage's global limit
matches the 50 MiB application maximum, but the fixture uses only tiny files.
The capped temporary storage does not prove maximum-size uploads, large-data
capacity, streaming, pagination or measured production RPO/RTO.

Only generated loopback gateways connect the host-side migration and application
checks to the owned services. HTTP destinations and path prefixes are fixed;
there is no caller-selected upstream or CONNECT tunnel. The checker verifies
full Docker IDs, owner labels, images, network membership, gateway commands and
loopback bindings before use. It also checks a private nonce through the real
connected Prisma client before API requests and after verification. A real
wrong-marker attempt must fail; unowned loopback configuration must make zero
connections to its synthetic canary. This is containment against accidental
mis-targeting, not proof against a hostile host or active malicious rebinding.

The full profile uses one platform per process: container caps total 2176 MiB
at the target phase, plus a 768 MiB host-runtime budget and 640 MiB headroom.
Its fixed launch guard is therefore 3.5 GiB, with the parent V8 heap checked and
migration/application children bounded. The original workflow guards remain
unchanged. The test waits at most 60 seconds for capacity before each process;
it does not automatically retry a failed restore. These are conservative lab
budgets, not hard process-RSS guarantees or approval to stop other services.

### Full-profile evidence and limits

November 8 local result: **26 native checks and 1 complete owned workflow
passed, zero skipped**. The workflow took approximately 126 seconds, including
separate source/restore processes, full migration-history readback, public-row
fingerprints, schema/ACL/RLS comparison, distinct file bytes in all five
buckets, wrong connected-marker rejection and successful protected API checks.
Source-container absence, old-token rejection and complete owned cleanup were
also verified. A separate fresh-process resume of an earlier owned checkpoint
passed while correcting the application-fixture handoff; it is supporting
diagnostic evidence, not another final-head test count.

Recorded prepublication findings: the subset lab's 1 MiB Storage ceiling could
not accept BioSphere bucket definitions; it now uses the existing application
maximum. The new app-check callback initially lacked its fixture; that handoff
was corrected. An unowned-loopback canary initially received two connections;
after identity enforcement it receives zero. Finally, old-generation limits
alone did not produce the intended V8 heap budget on this Windows host; the
parent now bounds both generations and verifies its actual heap limit before
Docker work. Capacity refusals were excluded from passing evidence. None of
these findings was observed on a hosted or existing application service.

Recommended CJS lint, Node syntax, fresh isolated runtime build, source/test
formatting, workflow YAML and local document/diff checks are recorded separately
at publication. Normal CI includes the five new service-free application/profile
guards; the real Supabase workflow remains opt-in and Windows-verified only.
The original smaller real-service suites were not rerun in this final batch;
their earlier dated evidence is retained. Shared capture/restore code is
exercised by the expanded workflow and existing 21 native checks.

The protected application checks cover missing-token denial, fresh login,
restored specimen/collection, lot/location, audit and FAQ reads, plus signed
media download through the real APIs. The test uses a recreated pinned lab
configuration with email disabled. It does not capture arbitrary hosted
provider settings, restore every external integration, exercise every module's
business operation, verify frontend/browser/PWA recovery, establish independent
custody or perform incident cutover. Keep the matching code/runtime available
separately; a fingerprint is not an archived application build.

This is the next engineering input to Gate B. Independent technical acceptance,
institutional operating decisions, intended-source authorization, custody,
independent copies, retention, scheduled operation and cutover remain governed
by [the approval record](BACKUP_RECOVERY_APPROVAL.md). Do not mark the entire
backup module or BAK-002 complete from this scoped synthetic result.
