# BioSphere Specimen Media Guide

This module connects curator-managed specimen images to the existing private
Supabase Storage bucket and `public.specimen_media` metadata table. PostgreSQL
stores only object paths; image bytes never enter database rows.

## Security and file rules

- Every endpoint requires an authenticated, active `CURATOR` account.
- Uploads accept JPEG, PNG, or WebP images up to 15 MB.
- The shared storage service verifies both the declared MIME type and file
  signature before upload and generates the object path server-side.
- Storage paths are never accepted from request bodies.
- Signed URLs expire after five minutes and are created only after confirming
  that the media row belongs to the requested specimen.
- Archived specimens remain readable but their media cannot be changed.

## Metadata and cover rules

- Media are listed by `displayOrder`, then creation time and UUID for stable
  results.
- If `displayOrder` is omitted, the next available order is calculated.
- The first image automatically becomes the cover. A later upload also repairs
  a legacy missing-cover state.
- Selecting or uploading another cover clears the previous cover atomically.
- Caption and display order are the only generic metadata edits. Storage path,
  specimen ownership, creation time, and cover state cannot be mass-assigned.
- Cover selection is a dedicated command and is idempotent.

## Cross-system failure handling

Supabase Storage and PostgreSQL cannot share a transaction. Upload therefore
stores the image first and creates its metadata, specimen revision, parent
attribution, and audit event in one serializable Prisma transaction. If that
transaction fails, the uploaded object is removed as compensation.

Deletion commits PostgreSQL metadata/history first and then removes the private
object. This order avoids leaving a database record that points to a missing
image. If storage cleanup fails, the API still reports that metadata removal
succeeded with `storageCleanupPending = true`, and logs the orphan path for
operator cleanup. Cleanup failures also create a protected `FAILED` audit entry
when PostgreSQL remains available. This is safer than returning an ambiguous
failure that a client might retry destructively.

## Endpoints

- `POST /specimens/:specimenId/media` (`multipart/form-data`, file field
  `file`)
- `GET /specimens/:specimenId/media`
- `GET /specimens/:specimenId/media/:mediaId`
- `GET /specimens/:specimenId/media/:mediaId/signed-url`
- `PUT /specimens/:specimenId/media/:mediaId/file` (`multipart/form-data`, file
  field `file`)
- `PATCH /specimens/:specimenId/media/:mediaId`
- `PATCH /specimens/:specimenId/media/:mediaId/cover`
- `DELETE /specimens/:specimenId/media/:mediaId`

The current schema has no archive/status column for `specimen_media`, so media
removal deletes the metadata row while retaining revision and audit history.
Adding a media archive lifecycle requires a reviewed Prisma migration rather
than an application-only convention.

## SRS traceability

- REQ-4.4-12: attach, view, replace, and remove are implemented by the upload,
  retrieval/signed-URL, replacement, and removal endpoints.
- REQ-4.4-13: images remain optional and are not part of Cataloged-status
  completeness checks.
- REQ-4.4-17: every media mutation updates the parent specimen's last editor
  and update timestamp and appends revision and audit history.
- REQ-4.4-16: these curator endpoints do not publish internal specimen images.
  Public exhibit selection and publication remain separate controlled flows.
- NFR-SEC-01, NFR-SEC-02, and NFR-SEC-08: authentication, backend role
  authorization, private objects, and short-lived signed URLs prevent public
  access to internal specimen media.
- NFR-SEC-06 and NFR-SEC-07: upload size, declared type, file signature, UUID
  ownership, and editable metadata are validated before persistence.
- NFR-DATA-01 and NFR-SAFE-04: metadata, attribution, revision, and audit writes
  are atomic; cross-system cleanup failures are reported honestly and retained
  for operator follow-up.

The client must show confirmation before calling the removal endpoint
(NFR-SAFE-01) and disable duplicate upload submissions while showing progress
(NFR-PERF-06). Those interaction guarantees belong to the curator frontend;
the backend still makes each database mutation transactional and rejects
concurrent serializable conflicts with a reload-and-retry response.
