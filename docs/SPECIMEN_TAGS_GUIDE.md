# BioSphere Specimen Tags Guide

This module implements the reusable Tag field shown in the SRS cataloging
workflow using the existing `public.tag` and `public.specimen_tag` tables. It
does not introduce or alter database structures.

## Behavior and naming boundary

- Tags are curator-extensible values, not a frozen enum.
- Names are trimmed, repeated whitespace is collapsed, control characters are
  rejected, and the PostgreSQL 100-character limit is enforced.
- Matching and autocomplete are case-insensitive. The spelling of the first
  stored tag is preserved for display, so attaching `endemic` can reuse an
  existing `Endemic` tag.
- Reattaching the same tag is idempotent and returns `attached = false` rather
  than creating a duplicate relationship or duplicate history.
- Detaching affects only the requested specimen relationship. The shared tag
  vocabulary row is retained because another specimen may use it later.
- Renaming or deleting shared vocabulary is intentionally not exposed. Those
  operations have wider consequences and require curator-approved rules first.
- Archived specimens and their tags remain readable, but their relationships
  cannot be changed.

## Consistency and history

Attach and detach operations run as serializable Prisma transactions. Exact
database uniqueness conflicts and concurrent relationship changes are retried
up to three times. Each actual relationship change also updates the specimen's
last editor/time and appends specimen revision and protected audit records in
the same transaction.

## Endpoints

- `GET /tags?search=term&limit=25` searches reusable tags for autocomplete.
- `GET /specimens/:specimenId/tags` lists tags currently attached to a
  specimen.
- `POST /specimens/:specimenId/tags` creates or reuses a tag and attaches it.
- `DELETE /specimens/:specimenId/tags/:tagId` detaches a tag without deleting
  shared vocabulary.

All endpoints require an authenticated, active `CURATOR` account. Tag IDs and
specimen IDs are UUID-validated, request fields are allow-listed, and
relationships are always scoped to the requested specimen.

## SRS traceability

- The SRS cataloging design includes Tag in the curator's Taxonomy tab. This
  module provides the normalized backend relationship used by that field.
- REQ-4.4-17: actual tag changes update the parent specimen's last editor and
  update timestamp and preserve revision/audit history.
- NFR-SEC-01, NFR-SEC-02, and NFR-SEC-06: authentication, curator-only backend
  authorization, strict UUID/DTO validation, and normalized names are enforced
  before database writes.
- NFR-DATA-01 and NFR-SAFE-04: relationship, attribution, revision, and audit
  writes are atomic, and conflicts are returned rather than reported as saved.
