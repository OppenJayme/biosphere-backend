# Disposable collection database verification - 2026-10-27

## Scope and safety

The user approved real collection HTTP and PostgreSQL checks for normalized
uniqueness, concurrent requests, readback and audit outcomes. This is a narrow
Cataloging fixture, not a full BioSphere sandbox or a copy of museum records.
No shared database, existing Supabase container, application server, public FAQ
entry or deployment setting is changed.

Run from the backend with Docker Desktop's local Linux engine running:

```powershell
npm run test:collections:db
```

This opt-in suite is separate from ordinary CI discovery; Docker Desktop is
not an implicit CI dependency. It uses the already-cached pinned PostgreSQL
image defined in `test/support/disposable-faq-postgres.ts` with `--pull=never`.
No new download or paid service is required. The helper retains its historical
FAQ filename/class name, but the explicit `collections` profile uses its own
database name, opt-in flag, container prefix and owner label. The default FAQ
profile and command remain separate.

The helper creates a random container identity and generated credentials,
limits it to 384 MB/one CPU, binds a random database port to 127.0.0.1 only, and
requires memory-backed data with no persistent/host mounts. Docker subprocesses
receive allowlisted OS settings, not application/Supabase/database credentials.
It accepts no existing connection URL. Normal teardown closes clients and removes
only the exact container after rechecking its owner label. A forced process kill
may bypass teardown: inspect ownership before any manual cleanup; never prune
Docker or remove unrelated containers. The image cache is retained.

The real Nest collection/audit controllers, DTO validation, auth/role/throttle
guards, services, Prisma adapter and PostgreSQL transactions execute. Only the
external identity-provider response is synthetic; it resolves to real synthetic
account rows. HTTP also uses a temporary loopback port, not 3000/3001/3002.
No AppModule, ConfigModule.forRoot or application `.env` is loaded.

Schema scope is the actual `database/sql/003_collection.sql`, actual
`20261005000000_enforce_collection_name_uniqueness` migration and minimal
synthetic account/audit dependencies shared with the existing FAQ fixture.
The application connects as a non-superuser synthetic `service_role` with
explicit grants/BYPASSRLS. This does not reproduce hosted Supabase RLS policies,
the complete historical schema, Inventory references or provider configuration.

## Evidence

The first tracer failed because the new fixture module was not implemented;
after fixture implementation, create/readback passed. That expected scaffolding
red is not an application defect or a claim that the collection repair was
implemented here. No production collection behavior or migration was changed.

The completed collection suite passes **16/16**:

| Boundary | Evidence |
| --- | --- |
| HTTP create/readback/audit | Trimmed creation is retrievable with the same identity and a persisted success event, actor and literal name details. |
| HTTP normalized conflicts | Exact, case and surrounding-space creates return 409; colliding rename leaves both records unchanged; unchanged rename returns 400; no additional success audit appears. |
| HTTP accepted rename | Identity is preserved and audit records literal old/new names. |
| Concurrent HTTP requests | Simultaneous normalized creates yield one 201/two 409; two contending renames yield one 200/one 409, with losing record preserved and only accepted mutations audited. |
| Access protection | Signed-out and Developer writes return 401/403; no collection is created; the Developer denial is retrievable through the real audit API. |
| Audit failure atomicity | Revoking the fixture role's audit INSERT permission yields 500; HTTP collection/audit readback confirms no partial mutation. Permission is restored in finally. |
| SQL expression index | Direct normalized insert/update collisions produce 23505 naming `uq_collection_name`; a rejected update preserves both names. Separate SQL connections contend for one normalized name and only one insert succeeds. |
| Migration preflight | The actual migration refuses two legacy normalized duplicates and retains their IDs/names. Savepoint/rollback restores the original disposable schema/index after this test. No automatic merge/delete is performed. |

The existing FAQ disposable database suite passes **20/20** after the shared
helper change, and the ordinary collection HTTP regressions pass **8/8**.
TypeScript `--noEmit` and diff checks pass. Full backend lint has zero errors
and the same seven pre-existing unused-disable warnings; touched test files
lint clean. Post-run Docker enumeration found
no retained `biosphere-collections-*` or `biosphere-faq-review-*` containers;
normal teardown removed those owned fixtures and their synthetic data. No
other containers or volumes were removed, and the image cache remains.

An expected Nest/Prisma permission-denied stack (`42501`) is emitted by the
deliberately injected audit-failure case; the test requires generic HTTP 500
and intact state. It is not the missing-audit-adapter fixture defect DEF-017.
The Node VM-module experimental warning is expected for the installed Prisma
runtime. Neither warning/error is hidden or treated as a new application defect.

Concurrent fan-out checks exercise real database connections/transactions, but
are not an exhaustive scheduler/interleaving or load test. They do not prove
the serialization-retry branch was entered. Migration refusal/readback is not
permission to reconcile existing shared duplicate records.

## Configured-database metadata checkpoint - 2026-10-27

The user separately approved a schema-only check against the backend-configured
`DATABASE_URL`. A bounded connection queried PostgreSQL catalog metadata inside
`BEGIN TRANSACTION READ ONLY`, confirmed `transaction_read_only = on`, and
finished with ROLLBACK. Credentials, connection strings, host/project identifiers
and driver error details were not printed. No collection/specimen rows, duplicate
groups, reference counts or migration-history records were read.

Observed on `public.collection`:

| Property | Observed |
| --- | --- |
| Index | `uq_collection_name` |
| Unique / valid / ready / live | All true |
| Number of key expressions | 1 |
| Expression | `lower(btrim(collection_name))` |
| Partial-index predicate | None |
| Definition | `CREATE UNIQUE INDEX uq_collection_name ON public.collection USING btree (lower(btrim(collection_name)))` |

This confirms the required index is present and matches the reviewed expression
on that configured target at check time. It is not merely a migration file or
an empty collision report. No DDL, data mutation, migration or shared concurrency
test was performed. This does not identify the configuration of an already-
running server process, certify other environments, or provide independent
reviewer acceptance. No application tests were rerun for this documentation update.

## Remaining acceptance gates

DEF-001 remains **Ready for retest**, not Verified. This evidence supplies local
real-database constraint/transaction checks. The separately approved metadata
checkpoint above confirms index presence on the backend-configured target;
independent acceptance and exact acceptance-target/build identification remain.
Other deployments and any historical duplicate/reference disposition are not
inferred from this target. No shared migration, reference reassignment or
deletion was performed.

Independent reviewer sign-off and exact target/build identification remain
required. This fixture does not clear media/storage-provider, full restoration,
offline interruption (DEF-019), backup/restore, LAN/browser or other modules'
gates. Do not rerun these cases repeatedly for documentation-only changes.

## Independent review handoff

2026-10-27 audit-timing follow-up: [DEF-025](./TEST_DEFECT_LOG.md#def-025---denial-audit-tests-assume-immediate-background-persistence)
reproduced the immediate denial-audit read failure using a 300-ms trigger in the
owned database. Authorized bounded GET polling now passes the same case while
preserving exact count/actor assertions. The full collection suite remains
16/16; no production guard behavior or shared database changed. Missing-event
and forbidden-read controls execute in the companion Backup database suite.

Status: **Not run by an independent reviewer**. Charles, John or Voltaire may
take this batch, depending on who replies first. This is acceptance of the
disposable verification slice only, not all Cataloging or deployment sign-off.
The author/automation owner results above are not independent acceptance.

1. Review the published branch/PR on an identified committed revision with a
   clean worktree; record the full SHA rather than reviewing an untracked local
   edit or assuming a previous test run used the same version.
2. Confirm Windows Docker Desktop's local Linux engine and the pinned cached
   image are available. The runner does not pull missing images. If prerequisites
   are unavailable, report Blocked; do not substitute an existing database URL,
   modify `.env`, use the unrelated local Supabase stack or weaken isolation.
3. Review the collection profile's opt-in flag, loopback binding, tmpfs/no-host-
   mount checks and exact owner-label cleanup before running the command.
4. Run `npm run test:collections:db`. Require 16 passing cases and exit 0.
   Confirm the reported concurrent winners/losers, API readback and audit
   expectations match the evidence table. The injected permission-denied stack
   and VM-module warning are expected; unrelated errors must be reported.
5. After completion, this read-only command should return no owned collection
   containers: `docker --host npipe:////./pipe/dockerDesktopLinuxEngine ps -a --filter name=biosphere-collections- --format "{{.ID}} {{.Names}} {{.Status}}"`.
   If a container remains, record its identity and stop; no broad Docker cleanup.
6. Record the result below, including any deviations. Do not promote DEF-001 to
   Verified solely from this fixture. Review the separate configured-target
   metadata checkpoint without extrapolating to other deployments or authorizing
   any existing duplicate/reference cleanup.

Reviewer report (complete after actual review, not in advance):

```text
Reviewer / date:
Branch / full commit SHA / clean worktree:
Windows / Node / Docker versions:
Collection suite: __/16; exit code:
Owned container cleanup: Pass / Fail / Blocked
Unexpected output / defect IDs:
Result: Pass / Fail / Blocked
Scope: disposable collection verification only; shared deployment not verified
```

Suggested teammate message, to send with the published branch/PR:

> Can one of you independently review the collection database verification?
> Please follow docs/COLLECTION_DATABASE_VERIFICATION.md, run the 16-case
> disposable Docker suite, and record your commit/result/cleanup check. It uses
> synthetic data only; don't touch the shared database, existing Supabase stack
> or application .env. The intentional audit-permission error is expected.
> This review does not sign off shared-index deployment or the whole module.
