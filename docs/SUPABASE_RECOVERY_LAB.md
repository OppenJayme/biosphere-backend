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
network probe, with credentials passed on stdin and responses kept in process
memory. Only the outside counter has a loopback host port. In-network service
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
   migration ledger. Capture physical object bytes separately. Compare source
   schema and table-count inventories before/after capture.
3. Authenticate/encrypt a bounded in-memory checkpoint with AES-256-GCM,
   including platform pins, schema fingerprint, data inventory, JWT signing
   secret, database archive and object archive. A deliberately changed
   ciphertext byte must fail authentication before target construction/writes.
4. Stop and disconnect every source service. Inspect their stopped/disconnected
   state and verify that the source Auth endpoint is unreachable from the
   probe. Initialize a **new** same-version target with a fresh DB password,
   the captured JWT secret and target-local URLs.
5. Freeze target applications, require its complete Auth/Storage table-count
   inventory to equal the fresh source baseline, recreate only the two known
   fixture RLS policies, and require an equal normalized schema fingerprint.
   Restore data transactionally with `pg_restore --single-transaction
   --exit-on-error --disable-triggers`. Preserve the target's platform-managed
   DDL/migration history; do not drop schemas or weaken the raw worker guard.
6. Restore physical bytes in the target Storage mount, verify schema/count
   inventories, resume target apps, and verify the original password/user ID,
   exact private bytes and anonymous denial through the real APIs. Confirm
   source services remain stopped; remove exact owned resources afterward.

An implementation run recovered Auth but failed file download: Docker's archive
copy saw only `./` for the paused tmpfs mount. A database-only success therefore
was **not** counted as recovery success. Physical capture/restore now uses `tar`
inside the Storage mount namespace while its server PID 1 is SIGSTOP-frozen;
auxiliary exec can access the real mount. The harness checks `/proc/1/status`
for the stopped state and refuses an archive missing the known `probe.txt`.
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

Gate B remains partial until complete isolated synthetic recovery succeeds.
Intended-source access/export, institutional custody and operating decisions,
deployed scheduling and incident cutover remain separate in
[the approval record](BACKUP_RECOVERY_APPROVAL.md). Neither this authorization
nor an engineering PR closes those gates. A second reviewer must assess the
actual completed evidence; no university approval process is invented here.
