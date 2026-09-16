# BioSphere Storage Locations Guide

This document records the backend contract for museum storage locations. The
implementation uses the existing `public.storage_unit` and
`public.storage_movement_history` tables through Prisma; it does not introduce
new database structures.

## Field contract

| API field        | PostgreSQL / Prisma field | Meaning                                   |
| ---------------- | ------------------------- | ----------------------------------------- |
| `id`             | `id`                      | Storage unit UUID                         |
| `parentId`       | `parent_id`               | Parent UUID, or `null` for a root unit    |
| `unitType`       | `unit_type`               | Curator-managed structural classification |
| `label`          | `label`                   | Museum-facing storage unit label          |
| `size`           | `size`                    | Optional curator-managed size description |
| `storageType`    | `storage_type`            | Curator-managed storage classification    |
| `holdsSpecimens` | `holds_specimens`         | Whether the unit is intended to hold lots |
| `capacity`       | `capacity`                | Optional positive capacity                |
| `archivedAt`     | `archived_at`             | Archive timestamp, or `null` while active |
| `createdAt`      | `created_at`              | Creation timestamp                        |
| `updatedAt`      | `updated_at`              | Last application-managed update timestamp |

`unitType` and `storageType` remain text values. Do not convert them to a
PostgreSQL or TypeScript enum until the museum confirms a permanent controlled
list. This follows `DATABASE_CONVENTIONS.md` and allows curators to extend the
classifications later.

Incoming text values are trimmed before validation. Required fields reject
`null`, empty strings, and whitespace-only strings. The nullable `size` and
`capacity` fields may be explicitly set to `null` during an update when a
curator needs to clear them.

## Hierarchy and movement rules

- A parent must exist and must not be archived.
- A unit cannot be its own parent.
- A unit cannot be moved underneath one of its descendants.
- Moving a unit to `null` makes it a root unit.
- Parent changes are accepted only by `PATCH /storage-locations/:id/move`.
- The unit update and its `storage_movement_history` row are written in one
  Prisma transaction.
- `moved_by` receives `AuthenticatedUser.accountId`, never the Supabase Auth
  UUID.
- Moving to the current parent is rejected because it is not a real movement
  and violates the movement-history different-parent constraint.

The SRS requires invalid parent combinations to be rejected, but it does not
yet define a permanent compatibility matrix between the curator-extensible
`unitType` values. Do not invent or hard-code such a matrix until the museum
confirms those rules.

## Archive rules

Archiving is used instead of deletion. A unit cannot be archived while it has
non-archived direct children or active specimen lots. Repeating archive on an
already archived unit is safe and returns its existing state. Archived units
cannot be edited, moved, or selected as a new parent.

A unit with active specimen lots cannot have `holdsSpecimens` changed from
`true` to `false`; the lots must first be moved or deactivated. This preserves
the same assignment rule enforced by the specimen-lot service.

## Audit and concurrency rules

- Successful create, update, move, and archive operations write a central
  `audit_log` entry with the authenticated curator's BioSphere account ID.
- The action names are `CREATE_STORAGE_UNIT`, `UPDATE_STORAGE_UNIT`,
  `MOVE_STORAGE_UNIT`, and `ARCHIVE_STORAGE_UNIT`; the module is always
  `storage_locations` and the affected record type is `storage_unit`.
- Movement also writes the domain-specific `storage_movement_history` entry.
  The movement record describes the location change, while `audit_log` makes
  the curator action visible in the system-wide audit trail.
- The business mutation and its successful audit entry commit atomically in a
  serializable transaction. PostgreSQL serialization conflicts are retried up
  to three times and then returned as a conflict response that tells the client
  to reload and try again.
- Empty or identical updates are rejected and do not create misleading audit
  entries. Repeating archive for an already archived unit is idempotent and
  does not create another audit entry.
- This module records successful storage-location actions. Cross-cutting logs
  for failed authentication and denied authorization belong in the shared auth
  and audit infrastructure rather than in individual storage handlers.

## Endpoints

- `POST /storage-locations`
- `GET /storage-locations`
- `GET /storage-locations/search?page=1&limit=25`
- `GET /storage-locations/:id`
- `GET /storage-locations/:id/children`
- `GET /storage-locations/:id/movements`
- `GET /storage-locations/:id/inventory?page=1&limit=50`
- `PATCH /storage-locations/:id`
- `PATCH /storage-locations/:id/move`
- `PATCH /storage-locations/:id/archive`

All endpoints require an active BioSphere account with the `CURATOR` role.

## Search and selection

`GET /storage-locations/search` is the bounded endpoint for curator search and
selection screens. It supports a partial, case-insensitive `search` against the
label plus exact, case-insensitive `unitType` and `storageType` filters. The
optional `holdsSpecimens` filter accepts only `true` or `false`.

The `lifecycle` filter accepts `ACTIVE`, `ARCHIVED`, or `ALL` and defaults to
`ACTIVE`. Results are ordered by label and then UUID for stable pagination.
Pages default to 25 records and are capped at 100. The existing unpaginated
`GET /storage-locations` contract remains unchanged for compatibility; new UI
lists should use the search endpoint.

Search does not recursively include descendants, calculate capacity usage, or
freeze the curator-extensible storage classifications into enums.

## Direct inventory view

The inventory endpoint returns active specimen lots assigned directly to the
selected storage unit together with each lot's specimen core record. Results
are ordered consistently and paginated with a maximum page size of 100. The
response also includes the total active-lot count and total quantity across the
entire selected unit, not only the current page.

Child storage units are not included automatically. A curator can navigate the
existing hierarchy and request each relevant child explicitly. This avoids
assuming whether a room, cabinet, shelf, or other curator-extensible unit type
should recursively aggregate its descendants.

The endpoint is read-only. It does not change quantities, move lots, calculate
capacity utilization, or infer whether a specimen is ready to be Cataloged.
