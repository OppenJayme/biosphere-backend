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
- a provenance collection date;
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

Completion, reopening, public-display changes, and the core, taxonomy, and
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

- accession-number generation or a uniqueness constraint;
- specimen restoration from `ARCHIVED`;
- fuzzy duplicate matching or automatic merging; or
- XLSX import.

Those concerns remain separate reviewable changes. In particular, accession
allocation must wait until the museum confirms whether an accession number
identifies an acquisition group or one unique specimen record.
