# Cataloging restoration verification

## Scope and decision

Implemented the approved Q3 restore decision from the team's 2026-10-05
eight-decisions handoff. Restoration revalidates current requirements rather
than blindly restoring a prior status. Public eligibility remains a separate
curator decision. This prevents incomplete records becoming Cataloged or
archived content becoming publicly eligible automatically.

Cataloging owns this transition. Lots/storage are read only; John’s Inventory
work and exhibit publication are not implemented or changed here. No database
schema, accession allocation, backup restoration, or storage restoration work
is included. The endpoint contract is in
[Catalog Completion Guide](./CATALOG_COMPLETION_GUIDE.md).

## Automated protected HTTP coverage — 2026-10-21

`test/specimen-restoration.e2e-spec.ts` exercises real Nest routes, global
authentication/role guards, validation, Cataloging services, revision reads
and audit reads. Only Supabase-provider and database I/O are replaced.

- Incomplete archive becomes Uncataloged with actionable missing requirements.
- Complete archive becomes Cataloged, always with public display off.
- Client-supplied status/public-display values do not control the transition.
- IDs, accession values, creation date and notes remain unchanged.
- Original archive history survives; restore actor/result/missing checks and
  original archive markers are observable through protected history endpoints.
- Repeated requests add no history and do not undo later public eligibility.
- Both status-only and timestamp-only legacy archives are recognized.
- Timestamp-only archive repair does not invent an unchanged-status revision.
- Missing/invalid tokens and Developer requests are denied without restoration.
- Invalid UUIDs and nonexistent records return 400/404.
- Simulated transactional audit failure leaves no partial restoration/history.
- Simulated serialization conflicts retry once successfully or exhaust to 409.

The fixture deliberately provides no inventory write delegates. It supplies
already-qualified lots at the DB boundary; existing readiness tests cover the
lot/storage query predicates. These tests do **not** prove real PostgreSQL
rollback, locking, concurrent requests, or live complete-lot readiness.

## Live curator UI coverage — 2026-10-21

Used the existing signed-in local browser and the disposable fixture
`TEST - AUD-002 Archive Only 20261021`. Its existing ID was
`9f2cd6f5-92d0-4afc-bd11-dfe7b3c1fde0`; the record was not recreated.

1. The archived detail page displayed an advisory Uncataloged assessment and
   seven missing requirements; the common name was the one passing check.
2. Opening confirmation and cancelling preserved Archived status after reload.
3. With **only the acceptance API** temporarily stopped, confirmation displayed
   a clear connection-error message, no success notice, and enabled retry.
4. After restarting that API, the archive and its original revision were still
   intact. Confirming restore changed it to Uncataloged with public display off.
5. The restored record was editable, incomplete catalog completion was disabled,
   and no active lots appeared. Reload preserved the result and the same ID.
6. Revision history retained the original `UNCATALOGED → ARCHIVED` event and
   added `ARCHIVED → UNCATALOGED`: one revision before, two after.
7. The audit UI showed exactly one successful `RESTORE_SPECIMEN` entry with
   original archive actor/time, resulting status and all seven missing checks.
   Reload did not add another event. No page errors occurred in this audit check.

The first browser confirmation script used the wrong element/capitalization
for history rows; it stopped **before** mutation. Corrected the script to use
the actual list rows and raw status values, then reran successfully. This was
a test-selector error, not an application defect. Final review also found and
fixed the legacy unchanged-status revision case above before submission.

## Environment and verification limits

Final local checks:

- Backend lint: zero errors; seven existing unused-disable warnings.
- Backend unit suite: 53 suites / 690 tests passed.
- Backend protected HTTP suite: 26 suites / 297 tests passed; one suite /
  17 opt-in tests skipped. Includes 16 restoration regressions.
- Backend production TypeScript compilation passed using the same
  `tsconfig.build.json` with a separate output/build-info path; the usual Nest
  build (which deletes the running server's output directory) was not invoked.
- Frontend lint and TypeScript check passed; 56 files / 321 tests passed.
- Frontend production Turbopack build passed in the isolated source copy.
  The nested copy produced a workspace-root/multiple-lockfiles warning only;
  no lockfile or dependency versions changed.

Some pre-existing suites log deliberately simulated failures; the broader
HTTP run also retains existing missing security-audit-delegate fixture
warnings outside this new suite. Those are not new restore-route failures or
evidence that real database failures were tested. The restoration suite has
its own audit delegate and checks audit output through the public endpoint.

Base commits: backend `39b9aac`, frontend `2505098`; changes are on paired
`feat/cataloging-specimen-restore` branches. No credentials, auth-state export,
signed media URLs or private museum content are included in this evidence.

The user's ports 3000/3001 were older production builds and were not restarted
or replaced. Acceptance used loopback-only ports 3100/3101 and a separately
compiled backend. Frontend production build used an ignored source-only copy,
the same locked dependencies, Turbopack and public CI placeholders, without
copying local environment files or altering the running production build.

The live Cataloged restore branch was **not** tested: no Inventory-owned active
lot was created/reactivated to manufacture that condition. That branch is
covered by the protected HTTP fixture. Real database concurrency, failure
rollback and independent team sign-off remain unverified. This is not full
module acceptance or a production-security certification.
