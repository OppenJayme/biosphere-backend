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

Review/merge the backend compatibility change, then the paired frontend, and
regenerate/rebuild/restart both through the agreed controlled rollout. Check
the reported specimen read-only after rollout and record its actual outcome.
This repair is separate from dependency PR #220; it changes no dependency pins.

Do not run shared migrations or change rows merely to verify this PR. According
to the report, the target already has the value; inspect its actual migration
state/checksums before any separately authorized deployment action. The copied
ADD VALUE IF NOT EXISTS migration supports fresh targets and is tested as a
no-op on an already-advanced owned target. No shared rollback or enum deletion
is proposed. Use separate databases for unmerged-branch migration trials and
keep deployed schema, generated client and response readers aligned.
