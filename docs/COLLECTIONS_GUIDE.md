# BioSphere Collection Management Guide

This slice lets curators maintain the collection records referenced by
specimens. It uses the existing `public.collection` and `public.audit_log`
tables through Prisma. Migration `20261005000000_enforce_collection_name_uniqueness`
adds the normalized-name uniqueness index required by acceptance defect DEF-001.

## Conventions and access

- Collection names remain curator-extensible text. They are not PostgreSQL or
  TypeScript enums because future collections may be added after turnover.
- All endpoints require an authenticated, active `CURATOR` account.
- Names are trimmed, must not be empty, and are limited to 255 characters at
  the API boundary.
- Create and rename reject names that already exist after surrounding spaces
  are trimmed and case is ignored (`lower(btrim(collection_name))`). Internal
  spaces remain significant. The current UUID is excluded during rename, so
  changing its capitalization is allowed.
- A collision returns HTTP 409 with `code: COLLECTION_NAME_TAKEN`. The frontend
  preserves the entered name and explains the conflict.
- Create and rename operations write their audit event in the same Prisma
  transaction. An audit failure therefore rolls back the database mutation.

## Uniqueness deployment

Application writes use serializable read/check/write transactions, including
rechecking after serialization retries. The PostgreSQL expression index
`uq_collection_name` also protects direct and concurrent database writes.
Prisma cannot describe this expression index; do not drop it in generated SQL.

Before deploying the migration, run `npm run db:check-collection-collisions`.
It reads `COLLECTION_CHECK_DATABASE_URL`, falling back to `DIRECT_URL`, and
reports colliding UUIDs and their specimen reference counts in a read-only
transaction. The migration itself aborts on collisions and never merges,
renumbers or deletes records. Any cleanup must be reviewed with the curator.

On 2026-10-05 the configured database's read-only preflight found no collisions.
This is not proof that the new index is deployed. Apply the migration through
the approved deployment workflow and retest the database constraint before
closing DEF-001.

## Endpoints

- `POST /collections`
- `GET /collections?search=zoological&page=1&limit=50`
- `GET /collections/:id`
- `PATCH /collections/:id`

Lists use case-insensitive name search, stable name/UUID ordering, and a
maximum page size of 100. Responses use camelCase while Prisma continues to
map the approved PostgreSQL column names.

## Deletion boundary

No routine delete endpoint is exposed. Collections may already be referenced
by active or archived specimens, and the current table has no status or
archive fields. Deletion, merging, or archival must wait for an approved
collection-lifecycle rule and any corresponding schema change.

Renaming a collection does not rewrite specimen rows because specimens store
the collection UUID foreign key rather than copying its descriptive name.
