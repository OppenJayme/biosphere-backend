# BioSphere Collection Management Guide

This slice lets curators maintain the collection records referenced by
specimens. It uses the existing `public.collection` and `public.audit_log`
tables through Prisma and does not alter the database schema.

## Conventions and access

- Collection names remain curator-extensible text. They are not PostgreSQL or
  TypeScript enums because future collections may be added after turnover.
- All endpoints require an authenticated, active `CURATOR` account.
- Names are trimmed, must not be empty, and are limited to 255 characters at
  the API boundary.
- Name uniqueness is not invented in application code because the approved
  schema has no uniqueness constraint and the business rule has not been
  confirmed.
- Create and rename operations write their audit event in the same Prisma
  transaction. An audit failure therefore rolls back the database mutation.

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
