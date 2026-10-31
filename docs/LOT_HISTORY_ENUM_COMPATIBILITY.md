# Lot-history enum compatibility (DEF-030) - 2026-10-31

## Problem and reproduction

The user supplied Charles's report for accession `USC-BM-2026-0001`: its Lots
page shows **The specimen lots could not be loaded**, and protected
`GET /specimens/:id/lots/history` returns 500. The report attributes this to a
shared-database migration from unmerged `feat/client-proposals-presentation`
commit `0f80b67`, which introduced `TEMPORARY_ABSENCE` into
`quantity_adjustment_type`. Shared migration history/records were not inspected
or changed during this repair; that deployment detail remains user-reported.

Source inspection confirms the feature commit's enum/migration and develop's
missing value. A fresh owned PostgreSQL fixture independently reproduces the
exact Prisma P2023 message **Value 'TEMPORARY_ABSENCE' not found in enum
'quantity_adjustment_type'** and HTTP 500 on the old generated 7.10.0 client.
The first protected-read assertion fails 200-versus-500 before the fix.

The frontend has a second compatibility boundary: its old Zod response enum
rejects this value even after the backend can read it. A synthetic HTTP/real
page-rendering regression reproduces the same page failure with valid lots
and summary but a history response containing the retained event.

## Narrow repair

- Add the known historical value to Prisma's enum and regenerate the client.
- Carry only `20261022000100_add_temporary_absence_adjustment/migration.sql`
  from the reported feature commit. Its Git blob `2096208ccd98226c3e3a7fb418d09734d36c7885`
  matches the original exactly. Do not merge the unrelated proposal features.
- Separate recorded-history adjustment types from supported new-write types.
  History, single-lot transactions and read-side report labels recognize
  temporary absence. The adjustment DTO's seven existing write choices and
  direction/quantity rules remain unchanged.
- The paired frontend accepts/displays the known historical value in responses
  and labels, while keeping it out of write options and form validation.

No historical event is renamed, removed or synthesized in the shared database;
no quantity is recalculated. This is read compatibility, not implementation or
approval of the proposed temporary-absence business operation.

## Verification and repeat command

Run `npm run test:lot-history:db` on Windows with local Docker and the existing
pinned PostgreSQL image. It opts into a new `lot-history` profile of the owned
disposable helper, never accepts an environment-supplied database, binds only
loopback, uses tmpfs, verifies ownership and removes its own container.

Seven real SQL/HTTP cases pass after the fix: specimen history, single-lot
history, cross-specimen isolation, unsupported-write rejection with unchanged
quantity/history, idempotent migration replay in the fixture, unauthenticated
denial, and Developer denial with authorized audit readback. Seeding one
synthetic historical event is fixture setup; no new TEMPORARY_ABSENCE API write
is enabled. The initial failure was the real enum decoder, not a mocked throw.

Supporting checks: backend 701/701 unit tests; existing lot/storage-inventory/
report HTTP regressions 22/22; lint zero errors/six unchanged-file warnings.
The final backend build passes.
The enum also required a read-side report label; lint caught the missing label
before it was added. Node's VM warning is expected. No errors were suppressed.
The paired frontend has 450 passing tests, four real-page/API-contract cases
plus a historical-label/write-rejection case, type checking, lint and an isolated
webpack production build using public CI placeholders. Its write
guard test includes all required fields and a valid REMOVAL control.

These are owned fixtures and isolated rendering checks, not a live repair of
the reported accession, proof of live login/storage behaviour, or independent
acceptance. Running applications and signed-in browsers were left untouched.

## Integration and operational boundary

Frontend [#97](https://github.com/OppenJayme/biosphere-frontend/pull/97) is already
merged at `f67a390ea2555e7da958a4d739336591953826ea`; its additive response
support does not repair the old backend enum decoder. Backend #221 remains
held pending the team/Curator disposition recorded in DEF-030: permanent
retention of the value and the validity of the reported quantity adjustment
under REQ-4.5-09 / BR-08. The historical read exception is now explicit in
`DATABASE_CONVENTIONS.md`; the seven supported new-write types are unchanged.
No institutional/business approval is inferred from a technical repair.

After that disposition and backend review/merge, regenerate/rebuild/restart
the integrated sources through the agreed controlled rollout. Check
the reported specimen read-only after rollout and record its actual outcome.
This repair is separate from dependency PR #220; it changes no dependency pins.
Rerun the owned `npm run test:lot-history:db` on the integrated #220/#221 source
with Prisma/client/adapter 7.10.1 before rollout; the original seven-case result
above used 7.10.0 and is not automatically promoted to the new dependency set.

Do not run shared migrations or change rows merely to verify this PR. According
to the report, the target already has the value; inspect its actual migration
state/checksums before any separately authorized deployment action. The copied
ADD VALUE IF NOT EXISTS migration supports fresh targets and is tested as a
no-op on an already-advanced owned target. No shared rollback or enum deletion
is proposed. Use separate databases for unmerged-branch migration trials and
keep deployed schema, generated client and response readers aligned.

### Migration-history and checksum preflight (rollout owner)

Commit `0f80b67` also contains
`20261022000000_add_faq_unanswered_question/migration.sql`. That sibling is
not imported by this compatibility PR. Its presence in the feature commit is
confirmed by source inspection; its application to the shared database is
**unverified**, not a newly confirmed drift incident. Do not adopt the unrelated
FAQ feature or enable collection merely to make migration history appear clean.

Before any shared rollout, the database/deployment owner must:

1. Inspect `prisma migrate status` using the intended target's normal private
   configuration and inventory all target migration names against repository
   migrations, explicitly including both sibling names above. This is an
   owner-run read-only preflight; it was not run against shared credentials here.
2. Inspect the corresponding `_prisma_migrations` metadata (`migration_name`,
   `checksum`, `finished_at`, `rolled_back_at`) and unresolved/failed entries.
   A missing or extra migration requires an explicit reconciliation plan.
3. Compare each applied checksum with the SHA-256 of the **actual migration
   file bytes** intended for deployment. For example, use `Get-FileHash
   -Algorithm SHA256 -LiteralPath <migration.sql>` in the deployment checkout.
   Check that checkout's line endings; LF versus CRLF changes the bytes/hash.
   The Git blob identity above proves source identity only, not agreement with
   an applied SHA-256 checksum or a Windows working-copy hash.
4. Stop on any mismatch or unknown applied migration and obtain the owner's
   reconciliation decision. Do not rewrite an applied migration, edit migration
   history/checksums, run `migrate resolve`, `db push` or `migrate deploy`, or
   roll back/delete enum values as an incidental verification step.

Record the target identifier (without credentials), checked revision, migration
names, comparison result and owner decision. No shared metadata was inspected
and no target checksum match or successful migration status is claimed here.
