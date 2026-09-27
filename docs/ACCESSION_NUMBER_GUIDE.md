# Accession Number Guide

Implements REQ-4.4-04 and BR-01: the backend enforces the accession-number
uniqueness rule approved by the curator. The number stays nullable until it
is assigned (REQ-4.4-03).

## Approved rule

| Aspect           | Decision                                                                          |
| ---------------- | --------------------------------------------------------------------------------- |
| Scope            | Global across **every** specimen record, **including Archived** ones. Numbers are never reused. |
| Comparison       | Surrounding whitespace is ignored and matching is case-insensitive: ` abc-100 ` equals `ABC-100`. Inner whitespace is significant. |
| Format           | Free text, at most 100 characters. No pattern is enforced yet.                    |
| Unassigned       | `null` (and legacy blank values) never collide.                                   |
| Existing data    | The migration never rewrites data. It aborts and lists collisions if any exist.   |

When the museum confirms an official format, add it as a DTO validator plus
a `CHECK` constraint in a new migration. The uniqueness rule does not need
to change.

## Enforcement layers

1. **Database (authoritative).** Migration
   `20260927000000_enforce_accession_number_uniqueness` creates the partial
   unique expression index `uq_specimen_accession_number` on
   `lower(btrim(accession_number))`. Prisma cannot express this index in
   `schema.prisma`. When you review a generated migration, never accept a
   `DROP INDEX "uq_specimen_accession_number"`.
2. **Application pre-check.** `SpecimenAccessionService.assertAvailable`
   runs inside the write transaction for manual create, offline-draft sync,
   bulk-import commit, and core update. An update excludes the record being
   edited, so the record can keep its own number or change its casing.
3. **Race mapping.** A specimen's only other unique column is its generated
   primary key. So a `P2002` raised by a specimen `create`/`update` is
   reported as the same 409 as a failed pre-check.

## API contract

### Conflict response (create, update, offline sync)

`409 Conflict`:

```json
{
  "statusCode": 409,
  "error": "Conflict",
  "code": "ACCESSION_NUMBER_TAKEN",
  "message": "Accession number \"2026.1.1\" is already assigned to another specimen record.",
  "accessionNumber": "2026.1.1",
  "conflictingSpecimen": {
    "id": "…",
    "accessionNumber": "2026.1.1",
    "scientificName": "…",
    "commonName": null,
    "status": "ARCHIVED"
  }
}
```

`conflictingSpecimen` is `null` when the conflict came from the race path,
where the holder was not read. Clients should branch on `code`, not on the
message text.

### `GET /specimens/accession-number-availability`

Curator only. Query: `accessionNumber` (required, trimmed, ≤ 100 chars),
`excludeSpecimenId` (optional UUID of the record being edited). Returns
`{ accessionNumber, available, conflictingSpecimen }`. The endpoint is
advisory for inline form validation. The write itself is still checked.

### Bulk import

Preview marks a row **invalid** (an `errors` entry, not a warning) when its
accession number:

- is already held by any existing record, Archived included; or
- is shared with another row of the same file. **Every** row involved is
  blocked, because the importer cannot know which one the curator meant to
  keep.

A number taken between preview and commit fails that row at commit time,
with the conflict message in its `errors`.

`POST /specimens/duplicate-check` still reports accession matches among
active records as `HIGH` possible duplicates. That is context for the
curator; the blocking rule above is separate.
