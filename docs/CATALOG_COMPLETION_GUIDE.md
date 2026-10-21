# BioSphere Catalog Completion Guide

This guide records the approved Cataloging workflow implemented by the NestJS
backend. The backend is authoritative: clients may display readiness and invoke
explicit transitions, but they cannot submit an arbitrary specimen status.

## Completion requirements

An `UNCATALOGED` specimen can become `CATALOGED` only when all of the following
are present:

- an assigned collection;
- an accession number;
- a common name;
- a taxonomic kingdom (for example, `Animalia`; the value is not hardcoded);
- a valid provenance collection date on or before today in Asia/Manila;
- a preservation type;
- a preservation method; and
- at least one active lot with positive quantity in a non-archived storage unit
  that is allowed to hold specimens.

The list lives in `CATALOG_REQUIREMENTS` in
`src/specimens/catalog-completion.policy.ts`; readiness, completion, and the
Cataloged edit guards all read it, so changing the approved list is a single,
reviewable edit there.

Media, scientific name, gender, condition, and public-display eligibility are
not completion requirements. Drafts, offline records, and imported records may
remain incomplete while their status is `UNCATALOGED`.

Cataloging only reads the lot/storage condition. Lot creation, quantity,
placement, movement, and transaction history remain responsibilities of
Specimen Inventory and Storage Location Management.

## Readiness and completion

`GET /specimens/:id/catalog-readiness` returns one deterministic check for each
requirement, the missing labels, and whether the current record can complete.
This endpoint does not mutate data.

`PATCH /specimens/:id/complete-cataloging` re-runs the same checks inside the
status-change transaction. If anything is missing it returns `400` with an
actionable `missingRequirements` array. A successful transition:

- changes `UNCATALOGED` to `CATALOGED`;
- leaves public-display eligibility disabled;
- attributes the update to the authenticated BioSphere account; and
- writes specimen revision and audit records in the same transaction.

Calling completion on an already Cataloged record is safe and does not create
duplicate history. Archived records cannot complete cataloging.

## Reopening and protected edits

`PATCH /specimens/:id/reopen-cataloging` requires a non-empty reason of at most
500 characters. It changes `CATALOGED` to `UNCATALOGED`, disables public-display
eligibility, and records the reason in revision and audit history.

While a record remains Cataloged, API updates cannot clear its collection,
accession number, common name, kingdom, collection date, preservation type, or
preservation method. The curator must reopen the record first. This prevents a
successful edit from silently leaving a record Cataloged but incomplete.

## Concurrency

Completion, restoration, reopening, public-display changes, and the core, taxonomy, and
provenance edits that guard Cataloged values run under `SERIALIZABLE`
isolation (`src/prisma/serializable-transaction.ts`), as lot mutations already
do. Postgres therefore rejects interleavings that would otherwise produce a
Cataloged-but-incomplete record, such as a concurrent edit clearing a
required value or the last qualifying lot being deactivated mid-completion.
It also rejects duplicate completion history from two simultaneous requests.
Serialization failures are retried up to three times, then reported as `409`.

Inventory changes are not made or blocked by this Cataloging feature. Future
inventory policy must decide how deaccessioning or depleting the final active
lot affects an already Cataloged record.

## Deferred decisions

This implementation intentionally does not add:

- accession-number generation (uniqueness is enforced separately; see
  `docs/ACCESSION_NUMBER_GUIDE.md`);
- fuzzy duplicate matching or automatic merging; or
- XLSX import.

Those concerns remain separate reviewable changes. Automatic accession
allocation still waits for the museum's official format and assignment
procedure.

## Restoring archived specimens

`PATCH /specimens/:id/restore` is Curator-only and takes no body. The server
reuses the current completion checklist inside a serializable transaction:

- requirements pass: restore as `CATALOGED`;
- any requirement missing: restore as `UNCATALOGED`;
- either result: disable public eligibility, clear current `archivedAt` and
  `archivedBy`, and attribute the update to the authenticated account.

The response extends the existing specimen shape with `restored: boolean`
and `missingRequirements: string[]`. Neither the specimen ID nor accession
number is regenerated. Existing taxonomy, provenance, media, tags and history
are preserved. No schema or migration is introduced.

Restoration records actual status/public-eligibility changes in revision
history and a `RESTORE_SPECIMEN` audit event in the same transaction. The audit
retains the original archive actor/time, resulting status and missing checks.
The original archive event/reason is not deleted. Legacy timestamp-only
archives are recognized without inventing an unchanged-status revision.

Calling restore on an already-active record is a no-op (`restored: false`):
it does not change status, timestamps, eligibility or history. In particular,
a retry cannot undo public eligibility subsequently enabled by a curator.
Concurrent serialization failures use the existing bounded retry/409 behavior.

The UI previews readiness, asks for confirmation, and refreshes the detail,
catalog queue, revision and audit views after success. Preview data is advisory;
only the backend's submit-time assessment decides the outcome.

Inventory remains read-only. Restoration never recreates/reactivates lots,
changes quantities or reuses storage assignments. Since archiving requires
active lots to be resolved, a typical restored record will be Uncataloged
until the Inventory owner prepares a valid active lot separately.

See [restoration verification](./CATALOG_RESTORATION_VERIFICATION.md) for
executed checks and remaining live-test limits.
