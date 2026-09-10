# BioSphere Specimen Lot Foundation Guide

This document defines the first database-backed specimen-lot slice of
Cataloging Management. It follows SRS sections 4.4.4 and 4.5 and uses the
existing `public.specimen_lot`, `public.specimen_lot_transaction`,
`public.storage_unit`, `public.specimen`, `public.specimen_revision_history`,
and `public.audit_log` tables through Prisma. It does not alter the database.

## Lot contract

| API field        | PostgreSQL / Prisma field | Rules                                             |
| ---------------- | ------------------------- | ------------------------------------------------- |
| `id`             | `id`                      | System-generated lot UUID                         |
| `specimenId`     | `specimen_id`             | Existing active specimen                          |
| `storageUnitId`  | `storage_unit_id`         | Existing active unit configured to hold specimens |
| `conditionClass` | `condition_class`         | Required curator-extensible text; not an enum     |
| `quantity`       | `quantity`                | Required positive PostgreSQL integer              |
| `storageNotes`   | `storage_notes`           | Nullable curator notes                            |
| `isActive`       | `is_active`               | Included in calculated inventory while true       |
| `createdBy`      | `created_by`              | Creating curator's BioSphere account UUID         |
| `updatedBy`      | `updated_by`              | Last editing curator's BioSphere account UUID     |
| `createdAt`      | `created_at`              | System-managed creation timestamp                 |
| `updatedAt`      | `updated_at`              | System-managed mutation timestamp                 |

The active specimen total is calculated as the sum of all active lot
quantities. It is never copied into a manually maintained specimen field.

## Initial creation rules

- Only an active BioSphere account with the `CURATOR` role can use lot
  endpoints.
- The parent specimen must exist and must not be archived.
- The storage unit must exist, must not be archived, and must have
  `holds_specimens = true`.
- Quantity must be a positive integer.
- Condition classifications remain curator-extensible text and are not frozen
  as PostgreSQL or TypeScript enums.
- A specimen cannot have two active lots with the same storage unit and exact
  condition classification.
- Creating a lot records a `QUANTITY_ADJUSTMENT` transaction with adjustment
  type `ADDITION`, the target lot, quantity, optional reason, timestamp, and
  acting curator.
- The lot, initial transaction, parent specimen attribution, and audit event
  are written in one Prisma transaction.

A matching active lot is rejected rather than silently increasing its
quantity. A later authorized quantity-adjustment operation must perform that
change so quantity history cannot be bypassed.

## Safe update boundary

This foundation allows direct editing only of `storageNotes`. It does not
expose generic edits for:

- quantity;
- condition class;
- storage location; or
- active/inactive status.

Those values affect physical inventory and must only change through the
movement, condition-change, split/merge, or authorized quantity-adjustment
workflows required by SRS section 4.5. A note change updates lot and parent
specimen attribution, creates a specimen revision with
`source_section = specimen_lot`, and appends an audit event atomically.

Storage-unit `capacity` is not enforced during lot assignment yet because the
museum has not frozen whether it represents individual specimens, lots,
physical slots, volume, or another measure. The existing positive capacity
value is preserved without inventing a capacity interpretation.

## Retrieval

- Active lot listing uses stable creation order.
- A lot can be retrieved by its UUID under its parent specimen, including an
  inactive lot needed for internal history.
- The summary endpoint calculates active lot count and total quantity.
- Transaction history includes entries where the lot is either the source or
  target and is paginated with a default limit of 50 and maximum of 100.

## Endpoints

- `POST /specimens/:specimenId/lots`
- `GET /specimens/:specimenId/lots`
- `GET /specimens/:specimenId/lots/summary`
- `GET /specimens/:specimenId/lots/:lotId`
- `GET /specimens/:specimenId/lots/:lotId/transactions?page=1&limit=50`
- `PATCH /specimens/:specimenId/lots/:lotId/notes`

Automatic catalog promotion remains deferred until the curator-approved
completeness rules for core, taxonomy, provenance, and lots are frozen.
