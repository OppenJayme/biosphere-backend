# BioSphere Specimen Revision History Guide

This slice exposes the revision records already written by the specimen core,
taxonomy, provenance, tag, media, and specimen-lot services. It uses the
existing `public.specimen_revision_history`, `public.specimen`, and
`public.user_account` tables through Prisma and does not change the database
schema.

## Access and behavior

- `GET /specimens/:id/revisions` requires an authenticated, active `CURATOR`.
- History remains available for archived specimens and returns `404` when the
  specimen itself does not exist.
- Results are ordered newest-first with the revision UUID as a stable
  tie-breaker.
- Reads do not create audit or revision entries.
- Responses use camelCase and identify the BioSphere account that made each
  change without exposing Supabase credentials or authentication metadata.

## Filters and pagination

The endpoint accepts optional exact, case-insensitive `fieldChanged` and
`sourceSection` filters, an exact BioSphere account UUID in `changedBy`, and
inclusive `from` / `to` ISO 8601 timestamp bounds. Timestamp values must carry
`Z` or an explicit UTC offset, and `from` cannot be later than `to`.

Pagination defaults to page 1 with 50 records and is capped at 100 records per
page. The response includes `items`, `total`, `page`, and `limit`.

`sourceSection` remains database-backed text rather than a new enum. This read
API therefore supports current and future approved revision producers without
freezing another implementation convention.

## Deferred boundaries

This endpoint reports recorded changes only. It does not infer whether a
specimen is complete, change catalog status, restore an old value, or provide
a public history feed. Catalog-completion rules remain deferred until the team
and curator approve the aggregate required-field policy.
