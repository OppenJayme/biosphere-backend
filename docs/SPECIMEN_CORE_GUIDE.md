# BioSphere Specimen Core Guide

This document defines the first database-backed cataloging slice. The NestJS
module uses the existing `public.specimen`, `public.collection`,
`public.specimen_revision_history`, `public.audit_log`, and `public.specimen_lot`
tables through Prisma. It does not introduce or alter database structures.

## Core field contract

| API field | PostgreSQL / Prisma field | Notes |
| --- | --- | --- |
| `id` | `id` | System-generated specimen UUID |
| `collectionId` | `collection_id` | Nullable; a supplied UUID must reference an existing collection |
| `accessionNumber` | `accession_number` | Nullable; uniqueness is not enforced until the museum confirms the rule |
| `specimenCategory` | `specimen_category` | Nullable curator-entered category |
| `scientificName` | `scientific_name` | Nullable core identification |
| `commonName` | `common_name` | Nullable core identification |
| `gender` | `gender` | `MALE`, `FEMALE`, `UNKNOWN`, or `NOT_APPLICABLE` |
| `classificationStatus` | `classification_status` | Nullable curator-entered or approved text |
| `status` | `status` | `UNCATALOGED`, `CATALOGED`, or `ARCHIVED` |
| `publicDisplay` | `public_display_allowed` | Eligibility only; never publishes the full internal record |
| `remarks` | `remarks` | Nullable curator remarks |
| `createdBy` | `created_by` | BioSphere `user_account.id` of the creator |
| `updatedBy` | `updated_by` | BioSphere `user_account.id` of the last editor |
| `archivedBy` | `archived_by` | BioSphere `user_account.id` of the archiving curator |
| `createdAt` | `created_at` | Creation timestamp |
| `updatedAt` | `updated_at` | Last core mutation timestamp |
| `archivedAt` | `archived_at` | Archive timestamp, or `null` |

Taxonomy, provenance, lots, media, tags, bulk import, and duplicate detection
are intentionally outside this core slice. Their fields must not be flattened
into the `specimen` table or accepted by this API before their dedicated
modules are implemented. Taxonomy is implemented as its own nested resource;
see `docs/SPECIMEN_TAXONOMY_GUIDE.md`.

## Status boundary

- New core records are saved as `UNCATALOGED` and are not public-display
  eligible.
- Clients cannot submit or directly modify `status`.
- The curator-approved list of applicable required fields spans specimen core,
  taxonomy, and provenance and is not frozen yet. This module therefore does
  not guess when to promote a record to `CATALOGED`.
- A later catalog-completion operation must evaluate the complete aggregate
  before changing `UNCATALOGED` to `CATALOGED`.
- Existing `CATALOGED` records can be marked or unmarked for public-display
  eligibility. `UNCATALOGED` and `ARCHIVED` records cannot be marked eligible.

This conservative boundary preserves REQ-4.4-05 through REQ-4.4-08 without
allowing a client to bypass completeness validation.

## Update, history, and archive rules

- Only active `UNCATALOGED` and `CATALOGED` records can be edited.
- An update must actually change at least one core field.
- Successful mutations use `AuthenticatedUser.accountId`, never the Supabase
  Auth UUID, for BioSphere foreign keys.
- Core field changes are appended to `specimen_revision_history` with
  `source_section = specimen_core`.
- Create, update, public-display, and archive operations append a successful
  event to `audit_log` in the same Prisma transaction as the primary change.
- Routine deletion is not exposed. Archive is idempotent, disables public
  eligibility, and preserves creator/editor/archive attribution.
- A specimen with active lots cannot be archived because its physical
  inventory is still active.

## Endpoints

- `POST /specimens`
- `GET /specimens`
- `GET /specimens/:id`
- `PATCH /specimens/:id`
- `PATCH /specimens/:id/public-display`
- `PATCH /specimens/:id/archive`

All endpoints require an active BioSphere account with the `CURATOR` role.
List requests return active records only; an archived record remains retrievable
by its UUID for internal history and audit use.
