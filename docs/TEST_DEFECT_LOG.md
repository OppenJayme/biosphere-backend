# BioSphere Test Defect Log

**Test plan:** [ACCEPTANCE_TEST_PLAN.md](./ACCEPTANCE_TEST_PLAN.md)  
**Rule:** Never place secrets, access tokens, passwords, or personal data in a
defect entry.

## 1. Severity and priority

Severity describes impact; priority describes repair order.

| Severity    | Meaning                                                                         |
| ----------- | ------------------------------------------------------------------------------- |
| S1 Critical | Security compromise, irreversible data loss, or core system unavailable         |
| S2 Major    | Data-integrity or authorization failure, or a critical workflow cannot complete |
| S3 Moderate | Incorrect behavior with a safe workaround                                       |
| S4 Minor    | Cosmetic, wording, or low-impact usability issue                                |

| Priority | Meaning                                          |
| -------- | ------------------------------------------------ |
| P0       | Stop other work and repair immediately           |
| P1       | Repair before module acceptance                  |
| P2       | Schedule in the current testing/refinement phase |
| P3       | Backlog improvement                              |

Valid statuses: `Open`, `In progress`, `Ready for retest`, `Verified`,
`Deferred`, `Rejected`, and `Duplicate`.

### When to fix a discovered defect

Log every reproducible defect immediately, even if the affected code is old or
its author is unknown. Discovery date and affected commits are evidence; do not
guess when or by whom the defect was introduced.

Pause dependent testing and fix or contain a defect immediately when it:

- is S1/P0, creates a security or authorization exposure, or risks data loss;
- permits invalid persistent data that later tests would treat as valid;
- blocks the workflow needed by the next dependent test; or
- makes the test environment unreliable enough to invalidate results.

An isolated S3/S4 defect with a safe workaround may remain open while unrelated
tests continue. It must still be assigned, retested, and resolved or explicitly
accepted before the affected module is signed off. Testing the rest of the
system is not a reason to postpone all fixes until the end.

## 2. Summary

| ID      | Date       | Module                     | Summary                                                                 | Severity    | Priority | Status | Owner                   |
| ------- | ---------- | -------------------------- | ----------------------------------------------------------------------- | ----------- | -------- | ------ | ----------------------- |
| DEF-001 | 2026-09-29 | Cataloging / Collections   | Duplicate normalized collection names are accepted                      | S2 Major    | P1       | Ready for retest | Cataloging / Backend    |
| DEF-002 | 2026-10-03 | Cataloging / Provenance    | Future collection dates are accepted and satisfy presence validation    | S2 Major    | P1       | Ready for retest | Cataloging / Full stack |
| DEF-003 | 2026-10-03 | Cataloging / Specimen list | Client-side specimen selection does not hydrate on a remote LAN browser | S2 Major    | P1       | Ready for retest | Cataloging / Frontend   |
| DEF-004 | 2026-10-03 | Cataloging / Media UI      | Choose-file controls have no visible hover feedback                     | S4 Minor    | P2       | Ready for retest | Cataloging / Frontend   |
| DEF-005 | 2026-10-03 | Cataloging / Tags UI       | Vocabulary search hides the matching tag names                          | S4 Minor    | P2       | Ready for retest | Cataloging / Frontend   |
| DEF-006 | 2026-10-03 | Cataloging / Revision UI   | Media history exposes raw identifiers and storage paths                 | S4 Minor    | P2       | Ready for retest | Cataloging / Frontend   |
| DEF-007 | 2026-10-03 | Cataloging / Specimen list | Selected-specimen preview never displays its cover image                | S3 Moderate | P2       | Ready for retest | Cataloging / Full stack |
| DEF-008 | 2026-10-03 | Cataloging / Filters       | Clear all resets results but leaves stale filter values visible         | S3 Moderate | P2       | Ready for retest | Cataloging / Frontend   |
| DEF-009 | 2026-10-03 | Cataloging / CSV import    | Invalid row values make the entire preview return a generic 502         | S2 Major    | P1       | Ready for retest | Cataloging / Frontend   |
| DEF-010 | 2026-10-04 | Storage / Hierarchy UI     | Archived locations still look active in the live hierarchy              | S3 Moderate | P2       | Open   | Storage / Frontend      |
| DEF-011 | 2026-10-07 | Cataloging / Filters UI    | Clear all feels slow and has no appropriate pending feedback            | S4 Minor    | P2       | In progress | Cataloging / Frontend   |
| DEF-012 | 2026-10-07 | Cataloging / Media UI      | Save metadata and Set as cover lack visible hover feedback              | S4 Minor    | P2       | Ready for retest | Cataloging / Frontend   |
| DEF-013 | 2026-10-07 | Cataloging / Import UI     | CSV Choose file control lacks visible hover feedback                    | S4 Minor    | P2       | Ready for retest | Cataloging / Frontend   |
| DEF-014 | 2026-10-07 | Cataloging / Tags UI       | Already-attached tag notice resembles successful new attachment         | S4 Minor    | P2       | Ready for retest | Cataloging / Frontend   |

## 3. Defect details

### DEF-001 - Duplicate normalized collection names are accepted

**Related test:** CAT-001  
**Environment:** Development  
**Found on:** current `develop` during frontend acceptance testing

**Status:** Ready for retest

#### Repair evidence - 2026-10-05

On `fix/cataloging-acceptance-defects`, create/rename now use a normalized SQL
precheck inside serializable transactions, map unique-index races to a clear
409, and retain atomic auditing. A new migration creates `uq_collection_name`
after aborting if existing names collide. No records are automatically changed
or deleted. The configured database's read-only preflight found no collisions.
Database-index deployment and live concurrent-request verification remain
required before this defect can be marked Verified.

#### Preconditions

- Tester is signed in as an active curator.
- Collection Management is available.

#### Reproduction

1. Open Collection Management.
2. Add a collection named `Entomology`.
3. Add `Entomology` again.
4. Also verify variants such as `entomology` and `ENTOMOLOGY`.

#### Expected

Only one normalized `Entomology` collection may exist. Create and rename
operations that collide with it return a clear conflict message and make no
database or audit mutation.

#### Actual

Two records with different UUIDs and the same visible name are created and
displayed. This can fragment specimen assignments across apparently identical
collections.

#### Technical observation

- `CollectionsService.create` and `CollectionsService.update` do not check for
  an existing case-insensitive normalized name.
- `public.collection.collection_name` has no database uniqueness protection.
- The frontend correctly displays the two distinct records; it is not merely a
  rendering duplicate.

#### Required remediation

1. Define normalization as trimming surrounding whitespace and comparing names
   case-insensitively.
2. Return HTTP `409 Conflict` from create and rename collisions.
3. Add a concurrency-safe PostgreSQL uniqueness rule through a reviewed Prisma
   migration or approved custom migration SQL.
4. Map the conflict to a specific frontend message.
5. Add service and E2E tests for exact, case, whitespace, rename, and concurrent
   collisions.
6. Inspect existing duplicate UUIDs and specimen reference counts.
7. Choose one canonical record, transactionally reassign references, and only
   then remove the duplicate.

Do not delete either existing row manually until references have been checked.

#### Retest

- [ ] Exact duplicate create returns `409`.
- [ ] Case-only and surrounding-whitespace duplicates return `409`.
- [ ] Rename to another collection's normalized name returns `409`.
- [ ] Repeating the same-name rename is handled clearly.
- [ ] Concurrent duplicate requests cannot create two records.
- [ ] Existing specimen-to-collection relationships remain correct after
      cleanup.
- [ ] Audit history contains only successful accepted mutations.

### DEF-002 - Future provenance collection dates are accepted

**Related test:** CAT-005; affects CAT-006 and CAT-007

**Environment:** Development, Supabase development project

**Found on:** backend `b56d183`; frontend `672fe4e`

**Severity:** S2 Major

**Priority:** P1

**Status:** Ready for retest

**Owner:** Cataloging / Full stack

#### Repair evidence - 2026-10-05

The shared backend date policy rejects invalid and future dates in DTOs,
internal service writes and CSV preview. Readiness applies the same policy to
existing dates. Frontend form validation and the input maximum use Asia/Manila
calendar dates. Regression coverage includes the UTC/Manila midnight boundary,
unchanged legacy future dates, no mutation on rejection, and mixed CSV rows.
Original manual failures below are preserved; browser retesting is still required.

#### Preconditions

- Tester is signed in as an active curator.
- An `UNCATALOGED` specimen exists.

#### Reproduction

1. Open the specimen's Provenance page on 2026-10-03.
2. Enter `2026-10-25` as the collection date.
3. Save and reload the record.
4. Inspect Catalog readiness.

#### Expected

A provenance collection date later than the museum's current calendar date is
rejected by both the frontend and backend. It must not satisfy Catalog
readiness. Today's date and valid historical dates remain accepted.

#### Actual

The future date saves, reloads, and appears in revision history. The current
completion policy checks only that the date is present, so an invalid future
date can satisfy that requirement.

Other CAT-005 behavior passed: persistence, revision old/new values, no-change
handling, one-field edits, removal of an empty provenance record, maximum input
length, whitespace normalization, and double-submit prevention.

#### Required remediation

1. Add a frontend date maximum for immediate feedback.
2. Enforce the same calendar-date rule in the backend, which remains
   authoritative for direct API calls.
3. Apply the rule to CSV import and every other persistence path.
4. Make Catalog readiness reject pre-existing future dates.
5. Use the museum's agreed local calendar date rather than an accidental UTC
   date boundary.

#### Temporary control

Do not complete Cataloging for a record with a future collection date. Correct
the test record to a valid historical date before continuing dependent tests.

#### Retest

- [ ] A historical date saves.
- [ ] Today's date saves.
- [ ] Tomorrow's date is rejected in the UI and by a direct API request.
- [ ] An imported future date is rejected during preview/commit.
- [ ] An existing future date fails Catalog readiness.
- [ ] Rejected values create no provenance revision or audit mutation.

### DEF-003 - Client-side specimen selection does not hydrate on a remote LAN browser

**Related test:** CAT-015

**Environment:** Development frontend opened through the host computer's LAN IP

**Found on:** backend `b56d183`; frontend `672fe4e`

**Severity:** S2 Major

**Priority:** P1

**Status:** Ready for retest

**Owner:** Cataloging / Frontend

#### Repair evidence - 2026-10-05

Each row now has real detail and URL-backed preview links; clearing selection
also uses a real link. Hydrated previews update native history without fetching
the loaded page again. Back/Forward follows URL selection and narrow screens
scroll to the preview. Next development assets allow this host's exact private
LAN IPv4 addresses, with no wildcard origins. Static-render regression tests
verify that navigation survives without click handlers. The original remote
browser console error remains uncaptured: restart the dev server and retest
both devices before claiming the hydration problem is resolved.

#### Preconditions

- Frontend and backend are running on the host development computer.
- A second device opens the frontend through the host's IP and port.
- The tester signs in as a curator and opens the specimen catalog.

#### Reproduction

1. Open the specimen list on the remote browser.
2. Observe that the first specimen is selected initially.
3. Attempt to select another specimen row.
4. Click the X button in the Selected Specimen panel.
5. Use the first specimen's real `View full specimen details` link.

#### Expected

Row selection and the X button work on supported local and LAN browsers. Every
specimen remains reachable using an accessible link even if client-side
enhancement fails.

#### Actual

The X button does nothing, strongly indicating that the client component did
not hydrate. The initial specimen's ordinary detail link still navigates, while
JavaScript-only row selection is unavailable. The exact browser/device and
client-console error still need to be captured.

#### Technical observation

- `SpecimensWorkspace` initially selects `items[0]` in client state.
- `SpecimenTable` uses an `onClick` handler on `<tr>` elements rather than a
  progressively enhanced link.
- The ordinary detail link can work without the failed interaction handlers.
- On narrow screens the 1,020-pixel table and below-table preview can also hide
  visible selection feedback, but the dead X button confirms a hydration issue
  in this session.

#### Required investigation and remediation

1. Record the affected device, browser/version, URL, and whether JavaScript is
   enabled.
2. Inspect browser Console and Network failures, especially `/_next/static/`
   client chunks and hydration errors.
3. Retest after clearing site data/service workers and in a private window.
4. Give every specimen an accessible real link and represent selection in the
   URL so records remain reachable without JavaScript-only row handlers.
5. Keep the preview as progressive enhancement and make its update visible on
   narrow screens.
6. Add desktop, keyboard, touch/mobile, and LAN-origin regression coverage.

#### Temporary workaround

Filter/search until the intended specimen becomes the first result, then use
its `View full specimen details` link. This workaround is not sufficient for
module acceptance.

#### Retest

- [ ] Selection works through `localhost` and the LAN-IP origin.
- [ ] The X button clears selection.
- [ ] Every result has a direct accessible detail link.
- [ ] Keyboard Enter/Space and touch selection work.
- [ ] Mobile users can see which specimen was selected.
- [ ] No hydration or client-chunk errors appear in the browser console.

### DEF-004 - Choose-file controls have no visible hover feedback

**Related test:** CAT-011

**Environment:** Development specimen-media page

**Found on:** frontend `672fe4e`

**Severity:** S4 Minor

**Priority:** P2

**Status:** Ready for retest

**Owner:** Cataloging / Frontend

#### Repair evidence - 2026-10-06

Frontend branch `fix/cataloging-media-file-feedback` gives both native file
pickers one shared style with enabled-only hover feedback, a visible keyboard
focus outline and distinct disabled input/button styling. Accessible wrapping
labels, native file selection, required/accept constraints and pending disabling
are preserved. Archived media still exposes no mutation pickers.

The repair uses the existing `forest-100` hover token. `sage-200` is not defined
in the current brand theme and would not generate a working hover utility.

Component rendering tests verify the shared classes, native input constraints
and archived read-only behavior. Visual hover/focus/disabled behavior and actual
file submissions must still be retested in supported desktop browsers before
marking this defect Verified. This backend update is documentation only; no
API, database, authorization or other module behavior changed.

Local verification: frontend lint and production build passed; 48 test files /
279 tests passed. Generated production CSS contains the enabled hover,
keyboard-focus and disabled file-button utilities. This does not replace a
visual/native-picker retest in supported browsers.

#### Manual retest observations - 2026-10-07

Tester reports the native file-picker checks look good, but separately reports
missing hover feedback on Save metadata and Set as cover (tracked as DEF-012).
The initially reported file disappearing after refresh was clarified: a file
was selected locally without Upload image or Replace file being submitted.
Clearing an unsubmitted native file selection on refresh is expected behavior,
not an upload-persistence defect. Actual successful-upload/replacement persistence
was not confirmed in this exchange. Exact tested commits were not captured;
DEF-004 remains Ready for retest pending explicit remaining checks.

#### Reproduction

1. Open a specimen's Media page.
2. Move a mouse pointer over the native Choose File/Choose Media control in the
   upload form.
3. Repeat on the replace-file form.

#### Expected

The interactive file-selection button gives clear hover, keyboard-focus, and
disabled feedback consistent with other BioSphere controls.

#### Actual

The upload control retains the same color while hovered. The behavior does not
block file selection, but it provides weak interaction feedback.

#### Technical observation

- The upload input defines `file:bg-sage-100` but no `file:hover:*` style.
- The replacement input uses the generic input style and has no consistent
  file-button interaction styling.
- This is a CSS issue and is independent of the client-hydration failure in
  DEF-003.

#### Required remediation

1. Apply one shared file-input style to upload and replacement controls.
2. Add visible pointer hover, keyboard focus, and disabled states with adequate
   contrast.
3. Preserve the native file picker and accessible label.
4. Verify behavior in the team's supported desktop browsers.

#### Retest

- [ ] Upload and replacement file controls visibly respond to pointer hover.
- [ ] Keyboard focus is visible without relying on color alone.
- [ ] Disabled/pending appearance is clear.
- [ ] Selecting and submitting a valid file still works.

### DEF-005 - Vocabulary search hides the matching tag names

**Related test:** CAT-010

**Environment:** Development specimen-tags page

**Found on:** frontend `672fe4e`

**Severity:** S4 Minor

**Priority:** P2

**Status:** Ready for retest

**Owner:** Cataloging / Frontend

#### Repair evidence - 2026-10-06

Frontend branch `fix/cataloging-visible-tag-suggestions` renders the existing
search results as visible keyboard-accessible buttons. Selecting a name fills
and focuses the existing Tag name input; only Attach tag performs the existing
validated mutation. Choices/input are disabled while attachment is pending,
archived records remain read-only, and clearing search resets its visible field.
No backend API, shared vocabulary, inventory or storage behavior changes.
Automated rendering/selection-contract checks were added; browser interaction,
persistence, duplicate prevention and revision history remain manual retests.

#### Manual retest evidence - 2026-10-07

Tester confirmed all eight guided checks passed: create `Acceptance Retest Tag`
on specimen A, find it through specimen B's reusable search, display the matching
button, select it to populate Tag name without saving, explicitly attach it,
confirm persistence after refresh, omit the attached tag from B's suggestions,
and clear the visible search field. Running commit IDs were not captured.
Keyboard/touch, pending/read-only states, case-insensitive duplicate prevention,
detach/reuse and revision-history checks remain outstanding for final sign-off.
Status stays Ready for retest; this records partial acceptance, not full verification.

#### Additional tag retest evidence - 2026-10-07

Tester explicitly confirmed keyboard selection fills Tag name, case-insensitive
reattachment creates no duplicate relationship, detachment persists after refresh,
and revision history works. The remaining guided tag checks were reported working.
Duplicate feedback is confusing because the existing-tag notice looks like a green
attachment confirmation; tracked separately as DEF-014, not a data-integrity failure.
Exact running commits and explicit pending/read-only checks remain uncaptured.

#### Reproduction

1. Attach a tag to one specimen so it becomes part of the shared vocabulary.
2. Open another specimen's Tags page.
3. Search the reusable vocabulary for that tag.

#### Expected

The matching reusable tag names are visibly shown and can be selected without
the curator having to discover a separate browser datalist interaction.

#### Actual

The page reports only that one reusable suggestion is available in the
tag-name field. It does not visibly list the matching name near the search
result, making the successful search result unclear.

#### Technical observation

- Matching tags are supplied to the attach field through an HTML `datalist`.
- The search-result area displays only the number of matches.
- Tag reuse itself works; this is a discoverability issue rather than a data or
  duplicate-protection failure.

#### Required remediation

1. Render the matching tag names as visible, keyboard-accessible choices.
2. Selecting a result should populate or attach through the existing validated
   tag workflow rather than introduce a second persistence path.
3. Preserve case-insensitive duplicate prevention and the shared vocabulary.
4. Provide an explicit no-results message.

#### Retest

- [ ] Matching reusable tag names are visible after searching.
- [ ] Results are usable with pointer, keyboard, and touch input.
- [ ] Selecting a result attaches the existing shared tag.
- [ ] An already attached tag remains excluded from suggestions.
- [ ] Duplicate normalization and revision history still work.

### DEF-006 - Media history exposes raw identifiers and storage paths

**Related test:** CAT-011

**Environment:** Development specimen revision-history page

**Found on:** frontend `672fe4e`

**Severity:** S4 Minor

**Priority:** P2

**Status:** Ready for retest

**Owner:** Cataloging / Frontend

#### Repair evidence - 2026-10-06

Frontend branch `fix/cataloging-readable-media-history` adds read-only media
event/value formatting for additions, removals, file replacements, cover,
caption and display-order changes. UUIDs/paths are replaced with neutral
descriptions; historical filenames are not invented or fetched from current
media records. Caption text and numeric ordering remain visible. Backend/API
revision values remain immutable and unchanged for authorized investigation.
Automated helper/rendering tests cover this presentation and preservation of
ordinary-field/tag formatting. Live CAT-011 history retesting remains required.

#### Reproduction

1. Upload, replace, and remove specimen media.
2. Open the specimen's revision history.
3. Inspect the values for `Specimen Media` and `Specimen Media.File` entries.

#### Expected

History describes the action in curator-readable terms, such as an image being
added, replaced, or removed, with a safe filename or caption where useful.

#### Actual

Media additions and removals display raw UUIDs. File replacement entries
display internal storage-object paths, which are implementation details and
make review history difficult to understand.

#### Technical observation

- The revision history formatter special-cases specimen tags but not media.
- The underlying audit data appears complete; the defect is in presentation.
- No credential or signed URL was observed in the displayed values.

#### Required remediation

1. Add media-specific revision formatting for add, replace, metadata edit, and
   removal events.
2. Prefer a sanitized filename, caption, or clear action label over UUIDs and
   storage paths.
3. Preserve the underlying immutable revision values for authorized forensic
   access without exposing implementation details in the ordinary curator UI.

#### Retest

- [ ] Media additions and removals use understandable action descriptions.
- [ ] Replacement history identifies the change without showing storage paths.
- [ ] Caption, display-order, and cover changes remain distinguishable.
- [ ] Existing tag and core-field history formatting is unchanged.

### DEF-007 - Selected-specimen preview never displays its cover image

**Related test:** CAT-011

**Environment:** Development specimen catalog page

**Found on:** backend `b56d183`; frontend `672fe4e`

**Severity:** S3 Moderate

**Priority:** P2

**Status:** Ready for retest

**Owner:** Cataloging / Full stack

#### Repair evidence - 2026-10-06

Frontend branch `fix/cataloging-cover-preview` lazily reads the selected
specimen's marked cover using existing curator-protected media/signing APIs.
A verified session and valid UUID are required before reads; the response
contains only caption and short-lived HTTPS URL, not storage paths or session
credentials. Backend media calls share a ten-second deadline. No-cover,
loading and safe error/retry states are distinct. The component is keyed by
specimen UUID and update timestamp and ignores late responses after unmount
or retry. Existing no-store reads and media revalidation remain in use.

Tests cover the action's authorization, selected-cover-only behavior, response
shape and safe failures plus rendered image/placeholder/error states. Browser
image loading, rapid selection, cover changes/removal and retry still require
manual retest. No backend application, Inventory, Storage or Exhibit code was
changed; this backend entry is documentation only.

Local verification: frontend lint and production build passed; 47 test files /
276 tests passed. No dependencies or database schema changes were introduced.

#### Manual retest observations - 2026-10-07

Tester confirmed the selected cover appears in the right-hand preview and a
separate specimen without a cover shows No cover image selected; the remaining
guided cover checks were reported working. Exact running commits were not captured.
Rapid-selection races, request failure/retry and expired image links still need
explicit testing before final verification. Status remains Ready for retest.

The tester estimates image loading at roughly one second. This is an unmeasured
performance observation, not a confirmed latency defect or accepted response-time
target. Capture image size and signing/download timings and compare development
with production before choosing an optimization.

**Deferred enhancement:** Show small cover thumbnails in the left-hand Record
column instead of its current icon, with a no-cover fallback. This is separate
from DEF-007; no row-thumbnail implementation is claimed. Evaluate bounded,
efficient thumbnail delivery without full-image/signing requests per row before
implementation. Keep this work within Cataloging presentation.

#### Reproduction

1. Upload at least one specimen image and mark it as the cover.
2. Confirm the cover marker persists on the Media page.
3. Return to the specimen catalog and select that specimen.
4. Inspect the image area in the Selected Specimen panel.

#### Expected

The selected specimen's current cover image appears through an authorized,
short-lived URL, with an accessible fallback when no cover exists or the image
cannot be loaded.

#### Actual

The panel always displays the paw placeholder even when the specimen has a
valid cover image.

#### Technical observation

- `SpecimenDetailPanel` renders `PawIcon` unconditionally.
- The catalog summary contract does not currently provide an authorized cover
  preview URL.
- Private storage paths must not be placed directly in the catalog response or
  exposed as public URLs.

#### Required remediation

1. Add a bounded, authorized way to obtain the selected specimen's current
   cover preview, preferably only when needed rather than signing every image
   for every catalog row.
2. Render the short-lived URL in the selected preview with appropriate alt text.
3. Retain the placeholder for specimens without a cover and for recoverable
   image-loading failures.
4. Ensure a cover change or removal invalidates the relevant cached view.

#### Retest

- [ ] A selected specimen with a cover displays the correct image.
- [ ] Switching the cover updates the preview after navigation or refresh.
- [ ] Removing the cover falls back safely without a broken image.
- [ ] A specimen without media continues to show the placeholder.
- [ ] No raw storage path, service credential, or long-lived public URL is exposed.

### DEF-008 - Clear all leaves stale filter values visible

**Related test:** CAT-012

**Environment:** Development specimen catalog page

**Found on:** frontend `672fe4e`

**Severity:** S3 Moderate

**Priority:** P2

**Status:** Ready for retest

**Owner:** Cataloging / Frontend

#### Repair evidence - 2026-10-05

Frontend branch `fix/cataloging-filter-reset` keys the uncontrolled filter form
to the complete parsed query. When Clear all or restored navigation changes
the applied query, React replaces the form and initializes its inputs/selects
from that query. Rerenders with the same query retain unfinished input; no
extra state, dependencies, API changes or inventory/storage mutations were
introduced.

Three automated component-contract tests cover changed form identity, default
values for every control, advanced-section defaults, all changed query fields,
and stable identity on unrelated rerenders. They do not simulate real browser
interaction. The original failure below remains evidence; manually retest Clear
all, immediate reapply and Back/Forward before marking this defect Verified.

Local verification: frontend lint and production build passed; 45 test files /
262 tests passed. Backend changes for this repair are documentation only.

#### Reproduction

1. Select values such as Cataloged status, a collection, and a gender.
2. Apply the filters and confirm the result set changes.
3. Select `Clear all`.

#### Expected

The URL, result set, and every visible search/filter/sort control return to
their documented default values.

#### Actual

The URL and result set reset, but controls such as status, collection, and
gender continue to display their previous selections. The visible form no
longer represents the active query.

#### Technical observation

- `Clear all` performs a client-side navigation to `/specimens`.
- Toolbar controls are uncontrolled inputs using `defaultValue`.
- During soft navigation, the existing DOM controls can retain their current
  values even though the server-rendered query and results have reset.

#### Required remediation

1. Synchronize every control with the parsed query after navigation, either by
   controlled state or by intentionally remounting/resetting the form when the
   query changes.
2. Keep the backend query as the source of truth.
3. Preserve pagination reset and the current validated query allowlist.
4. Add an interaction test that applies multiple filters and clears them.

#### Retest

- [ ] Clear all resets the URL and result set.
- [ ] Search, filters, and sort controls visibly return to defaults.
- [ ] Reapplying immediately after clearing does not restore stale filters.
- [ ] Browser Back/Forward keeps controls and results synchronized.
- [ ] Pagination returns to page 1.

### DEF-009 - Invalid row values make the entire CSV preview fail

**Related test:** CAT-013

**Environment:** Development Cataloging import page

**Found on:** backend `b56d183`; frontend `672fe4e`

**Severity:** S2 Major

**Priority:** P1

**Status:** Ready for retest

**Owner:** Cataloging / Frontend

#### Repair evidence - 2026-10-05

Preview collection IDs and gender now accept bounded raw text, preserving
invalid CSV values alongside backend row errors. Strict normal specimen and
commit response schemas remain unchanged. Regression tests cover mixed valid
and invalid rows, malformed response shapes and the 500-row boundary. Browser
preview/commit retesting remains required; no acceptance result is changed to
Pass merely because automated contract tests pass.

#### Manual preview evidence - 2026-10-07

Tester supplied a screenshot showing three reviewed rows: two valid/Ready,
one invalid with a specific gender-enum validation message, and zero warnings.
The invalid row's checkbox appears disabled; valid rows are selected. Preview
renders rather than failing with the previously reported generic 502.
Exact running commits were not captured. Selected-row commit, persisted values,
preview-only non-mutation, repeat-commit safety and other invalid-input cases
remain to be explicitly tested. DEF-009 stays Ready for retest.
The separate CSV native-file hover report is tracked as DEF-013.

**Follow-up:** Tester reported the selected-row save checklist passed: only the
selected valid row was imported, its values persisted with UNCATALOGED status,
and unselected/invalid rows were not imported. Repeat-commit and other invalid
input edge cases remain unverified; tested commits were not captured.

#### Reproduction

1. Prepare a CSV containing valid rows and one row whose gender is
   `BAD_VALUE`.
2. Open Cataloging import and select the CSV.
3. Select `Preview CSV`.
4. Inspect the browser Network panel.

#### Expected

The preview succeeds, marks the invalid row as unselectable, and displays the
backend's row-level gender validation message without saving any records.

#### Actual

`POST /api/cataloging/specimens/import/preview` returns `502 Bad Gateway`, and
the UI reports that CSV preview is temporarily unavailable. No row-level
preview is shown.

#### Technical observation

- The backend intentionally echoes raw CSV values in preview rows so invalid
  data can be reviewed alongside `valid` and `errors`.
- The frontend preview schema requires `data.gender` to match the valid enum
  and `data.collectionId` to be a valid UUID even for an invalid preview row.
- Therefore an expected invalid value such as `BAD_VALUE` causes frontend
  response parsing to reject the entire otherwise valid preview response.
- The same mismatch can affect other raw invalid values, such as malformed
  collection UUIDs.
- Backend import tests passed 39/39. Existing frontend contract tests passed
  3/3 but do not include an invalid raw preview row.
- The observed PostgreSQL `client.query()` deprecation warning is unrelated to
  the frontend response-schema rejection.

#### Required remediation

1. Model preview-row `data` as bounded raw CSV display values rather than as
   already business-valid create input.
2. Keep strict business validation in the backend and use each row's `valid`
   and `errors` fields to control selection and explain rejection.
3. Do not loosen the normal specimen-create or commit contracts.
4. Preserve the same-origin upload boundary, authentication, size limits, and
   strict top-level preview response validation.
5. Add frontend regression cases for invalid gender, malformed collection UUID,
   mixed valid/invalid rows, and safe rendering of backend errors.

#### Retest

- [ ] A mixed-validity CSV returns a visible preview rather than 502.
- [ ] Invalid raw gender and collection values appear safely with errors.
- [ ] Invalid rows cannot be selected or committed.
- [ ] Valid rows remain selectable and previewing creates no records.
- [ ] Valid-only preview and retry-safe commit behavior remain unchanged.

### DEF-010 - Archived locations still look active in the live hierarchy

**Related test:** STO-004

**Environment:** Development Storage Location page

**Found on:** backend `6e3b1c2`; frontend `672fe4e`

**Severity:** S3 Moderate

**Priority:** P2

**Status:** Open

**Owner:** Storage Location Management / Frontend

#### Reproduction

1. Select a disposable storage location that has an active child or specimen
   lot and confirm that archiving is rejected.
2. Resolve the dependencies, archive the child, and archive its parent.
3. Refresh the Storage Location page and inspect the hierarchy, selected
   record, and direct-child list.

#### Expected

Archived records remain available for history and audit purposes, but the
default live hierarchy contains active locations only. If archived records
are deliberately displayed, every tree node, search result, breadcrumb, and
child card clearly identifies them as archived and read-only. Active child
counts do not include archived children.

#### Actual

The selected detail correctly shows an `Archived` badge and its management
controls are read-only. However, the archived cabinet and its archived child
remain in the tree and direct-child section with the same visual treatment as
active locations. The parent also reports the archived record as a direct
child, despite the page describing the hierarchy as live.

#### Technical observation

- The Storage page requests lifecycle `ALL` rather than an active-only view.
- Hierarchy construction includes every returned unit.
- Tree nodes, search results, and direct-child cards do not render
  `archivedAt` state.
- The management form already excludes archived units from eligible parent
  choices, so mutation protection is working independently of this defect.

#### Required remediation

1. Prefer an active-only hierarchy by default with an explicit `Show
archived` control for historical lookup.
2. When archived records are shown, add consistent archived styling and a
   text badge in the tree, search results, breadcrumbs, and child cards.
3. Exclude archived children from active child counts/lists, or display them
   in a clearly separate archived subsection.
4. Keep archived records selectable and read-only; do not delete their data
   or audit history.
5. Continue excluding archived locations from parent selection and other
   active mutation targets.

#### Retest

- [ ] The default tree and active child count exclude archived locations.
- [ ] `Show archived` reveals historical locations with an unmistakable
      archived state.
- [ ] Archived records remain readable and linked to audit history.
- [ ] Archived locations cannot be edited, moved, selected as a parent, or
      assigned new specimen lots.
- [ ] Active hierarchy navigation and search remain unchanged.

### DEF-011 - Clear all feels slow and has no appropriate pending feedback

**Related test:** DEF-008 filter-reset retest
**Environment:** Local frontend development server
**Found on:** User-reported browser test; running frontend/backend commits not captured
**Severity:** S4 Minor (provisional; revise if measured delays block use)
**Priority:** P2
**Status:** In progress
**Owner:** Cataloging / Frontend

#### Partial repair evidence - 2026-10-07

Frontend branch `fix/cataloging-clear-filter-feedback` wraps only Clear all in
a navigation transition with busy text and an accessible non-modal loading
status. Repeated same-link navigation is guarded while pending. The fixed native
href, modified/new-tab clicks, history and query-keyed form reset are preserved.
No premature optimistic reset, authentication bypass, new queries or cache is
introduced. Existing data-load failures continue to use catalog fallback/retry.

Five focused transition-contract checks plus existing filter-reset regressions
cover the implementation. The catalog's session check and three parallel data
reads were inspected, but authenticated latency measurements were not captured.
Production/development timing, failure/navigation and visual pending retests are
documented in the frontend checklist. Feedback is implemented; speed is not
claimed improved. Keep In progress until investigation and retest complete.

#### Tester follow-up - 2026-10-09

The tester reports the latest UI fixes are working and accepts continuing
other acceptance tests while the filter delay remains. Previously reported
durations were approximately 700-800 ms for Clear all and 1490-1600 ms for
Apply. After the requested production-build comparison, the tester reports
the delay is still similar; exact request timings, running commits and a
network trace were not supplied. These are user-reported observations, not
instrumented backend measurements. Pending-feedback behavior passed the
reported retest; the performance concern is not resolved or signed off.

#### Reproduction

1. Apply Cataloging filters.
2. Click Clear all.
3. Observe the transition until the unfiltered results appear.

#### Expected

Show immediate, accessible pending feedback during any noticeable navigation
delay, then consistent cleared controls/results. Determine actual latency before
choosing performance changes; no response-time target is assumed.

#### Actual / evidence - 2026-10-07

The tester reports that filters clear successfully, but the operation feels slow.
Only the bottom-left development "Rendering" indicator provides feedback.
No timings, network trace or production comparison have been captured.
This is separate from DEF-008's original stale-control defect: its basic reset
was reported successful, but Apply-again and Back/Forward results were not
explicitly confirmed, so DEF-008 remains Ready for retest.

**Follow-up:** Tester subsequently confirmed Apply-after-clear and Back/Forward
restore the controls/results for the current page correctly. Clear all appears
only after filters are applied; this was understood and accepted as current
Apply-based behavior. The latency/pending-feedback issue remains Open.

#### Required investigation / remediation

1. Measure frontend navigation and backend request duration; compare development
   with a production build before attributing the delay to rendering or queries.
2. Provide appropriate pending feedback without showing results as updated early.
3. Optimize only demonstrated bottlenecks; preserve filters, authorization and
   consistency. No code changes made while recording this report.

#### Retest

- [ ] Noticeable navigation displays immediate accessible pending feedback.
- [ ] Cleared controls and records agree once navigation finishes.
- [ ] Apply again and Back/Forward do not revive stale filter values.
- [ ] Development/production timings and tested commits are recorded.

### DEF-012 - Save metadata and Set as cover lack visible hover feedback

**Related test:** CAT-011 / media-controls acceptance retest
**Environment:** Local frontend browser testing
**Found on:** User report; exact running commit not captured
**Severity:** S4 Minor
**Priority:** P2
**Status:** Ready for retest
**Owner:** Cataloging / Frontend

#### Repair evidence - 2026-10-07

Frontend branch `fix/cataloging-control-hover-feedback` replaces the undefined
forest-50 hover token on both buttons with the defined forest-100 token. Shared
button classes include enabled-only hover, visible keyboard outline and disabled
cursor/opacity. Submit actions, pending guards and authorization are unchanged.
Rendering checks cover both buttons; visual browser retesting remains required.

#### Reproduction

1. Open an active specimen's Media page with an existing image.
2. Hover Save metadata and Set as cover while the controls are enabled.

#### Expected

Enabled buttons provide visible hover feedback and accessible keyboard focus;
disabled or pending controls remain clearly distinguishable.

#### Actual / evidence - 2026-10-07

Tester reports neither button highlights/darkens on hover. No save or cover
mutation failure was reported. This is separate from native file-picker DEF-004.

#### Retest

- [ ] Both enabled buttons visibly respond to hover and keyboard focus.
- [ ] Pending/disabled states remain clear and do not imply the action is enabled.
- [ ] Metadata and cover mutations still save and persist after refresh.

### DEF-013 - CSV Choose file control lacks visible hover feedback

**Related test:** CAT-013 / import file selection
**Environment:** Local Cataloging import page
**Found on:** User report; exact running commit not captured
**Severity:** S4 Minor
**Priority:** P2
**Status:** Ready for retest
**Owner:** Cataloging / Frontend

#### Repair evidence - 2026-10-07

The same frontend branch shares Cataloging-only native-file interaction styles
between import and media pickers. CSV hover now uses forest-100, with keyboard
outline and distinct disabled/file-button states. Existing CSV accept/required
attributes, preview/import pending guards and validated import flow are preserved.
Rendering checks verify these contracts; browser appearance remains to be retested.

#### Reproduction

1. Open Cataloging Import.
2. Hover the enabled CSV Choose file control.

#### Expected / actual

The native file-selection button should give visible hover feedback. Tester
reports that it does not darken; choosing a file and previewing rows work.
This is the import picker, not the media picker covered by DEF-004.

#### Retest

- [ ] Enabled CSV file control responds visibly to hover and keyboard focus.
- [ ] Pending/disabled states remain distinct.
- [ ] File selection, preview validation and saving behavior remain unchanged.

### DEF-014 - Already-attached tag notice resembles successful new attachment

**Related test:** CAT-010 / duplicate tag relationship
**Environment:** Local specimen Tags page
**Found on:** User report; exact running commit not captured
**Severity:** S4 Minor
**Priority:** P2
**Status:** Ready for retest
**Owner:** Cataloging / Frontend

#### Repair evidence - 2026-10-07

Frontend branch `fix/cataloging-duplicate-tag-notice` distinguishes the existing
relationship outcome with an amber status notice and explicit Already attached —
no changes saved heading. New attachment/change/detachment notices stay green.
Text, not color alone, communicates the difference; the notice has role=status
and aria-atomic=true. Unknown query outcomes are ignored. No backend mutation,
duplicate prevention, shared vocabulary or revision behavior changes.
Nine focused page regressions cover notices, query handling and session gating.
Browser duplicate/revision and assistive-technology retests remain required.

#### Reproduction

1. Attach a tag to a specimen.
2. Submit the same name with different capitalization.
3. Observe the feedback after the duplicate-safe operation.

#### Expected / actual

No duplicate relationship should be created (confirmed working). The notice
should clearly distinguish an existing relationship from a newly saved one.
Tester reports the notice is green and resembles an attachment confirmation.

#### Recommended remediation

Use explicit wording such as Already attached - no changes saved, with an
accessible informational/warning treatment near the attachment workflow.
Do not rely only on color or mark a valid existing tag as erroneous. Preserve
backend duplicate prevention, shared vocabulary and no-op history behavior.

#### Retest

- [ ] Duplicate attachment has distinct, understandable no-change feedback.
- [ ] New attachment retains success feedback.
- [ ] No duplicate relationship or misleading new revision is created.
- [ ] Keyboard/screen-reader users can perceive the notice.

## 4. New defect template

Copy this section for each new failure:

```markdown
### DEF-XXX - Short, observable problem

**Related test:** TEST-ID
**Environment:** Development
**Found on:** frontend commit / backend commit
**Severity:** S1-S4
**Priority:** P0-P3
**Status:** Open
**Owner:** Module / person

#### Preconditions

#### Reproduction

1.
2.
3.

#### Expected

#### Actual

#### Evidence

#### Suspected scope

#### Retest

- [ ] Original reproduction no longer fails.
- [ ] Negative and regression cases pass.
```

When a defect is fixed, update its status to `Ready for retest`. A tester then
records the tested commit and changes it to `Verified`; do not erase the entry.
