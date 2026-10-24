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

## CAT-011 access checkpoint - 2026-10-22

This is scoped evidence, not whole-media or production-security acceptance.
Backend source/test base was `9853212`; frontend source was clean at `d4d216b`.
The running servers' served build hashes were not independently verified.

### Live signed-out access

A fresh browser context with no copied curator storage/auth state made only
GET requests against the local running servers. It used the existing disposable
specimen `5b8e55d4-af0f-4263-9b0e-349b4b314f20` and a synthetic valid UUID for
the individual-media paths (not a claimed existing image).

- Backend media list, individual metadata and signed-URL routes each returned
  **401**. Their JSON contained only standard error fields, with no extra media
  fields, storage paths or URLs. This verifies the missing-session gate before
  record lookup, not stored-object existence or cross-specimen ownership.
- Opening that specimen's frontend media page redirected to `/login` and showed
  the sign-in button, not the media-manager heading or a private storage image.
  No sign-in attempt was made and no credentials were supplied.
- The anonymous context was closed; the original signed-in Audit tab and its
  URL remained unchanged. No uploads, metadata changes, removals or Inventory
  operations were attempted. No cookies, tokens, signed URLs or response dumps
  were exported to the evidence.

### Existing isolated regressions

- `npm test -- --runInBand specimen-media.service.spec.ts`: **19/19 passed**.
- `npm run test:e2e -- --runInBand specimen-media.e2e-spec.ts`: **5/5 passed**.

The HTTP suite runs the real Nest application/guards/controller/service with
mocked Prisma, Supabase auth and storage adapters. It includes missing-session
401, developer-role 403, metadata/signed-URL reads and mutation contracts; it
does not use a live developer account or store files in Supabase. The service
suite verifies scoped metadata lookup and signing the stored path with a
300-second lifetime argument. A mocked signer is not proof of real expiry.
Both commands exited successfully with no console errors in the captured run.

### Remaining privacy and acceptance gaps

Use an approved existing test-image fixture and safe account setup before
checking actual private-object/public-path denial, signed URL validity/expiry,
cross-specimen media-ID rejection and real wrong-role/inactive-session denial.
Storage/database cleanup failure behavior and concurrency have isolated
coverage but are not established as live by this checkpoint. Existing
accessibility/error-interaction gaps and independent sign-off also remain.
No defect status was promoted and no application repair was needed here.

## CAT-011 consolidated media batch - 2026-10-22

The available safe batch is **complete within the scope below**, not full
CAT-011 acceptance. The user subsequently approved one generated-image upload,
allowing the live checks to continue on the same branch.
Backend base `ffe801a`, frontend clean source `d4d216b`; actual served build
hashes were not independently checked. Earlier signed-out evidence above remains
valid only within its recorded scope and was not silently promoted.

### Completed safe checks

- Read-only local draft preflight found no work eligible for automatic sync.
  Inspected the first eight `TEST`-named catalog results' media pages, plus the
  known disposable AUD-002 media page. None inspected had media cards. This is
  a bounded fixture search, not proof that no test images exist anywhere.
- The AUD-002 empty-media page retained its empty state and exactly one upload
  picker. Its accept list was JPEG/PNG/WebP; clicking Upload without a file
  activated native required-field validation without a network submission.
- File-selector hover changed its computed background color. Real reverse/
  forward Tab established keyboard focus, with a changed computed focus ring.
  This verifies feedback presence, not full accessibility/contrast acceptance.
- On a `TEST` result's cover preview, aborting its read-only Server Action
  request showed safe failure guidance and Retry. Clicking Retry issued exactly
  one additional blocked request and returned to the error state. Both requests
  were aborted; no actual provider failure, signed URL expiry or successful
  retry recovery is claimed.
- Each temporary tab was closed; the signed-in Audit tab/URL stayed unchanged.
  No files were uploaded and no specimen, media or Inventory records changed.

The initial browser helper expected an outline after pointer interaction and
reported failure. Actual keyboard traversal showed `:focus-visible` with an
outline style of `none`, but inspection confirmed the existing focus-ring
shadow changes. Correcting the helper to recognize that ring completed the
check; no runtime fix or new application defect was established.

### Regression results

- Backend media-service plus storage-service suites: **31/31 passed**.
- Existing protected media HTTP suite: **5/5 passed**.
- Frontend cover presentation/action, native file feedback, media history and
  media-form suites: **30/30 passed** across five files.

These **66 existing tests** use isolated adapters, simulated responses or static
rendering as appropriate. They cover MIME/signature/size rejection, safe signer
errors, compensation/cleanup/conflicts, presentation and input contracts; they
do not prove those failures against real Supabase/database infrastructure.

### Approved live-image checks

After explicit user approval, submitted exactly one 32 x 32 generated PNG
through the existing upload form on disposable specimen
`5b8e55d4-af0f-4263-9b0e-349b4b314f20`. The common-name identity guard matched
`TEST - AUD-002 Trace 20261021` and the initial media list was empty. Caption:
`TEST MEDIA PRIVACY 20261022 - generated PNG`; media UUID:
`2871271c-9df8-41cb-9d96-3e3495384d83`. The labelled image is retained, not
automatically removed, and no museum photograph was used.

- One approved multipart POST returned **201**. The single media card persisted
  its caption and automatic first-image cover state on a separate page load;
  the browser decoded the expected 32 x 32 dimensions.
- A fresh anonymous HTTP context fetched the signed object with **200**, PNG
  content type and PNG byte signature. This is expected bearer-URL access, not
  a login bypass: possession of the valid signed URL grants temporary access.
- The exact same object's signed-object path without its token returned **400**.
  Its unsigned public-object path also returned **400**, rather than image bytes.
  These results establish denial for this existing object, not a bucket-wide
  enumeration or every possible storage endpoint.
- The token's decoded expiry metadata specified **300 seconds**. URLs/tokens
  stayed in diagnostic memory/normal image DOM, never shared logs or committed
  evidence.
- Save-metadata hover changed its computed background. Opening Remove focused
  Cancel; Escape closed the dialog and restored trigger focus, with no mutation
  request. Removal was not confirmed and metadata was not resaved.
- A read-only action/date-filtered audit view showed a successful
  `CREATE_SPECIMEN_MEDIA` event for the media UUID, matching specimen ID,
  `image/png` MIME type and `isCover: true`.

The initial audit helper incorrectly searched by the parent specimen ID,
whereas media events use the media ID as their affected-record ID. It found no
rows and timed out. Retesting with the action/date filter and validating the
returned specimen/media details passed; no missing-audit defect was established
and no upload was repeated.

The upload intentionally created one private object/media row and its normal
parent attribution, revision and audit effects. No specimen core fields,
Inventory data, storage hierarchy, publishing or account configuration changed.
The original signed-in Audit tab remained open and unchanged throughout.

### Live expiry and recovery

Retained the original image tab without refreshing its URL until after the
decoded expiry deadline. A fresh anonymous HTTP context then requested that
original URL with `Cache-Control: no-cache`, outside the browser image cache:

- The original signed URL returned **400** after expiry. The diagnostic completed
  32 seconds after its decoded expiry timestamp; this is not an exact measurement
  of the provider's rejection boundary or a clock-skew study.
- Reloading the curator media page produced a different signed URL with an
  advanced expiry and another **300-second** token lifetime. Anonymous HTTP
  access to that refreshed URL returned **200** with PNG content type, and the
  browser decoded the expected 32 x 32 image again.
- Exactly one media card remained; expiry recovery caused no second upload or
  media edit. An already decoded/cached image need not disappear at token expiry;
  rejection of the new HTTP request, not its on-screen persistence, was checked.

The generated fixture remains available for later tests. Temporary test contexts
and tabs were closed after verification; the original signed-in Audit tab was
preserved. No signed URL/token was included in captured results or these docs.

### Remaining acceptance limits

A real wrong-role/inactive-session check requires an appropriate test account;
do not alter another owner's accounts or copy credentials to manufacture it.
Live backend rejection of an authenticated wrong specimen/media-ID pair still
needs a suitable authorized API test setup; anonymous 401 and mocked ownership
checks do not prove it. Provider/database rollback, cleanup failure, concurrency,
complete accessibility and independent sign-off remain outside this batch.
CAT-011 remains In progress and no defect is closed by these partial results.

## CAT-011 wrong-pair HTTP checkpoint - 2026-10-23

Added two user-approved read-boundary regressions in
`test/specimen-media.e2e-spec.ts`. The mock database contains two existing
specimen parents, with the image belonging only to the first; rejection cannot
pass merely because the second specimen is missing.

- Metadata GET succeeds for the correct pair with the expected metadata,
  returns `404` for the same media ID under the other specimen, and still
  returns unchanged metadata for the correct pair afterward. The rejected
  response contains no caption or storage-path field.
- Signed-URL GET succeeds for the correct pair, returns `404` for the wrong
  pair without a signed URL or storage-path field, and never invokes the
  storage signer for that rejection. A subsequent correct request succeeds.

Both new tests passed on first execution against the existing implementation;
no runtime fix or new application defect was needed. The complete media HTTP
suite passed **7/7**; running it with the FAQ HTTP suite passed **24/24**.
Targeted ESLint for `test/specimen-media.e2e-spec.ts` and `git diff --check`
also passed.
These use real Nest guards, validation, controllers and services with mocked
database, authentication and storage adapters. Signer-call assertions observe
that external boundary, not a live provider request.

No live browser/API request, upload, image edit, account change or storage
operation was performed. This closes the isolated HTTP coverage gap only:
authenticated wrong-pair denial against the live database/provider, real
wrong-role/inactive-session access and the previously documented failure,
concurrency/accessibility and sign-off gaps remain pending. CAT-011 stays
In progress. No full unit/build suite was rerun for this test-only addition.

The subsequent [live Developer access checkpoint](./AUDIT_LOG_GUIDE.md#aud-001-live-developer-access-checkpoint---2026-10-24)
verified that the protected TEST media page redirects a Developer to the
restricted workspace without a private-image request. This is page-level
evidence only: direct signed-URL API role denial and inactive-account access
remain unverified. The subsequent [Curator audit follow-up](./AUDIT_LOG_GUIDE.md#curator-denial-audit-follow-up---2026-10-24)
found persisted matching Developer denials on two reads; exact request-to-event
correlation remains unverified.

The [2026-10-24 direct-endpoint HTTP regressions](./AUDIT_LOG_GUIDE.md#direct-endpoint-role-denial-http-regressions---2026-10-24)
add explicit Developer 403 checks for metadata and signed-URL access, with
authorized positive controls and no signer invocation on denial. The complete
media HTTP suite now passes 9/9; these isolated results do not replace the
remaining live credential/provider and acceptance checks.
