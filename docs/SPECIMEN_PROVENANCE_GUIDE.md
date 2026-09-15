# BioSphere Specimen Provenance Guide

This document defines the database-backed acquisition, collection, and
preservation provenance slice of Cataloging Management. It follows SRS section
4.4.4 and uses the existing `public.specimen_provenance`, `public.specimen`,
`public.specimen_revision_history`, and `public.audit_log` tables through
Prisma. It does not create or alter database structures.

## Relationship and field contract

Each specimen can have at most one provenance row. The specimen UUID is both
the provenance primary key and its foreign key to `public.specimen`.

| API field            | PostgreSQL / Prisma field | Rules                                               |
| -------------------- | ------------------------- | --------------------------------------------------- |
| `specimenId`         | `specimen_id`             | Existing specimen UUID                              |
| `collector`          | `collector`               | Nullable; maximum 255 characters                    |
| `donor`              | `donor`                   | Nullable; maximum 255 characters                    |
| `collectionDate`     | `collection_date`         | Nullable valid calendar date in `YYYY-MM-DD` format |
| `collectionLocation` | `collection_location`     | Nullable; maximum 255 characters                    |
| `preservationType`   | `preservation_type`       | Nullable; maximum 255 characters                    |
| `preservationMethod` | `preservation_method`     | Nullable; maximum 255 characters                    |
| `updatedAt`          | `updated_at`              | System-managed mutation timestamp                   |

All museum-entered provenance values remain nullable because required-field
rules have not yet been approved by the curator. Preservation values remain
curator-extensible text and are not frozen as PostgreSQL enums.

The SRS also mentions acquisition-related notes and remarks. The established
schema stores general curator remarks on `public.specimen`; this slice does not
duplicate or invent another notes column.

## Mutation rules

- Only an active BioSphere account with the `CURATOR` role can use these
  endpoints.
- Provenance can only be created or changed while its parent specimen is
  active.
- `POST` rejects an all-null provenance and rejects a second provenance row
  for the same specimen.
- `PATCH` requires an existing provenance and at least one actual field
  change.
- Supplying `null` to `PATCH` intentionally clears that nullable field while
  preserving the change in revision history.
- Provenance is not deleted independently. Important information is preserved
  through revision history and specimen archiving.
- Each successful write updates both provenance `updated_at` and the parent
  specimen's `updated_by` and `updated_at` using the same timestamp.
- Each changed provenance field is recorded in
  `specimen_revision_history` with `source_section = specimen_provenance`.
- The provenance write, parent attribution, revision entries, and successful
  audit event occur in one Prisma transaction.

Provenance changes do not automatically promote or demote the specimen. The
future catalog-completion operation must evaluate specimen core, taxonomy, and
provenance together using curator-approved required-field rules.

## Endpoints

- `POST /specimens/:specimenId/provenance`
- `GET /specimens/:specimenId/provenance`
- `PATCH /specimens/:specimenId/provenance`

Retrieval remains available for archived specimens for internal history and
audit use, while creation and updates are blocked.
