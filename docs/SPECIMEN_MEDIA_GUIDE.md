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

## Enabled media controls feedback checkpoint - 2026-10-24

On refreshed frontend `bf4e325`, production build `iYERvY7VAlsPSlLelDmS4`, two
GET/HEAD-only temporary-tab probes used the retained TEST media fixture under
specimen `5b8e55d4-af0f-4263-9b0e-349b4b314f20`, identified by its generated-PNG
test caption. Both upload/replacement native file controls and Save metadata
were enabled, changed computed background during pointer hover, and were
reachable using Tab without activating any control. The pickers exposed
`:focus-visible` plus a new 1px forest-colored box-shadow ring; Save metadata
exposed `:focus-visible` and a nonzero 2px outline.

The first diagnostic rejected the picker for lacking an outline. Source and
computed-style review showed its existing focus ring; the helper was corrected
to accept measured outline or ring feedback. That overly narrow harness
expectation is not recorded as a new application defect. Hover samples include
transition colors and are not final-color/contrast or perceptual certification.

Set as cover was absent, and a fresh read confirmed the fixture's Cover badge.
The existing conditional UI hides that action for an already-cover image; it
was not tested or marked passed, and no fixture was changed to expose it.
Both completed probes observed zero page errors or non-read requests; no file
was selected, native dialog opened, metadata saved or cover/upload changed.
Temporary tabs closed, preserving the original role windows and their URLs.

DEF-004's enabled hover/focus subcases and DEF-012's Save metadata subcase now
have scoped browser evidence. Disabled/pending, native-dialog/file submission,
Set as cover and independent visual/accessibility acceptance remain separate;
both defects remain Ready for retest. No application source/server changed.
Ignored diagnostic: frontend `media-controls-feedback-readonly.txt`.
Documentation verification: `git diff --check`; unchanged suites not rerun.

## Upload/replacement pending and transport recovery - 2026-10-24

On the same production frontend `bf4e325`, build `iYERvY7VAlsPSlLelDmS4`, a
temporary browser tab tested upload and replacement together on the retained
generated-PNG TEST fixture. It selected an in-memory synthetic PNG via the file
input API. The replacement confirmation was explicitly confirmed only within
this blocked-request setup; neither request was allowed to reach the server.

The probe intercepted exactly one POST upload and one PUT replacement at the
known specimen's media-files route. Each request was held locally to inspect
pending state, then aborted while the page was alive and its failure awaited.
Both native file inputs and their action buttons disabled; picker opacity was
0.6 with a not-allowed cursor, and the respective Uploading/Replacing status
was exposed. The expected actionable error then appeared, controls re-enabled
and each synthetic file remained selected. No extra non-read request or browser
page error was observed; no automatic retry was initiated by the probe.

Displayed caption, display order, Cover badge and card count matched the
in-memory baseline after each failure and after a fresh page reload. Baseline
values and signed image URLs were not exported. The probe tab closed; original
Curator/Developer windows remained untouched. No server, source, credentials,
museum record or actual private object was intentionally changed.

This passes the upload/replacement pending and client-transport recovery
subcases, not real image-signature validation, upload/replacement success,
provider rollback/cleanup, concurrent mutation or an unknown real server outcome.
It does not clear DEF-019's full-stack isolation gate. DEF-004 remains Ready for
retest for its native-dialog/full-flow and independent visual acceptance limits;
metadata/Set as cover pending states under DEF-012 were not tested here.
Ignored diagnostic: `media-upload-replace-pending-recovery.txt`.
Documentation check: `git diff --check`; no unchanged application suite/build rerun.

## Metadata interruption and confirmation cancellation - 2026-10-24

Two temporary-tab probes on production frontend `bf4e325`, build
`iYERvY7VAlsPSlLelDmS4`, checked the same retained generated-PNG TEST fixture.
Replace and Remove each passed Cancel and Escape: the dialog closed, focus
returned to its trigger and no request was issued. Remove initially focused
Cancel. No replacement file was selected or destructive confirmation accepted.

Each probe then edited local caption/order and held exactly one same-page
metadata Server Action POST. All mutations were blocked before forwarding.
Saving image details status appeared and all metadata controls disabled.
Aborting the request while the page was alive reproduced **DEF-022** twice:
the edit form disappeared, local values became unavailable, no form-local
recovery alert appeared and one page error occurred. This is a failed recovery
case, not a passed test or a recurrence of cosmetic DEF-012.

Fresh reloads matched the in-memory server-backed caption/order, card count
and Cover badge. Zero unexpected non-read requests occurred. The probes closed
only after request failure settled; original Curator/Developer windows remained
open. No runtime source, server, credentials or actual media record was changed.

CAT-011 remains In progress with an open P1 client-recovery defect. Cover/remove
transport, actual storage success/failure and post-commit unknown outcomes were
not tested. Pending metadata styling is observed, but full DEF-012 acceptance
still requires its separate cover/mutation/reviewer subcases. No unchanged
application suite/build was rerun. Ignored diagnostic:
`media-metadata-cancel-recovery.txt`; documentation check: `git diff --check`.

## Metadata transport recovery repair - 2026-10-24

Frontend `7bad285` (`fix/media-metadata-transport-recovery`) now retains raw
caption/order on a rejected remote metadata action and returns accessible
unknown-outcome guidance, with no automatic retry. Server responses and Next
redirect control flow remain intact; backend rules/private storage are unchanged.
The TDD regression failed before recovery was added, then passed. Five new
client-boundary tests plus existing media checks passed 21/21; the full frontend
passed 375/375 across 64 files. Lint and non-incremental type-check also passed.

On the approved temporary loopback dev server, a fresh probe locally blocked
the initial save and an explicit retry. Both kept edits, disabled controls
while pending, cleared pending afterward and showed the exact unknown-outcome
alert with controls enabled. There were two expected intercepted POSTs, no
unexpected mutation attempts and no page errors. Reload read unchanged saved
metadata/card count/Cover state. No actual metadata/storage write was forwarded.
No credential copying or session export occurred; original role tabs remained
open. The probe closed after request settlement and only verified task-owned
server processes were stopped. Existing 3000/3001 listener PIDs were preserved;
3002 was clear and production login still returned 200.

DEF-022 is Ready for retest, not Verified: this is development-mode branch
evidence, not merged production, real successful-save/concurrency or independent
acceptance evidence. The ordinary save/authorization code was not changed or
live-tested here. Diagnostic `def022-metadata-recovery-retest.txt` remains ignored.

## Merged metadata repair verification - 2026-10-24

Frontend #80/backend #185 merged and their post-merge CI runs passed. With
explicit user approval, merged frontend `9ea97c7` rebuilt successfully and
restarted on port 3000, build `LBh_6bSAbWnotNM8iR4sW`. The previous build was
preserved outside both repositories for recovery. Backend 3001/PID 17496 was
not restarted; no 3002 listener remained and production login returned 200.

One fresh production-mode probe blocked the initial metadata save and explicit
retry. Both retained edits, exposed pending status/disabled controls, recovered
with the expected accessible unknown-outcome message and enabled controls.
Two POSTs were intercepted before forwarding, with zero unexpected non-read
requests or probe page errors. Reload read unchanged saved metadata/card count/
Cover state. Request failures settled before closing the probe; original role
windows were preserved. No successful save or private storage mutation occurred.

DEF-022 owner deployment verification is complete; independent acceptance and
separate live-success/provider/concurrency checks remain pending. Do not repeat
already-passing owner checks without a relevant change. CAT-011 stays In progress.
Ignored diagnostic: `def022-metadata-recovery-merged-3000.txt`. No app code changed
after merge; unchanged suites were not rerun. `git diff --check` passed.

## Read-only keyboard and dialog checkpoint - 2026-10-27

After user approval, started the local backend from source and the existing
frontend production build without rebuilding it. Startup readiness succeeded
and frontend `/login` / backend `/docs` returned 200. Frontend served build
`LBh_6bSAbWnotNM8iR4sW` (the earlier recorded production build), not a rebuild
of checkout `e2b13bc`. Backend startup checkout was `f99abd3`. No dependencies,
application code, migrations, account settings or storage objects were changed.

The user manually signed in as Curator in a fresh nonpersistent headed Edge
session (`biosphere-media-readonly-20261027-045a5973`), version 156.0.4314.42.
No credentials/cookies/headers/auth state were read, copied or exported. Selected
existing TEST specimen `5b8e55d4-af0f-4263-9b0e-349b4b314f20`, with one existing
cover image; no fixture or image was created. Signed URLs, captions and other
field contents were not printed or copied into committed evidence.

Scoped results:

- Actual forward Tab navigation reached all 11 visible media controls: upload
  file/caption/order/cover checkbox/submit, metadata caption/order/save and
  replacement file/trigger plus Remove. Inspected inputs had associated names;
  no unlabeled media input was found. Each sampled control matched
  `:focus-visible` with a computed outline or box-shadow indicator. This is
  computed-style presence, not visual contrast or full accessibility acceptance.
- The existing image had a non-empty alt attribute. This does not certify the
  description's quality or screen-reader output.
- Remove and Replace file dialogs were opened by keyboard and each dismissed
  using Escape and Cancel (four checks). Both had a resolvable title/description,
  opened with focus inside (Cancel in these samples), and returned focus to
  their trigger. No destructive/replacement confirmation was activated.
- The initial assertion requiring DOM focus inside the dialog at EVERY Tab
  stop failed on Remove/Escape. Diagnostic replay found BODY active with
  `document.hasFocus() = false` at two of six Tab/Shift+Tab stops, returning to
  dialog buttons on subsequent presses. No background page control received
  focus. Later checks distinguished these outside-document stops from actual
  background-control focus; each of the four dialog checks had two such stops.
  The original failed assertion is retained, not relabelled as a strict focus-
  trap pass. This establishes no application focus-escape defect; independent
  browser/assistive-technology acceptance remains pending.
- Media fields/card text/cover state matched the in-memory baseline after
  traversal, cancellations and a fresh reload. No files were selected; no
  save/upload/replacement/cover/remove confirmation was submitted.

After manual login, a context request guard aborted non-GET/HEAD/OPTIONS
requests as defense in depth. It recorded ONE background non-read request during
catalog navigation before the interaction baseline. Its purpose was not
established, it was not forwarded, and it is not reported as a failed mutation
or an application defect. Such a guard can block read-only Server Action POSTs;
no unrestricted-network or cover-preview acceptance is inferred. Tab traversal,
the four dialog checks and final reload each added zero non-read attempts and
zero observed page errors. This is not independent full-stack containment and
does not close DEF-019 or prove unrelated server/provider activity was absent.

Set as cover was absent because the sole image was already the cover, so its
keyboard behavior was NOT tested. Native file chooser interaction, actual
mutation success/failure, pending states, visual contrast, touch/LAN, full
screen-reader behavior and independent review remain outside this slice.
CAT-011 and related defect dispositions are unchanged; no new application defect
was established. Diagnostic scripts are ignored under frontend
`tools/browser/artifacts/media-readonly-*-20261027.js`. No unchanged application
test suite/build was rerun for this read-only browser/documentation checkpoint.

The user-requested signed-in window and both started servers were left running.
The isolated session still has its read-only guard; it must not be mistaken for
an unrestricted manual-edit session. No global browser/process cleanup ran.

Follow-up availability check: inspected eight additional existing media pages
(TEST-labelled candidates first) for a non-cover image with Set as cover. None
exposed that control, so no focus check or action was performed on it. No media
was created to manufacture the fixture. Returned to the original media page
with the session/guard intact. The navigation added one blocked background
non-read request (cumulative two); its purpose remains unestablished and no
mutation/cover-focus pass is inferred. Set as cover remains untested pending an
existing eligible fixture or separately approved fixture preparation.
