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

## Movement and condition-change workflows

Storage movements and condition changes are command-style operations rather
than direct lot edits. Each operation:

- requires an active specimen and active source lot;
- accepts a positive quantity no greater than the source lot quantity;
- keeps the total quantity across active lots unchanged;
- creates a new target lot when no active destination lot matches;
- adds quantity to the matching active target when one already exists;
- reduces the source lot for a partial operation;
- marks the source lot inactive for a full operation while retaining its
  historical quantity and relationships;
- records exactly one primary `MOVEMENT` or `CONDITION_CHANGE` lot transaction
  with source, target, quantity, curator, timestamp, and optional reason;
- records specimen revision history, parent-specimen attribution, and an audit
  event in the same database transaction.

A movement requires a different active storage unit with
`holds_specimens = true`. Storage notes are location-specific and therefore do
not silently copy onto a newly created movement target. A curator can add new
location notes afterward through the controlled notes endpoint.

A condition change requires a different, non-empty curator-managed condition
classification. Because the physical location stays the same, a newly created
condition target retains the source lot's storage notes.

The source decrement/deactivation and target creation/increment use a
serializable Prisma transaction. Concurrent serialization or active-target
uniqueness races are retried up to three times. Guarded writes reject stale
source quantities, inactive lots, and target integer overflow instead of
risking an overdraw or duplicate active lot.

Partial splitting and matching-target merging are structural outcomes of the
primary movement or condition-change command. They do not change the specimen
total and cannot be invoked as untracked direct quantity edits. The frozen
`SPLIT` and `MERGE` transaction values remain available if the museum later
approves separate standalone split/merge commands with their own semantics.

## Quantity-adjustment workflow

Authorized quantity changes use a dedicated command and never expose a direct
quantity edit. The request supplies a frozen `adjustmentType`, a signed
`quantityDelta`, the curator's `expectedQuantity`, and a required reason:

- `ADDITION` requires a positive delta.
- `REMOVAL`, `TRANSFER_OUT`, `DEACCESSION`, `MISSING_LOSS`, and `DESTRUCTION`
  require a negative delta.
- `DATA_CORRECTION` accepts either sign because a verified count can correct
  inventory upward or downward.
- Positive adjustments require the lot's current storage unit to remain active
  and configured to hold specimens. Reductions remain possible so inventory
  can be removed safely from a location that was later reconfigured.
- `expectedQuantity` must match the current active lot quantity. A stale screen
  or replayed request receives `409 Conflict` and must reload before the
  curator decides whether to try again.
- A zero delta, overdraw, PostgreSQL integer overflow, archived specimen, or
  inactive lot is rejected.
- Reducing the complete active quantity marks the lot inactive. Its stored
  quantity remains unchanged as historical state, while the response reports
  a resulting active quantity of zero.

Every accepted change records a `QUANTITY_ADJUSTMENT` transaction. The
transaction keeps `quantity_affected` positive and uses source/target lot IDs
to express direction: increases reference the target lot; decreases reference
the source lot. The lot mutation, transaction, specimen revision, parent
attribution, and audit event are atomic and use the same serializable retry and
stale-write protections as movements.

`TRANSFER_OUT` only means that specimens physically leave the USC Biological
Museum collection. Internal storage relocation must use the movement endpoint
and cannot change the total quantity.

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
- `POST /specimens/:specimenId/lots/:lotId/movements`
- `POST /specimens/:specimenId/lots/:lotId/condition-changes`
- `POST /specimens/:specimenId/lots/:lotId/quantity-adjustments`
- `PATCH /specimens/:specimenId/lots/:lotId/notes`

Quantity adjustments must not be represented as internal storage movements or
condition changes.

Automatic catalog promotion remains deferred until the curator-approved
completeness rules for core, taxonomy, provenance, and lots are frozen.
