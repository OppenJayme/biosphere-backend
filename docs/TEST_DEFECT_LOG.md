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
| DEF-001 | 2026-09-29 | Cataloging / Collections   | Duplicate normalized collection names are accepted                      | S2 Major    | P1       | Open   | Cataloging / Backend    |
| DEF-002 | 2026-10-03 | Cataloging / Provenance    | Future collection dates are accepted and satisfy presence validation    | S2 Major    | P1       | Open   | Cataloging / Full stack |
| DEF-003 | 2026-10-03 | Cataloging / Specimen list | Client-side specimen selection does not hydrate on a remote LAN browser | S2 Major    | P1       | Open   | Cataloging / Frontend   |
| DEF-004 | 2026-10-03 | Cataloging / Media UI      | Choose-file controls have no visible hover feedback                     | S4 Minor    | P2       | Open   | Cataloging / Frontend   |
| DEF-005 | 2026-10-03 | Cataloging / Tags UI       | Vocabulary search hides the matching tag names                          | S4 Minor    | P2       | Open   | Cataloging / Frontend   |
| DEF-006 | 2026-10-03 | Cataloging / Revision UI   | Media history exposes raw identifiers and storage paths                 | S4 Minor    | P2       | Open   | Cataloging / Frontend   |
| DEF-007 | 2026-10-03 | Cataloging / Specimen list | Selected-specimen preview never displays its cover image                | S3 Moderate | P2       | Open   | Cataloging / Full stack |

## 3. Defect details

### DEF-001 - Duplicate normalized collection names are accepted

**Related test:** CAT-001  
**Environment:** Development  
**Found on:** current `develop` during frontend acceptance testing

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

**Status:** Open

**Owner:** Cataloging / Full stack

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

**Status:** Open

**Owner:** Cataloging / Frontend

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

**Status:** Open

**Owner:** Cataloging / Frontend

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

**Status:** Open

**Owner:** Cataloging / Frontend

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

**Status:** Open

**Owner:** Cataloging / Frontend

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

**Status:** Open

**Owner:** Cataloging / Full stack

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
