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

## Archive rules

Archiving is used instead of deletion. A unit cannot be archived while it has
non-archived direct children or active specimen lots. Repeating archive on an
already archived unit is safe and returns its existing state. Archived units
cannot be edited, moved, or selected as a new parent.

## Endpoints

- `POST /storage-locations`
- `GET /storage-locations`
- `GET /storage-locations/:id`
- `GET /storage-locations/:id/children`
- `GET /storage-locations/:id/movements`
- `PATCH /storage-locations/:id`
- `PATCH /storage-locations/:id/move`
- `PATCH /storage-locations/:id/archive`

All endpoints require an active BioSphere account with the `CURATOR` role.
