# Supabase recovery lab: preflight and next execution

Date: November 7, 2026. Scope: synthetic data only. Engineering base:
`bf6ea48948c31fd5e81d9303234528842c4a74c6` (standalone worker, PR #251).

**Status: launch withheld.** Read-only inventory is complete; containment,
real Auth/Storage requests and full-service recovery have not been tested.
This is a lab prerequisite record, not a BAK-002 pass or a deployment approval.

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

The next runnable slice is **containment plus real Auth/Storage smoke checks**,
after capacity and a reviewed pinned release are available. No such service
checks ran during this preflight. No new image, network, volume or container
was created, and no service was stopped.

Gate B remains partial until complete isolated synthetic recovery succeeds.
Intended-source access/export, institutional custody and operating decisions,
deployed scheduling and incident cutover remain separate in
[the approval record](BACKUP_RECOVERY_APPROVAL.md). Neither this authorization
nor an engineering PR closes those gates. A second reviewer must assess the
actual completed evidence; no university approval process is invented here.
