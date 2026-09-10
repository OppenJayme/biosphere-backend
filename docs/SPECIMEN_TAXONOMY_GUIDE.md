# BioSphere Specimen Taxonomy Guide

This document defines the database-backed taxonomy slice of Cataloging
Management. It uses the existing `public.specimen_taxonomy`, `public.specimen`,
`public.specimen_revision_history`, and `public.audit_log` tables through
Prisma. It does not create or alter database structures.

## Relationship and field contract

Each specimen can have at most one taxonomy row. The specimen UUID is both the
taxonomy primary key and its foreign key to `public.specimen`.

| API field            | PostgreSQL / Prisma field | Maximum length |
| -------------------- | ------------------------- | -------------- |
| `specimenId`         | `specimen_id`             | UUID           |
| `kingdom`            | `kingdom`                 | 100            |
| `phylum`             | `phylum`                  | 100            |
| `class`              | `class`                   | 100            |
| `orderName`          | `order_name`              | 100            |
| `family`             | `family`                  | 100            |
| `genus`              | `genus`                   | 100            |
| `species`            | `species`                 | 100            |
| `habitat`            | `habitat`                 | 250            |
| `ecologicalRole`     | `ecological_role`         | 100            |
| `conservationStatus` | `conservation_status`     | 100            |

All taxonomy values remain nullable because the museum has not frozen them as
required fields or controlled PostgreSQL enums. API responses use camelCase;
Prisma continues matching the existing snake_case database.

## Mutation rules

- Only an active BioSphere account with the `CURATOR` role can use these
  endpoints.
- Taxonomy can only be created or changed while its specimen is active.
- `POST` rejects an all-null taxonomy and rejects a second taxonomy row for the
  same specimen.
- `PATCH` requires an existing taxonomy and at least one actual field change.
- Supplying `null` to `PATCH` intentionally clears that nullable field.
- Taxonomy is not deleted independently. Important specimen information is
  preserved through revision history and specimen archiving.
- Each successful write updates the parent specimen's `updated_by` and
  `updated_at` values using `AuthenticatedUser.accountId`.
- Each changed taxonomy field is recorded in
  `specimen_revision_history` with `source_section = specimen_taxonomy`.
- The taxonomy write, parent attribution, revision entries, and successful
  audit event occur in one Prisma transaction.

Taxonomy changes do not automatically promote or demote the specimen. The
future catalog-completion operation must evaluate specimen core, taxonomy, and
provenance together using curator-approved required-field rules.

## Endpoints

- `POST /specimens/:specimenId/taxonomy`
- `GET /specimens/:specimenId/taxonomy`
- `PATCH /specimens/:specimenId/taxonomy`

Retrieval remains available for archived specimens for internal history and
audit use, while creation and updates are blocked.
