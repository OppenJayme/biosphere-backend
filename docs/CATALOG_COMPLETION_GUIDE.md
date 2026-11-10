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

Inventory changes are not made or blocked by this Cataloging feature.

### Zero quantity after cataloging

Client proposal §2 (2026-10-22), a team decision the Curator left unchanged on
2026-11-07: when a Cataloged record's active quantity reaches zero it **stays
Cataloged** and keeps its accession number. The reduction is a quantity
adjustment with a required reason (`MISSING_LOSS`, `TRANSFER_OUT`,
`DESTRUCTION`, `DEACCESSION`, `REMOVAL`, or `TEMPORARY_ABSENCE` for loans and
off-site conservation). `GET /specimens/:id/details` reports the latest such
reduction as `lotOverview.zeroQuantityReason` when the quantity is zero. The
Curator also confirmed removed records are kept forever for auditing, and the
Inventory report lists every permanent removal.

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

## CAT-006 read-only readiness checkpoint - 2026-10-23

The existing signed-in curator session on `localhost:3000` was used to inspect
six existing `TEST` Uncataloged records, then reload each detail page (12 detail
views). This was a bounded sample, not a search of every record:

- All eight checklist labels and their order matched the approved requirements.
- The first seven pass/fail states matched the displayed collection, core,
  taxonomy and provenance fields; collection dates were compared with the
  current Asia/Manila date.
- Every missing check linked to its expected core, taxonomy, provenance or
  dedicated Inventory lot page; passed checks had no Fix link. Links were
  inspected, not followed or submitted.
- All six records showed no active lots and correctly failed the active-lot
  check. Their Catalog buttons were disabled, public eligibility was off, and
  their checklists remained unchanged after reload.
- No browser page errors or non-GET/HEAD requests were observed in the probe.
  The original Audit tab stayed open. No specimen, lot, storage or status was
  changed, and no new audit/revision output was expected from these reads.

Representative existing fixtures were
`5b8e55d4-af0f-4263-9b0e-349b4b314f20` (five requirements met) and
`3e7a3ca2-bf8f-45c9-98d3-94b8bcf31419` (two met). The retained DEF-019 test
fixture was viewed only; this check does not resolve that diagnostic incident.

Existing regression checks also passed:

| Check | Result | Evidence scope |
| --- | --- | --- |
| `specimen-cataloging.service.spec.ts`, `collection-date.policy.spec.ts` | 7/7 | Mocked database readiness, missing fields, Cataloged state, unknown record and museum-date policy |
| `lifecycle.test.ts`, `cataloging-queue.test.ts` (frontend) | 9/9 | Presentation rules, Fix-path mapping and queue rules; not browser rendering |
| `specimens.e2e-spec.ts`, filtered to `collection date HTTP boundary` and `server-authoritative Cataloging readiness checklist` | 6/6; 43 skipped | Real Nest HTTP/controller/service flow with mocked database/Supabase adapters; date acceptance/rejection and readiness |

**Remaining:** CAT-006 stays In progress. No fully ready record was found in
this six-record sample, so the all-green/enabled-button branch was not checked
live here. It needs an Inventory-owner-prepared qualifying active lot; Cataloging
must not create one to force a pass. Positive-lot storage eligibility, live
completion/audit evidence, concurrent changes and independent module sign-off
are not established by this checkpoint. Existing historical CAT-007 evidence
remains separate. Port 3000 served the existing production build; these reads
do not verify deployment of the newer duplicate-transport fix (DEF-020).

### Existing Inventory test fixture preflight - 2026-10-23

A separate read-only check of `TEST - INV Acceptance Beetle`
(`85f158c6-a73b-41ae-aa5c-9cac347d79de`) found it `UNCATALOGED`, public
eligibility off, with two active lots and displayed total quantity 12. The
backend readiness checklist reports the active-lot and common-name checks as
passed. Collection, accession number, kingdom, collection date, preservation
type and preservation method are missing; the Catalog button is disabled.
These observations stayed unchanged after reload, with zero non-read requests
and zero probe page errors. The original signed-in Audit tab was preserved.

This identifies a potential reusable fixture; it does not establish an
all-green readiness result or independently verify the Inventory storage query.
No lot, quantity, storage assignment, Cataloging field, status or public flag
was changed. Confirm reuse of this shared Inventory fixture before filling its
six missing Cataloging fields; Inventory need not create another lot merely for
this check. Completion and subsequent lifecycle/audit transitions remain a
separate approved step. No new defect was found and no test suites were rerun
for this read-only preflight; `git diff --check` passed for the documentation.

### Approved fully-ready fixture and history check - 2026-10-23

After explicit user approval to reuse that shared TEST fixture, submitted one
core save, one taxonomy create and one provenance create through the real
curator forms. Only these six previously empty fields changed:

| Field | Retained test value |
| --- | --- |
| Collection | Existing `TEST - Collection Retest` (no collection created) |
| Accession number | `TEST-READY-20261023-A`; inline availability passed before save |
| Kingdom | `Animalia` |
| Collection date | `2020-01-01` (synthetic past date for this TEST record) |
| Preservation type | `TEST - Dry specimen` |
| Preservation method | `TEST - Pinned acceptance fixture` |

Readiness progressed from 2/8 to 4/8, then 5/8 and **8/8**. Each save was
followed by detail readback and reload; the final checklist had every check met,
no Fix links and an enabled Catalog button. Status stayed `UNCATALOGED` and
public eligibility stayed off. The displayed lot section, two active lots and
total quantity 12 stayed unchanged across each save. No lot, placement,
quantity, storage, completion, reopening or public-eligibility action was sent.

Read-only history verification found exactly one matching empty-to-saved
revision for each of the six fields, with curator attribution and timestamps.
The protected date/record-filtered audit view showed one successful event for
each preparation operation, with the same actor and exact changed-field lists:
`UPDATE_SPECIMEN` (collection/accession), `CREATE_SPECIMEN_TAXONOMY` (kingdom),
and `CREATE_SPECIMEN_PROVENANCE` (the three provenance fields).

The three approved form submissions and two read-only advisory checks produced
no blocked unexpected request or probe page error. The history follow-up used
GET/HEAD only. Temporary tabs were closed; the original signed-in Audit tab was
preserved. The prepared fixture and normal audit/revision effects are retained,
not automatically reverted; these test values are not claims about a museum
object. The preparation helper is disabled against accidental repeat execution.

This supersedes the earlier missing-ready-fixture limitation for CAT-006:
the recorded incomplete/fully-ready UI, Fix-link, button and reload behavior
now passes. Independent module sign-off remains pending. Completion itself was
not invoked, so this does not close CAT-007/AUD-002 lifecycle follow-ups,
Inventory acceptance, concurrency or rollback checks. This verifies the existing
served build, not newer local-source deployment. No runtime code changed or
full test/build suites were rerun; `git diff --check` is the documentation check.

The subsequent approved [lifecycle/audit batch](./AUDIT_LOG_GUIDE.md#aud-002-approved-lifecycle-traceability-batch---2026-10-23)
completed, toggled eligibility off again, reopened and re-completed this fixture.
It is now retained **Cataloged with public eligibility off**, with its existing
Inventory display unchanged. The earlier Uncataloged state above is historical.
