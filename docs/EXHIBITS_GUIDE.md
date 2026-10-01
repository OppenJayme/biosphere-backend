# BioSphere QR Exhibits and WebAR Guide

This module implements SRS Section 4.12 (QR Exhibit Management and Public QR
Pages) and the curator side of Section 4.13 (Selected WebAR Experiences) using
the existing `exhibit`, `exhibit_media`, and `ar_asset` tables, with no schema
change. Developer AR deployment (Section 4.2) lives in `src/developer`.

## Roles

| Actor | Can do | SRS |
| --- | --- | --- |
| Curator | Create, edit, publish, unpublish, disable, and archive exhibit pages; manage images; download the QR code and label; replace the URL; turn an exhibit's uploaded AR on or off | REQ-4.12-01..11, REQ-4.13-02 |
| Developer | Upload, replace, activate, deactivate, and remove AR assets for an exhibit | REQ-4.13-03, REQ-4.2-04/05 |
| Visitor | Open a published page by its URL or QR code, no account needed | REQ-4.12-12 |

Developers cannot use any curator exhibit route (403), and curators cannot
upload AR assets.

## Curator endpoints (`CURATOR` only)

- `POST /exhibits` `{ specimenId, publicSlug, ...content, publicSpecimenFields? }`:
  only a Cataloged specimen approved for public display, with no other active
  exhibit (REQ-4.12-02, BR-20). Starts `UNPUBLISHED`. `publicSpecimenFields`
  defaults to every approved field (see
  [Public specimen fields](#public-specimen-fields-req-412-03)).
- `GET /exhibits?status=&arEnabled=&search=`: active exhibits. `search` matches
  the slug, common name, scientific name, or accession number.
- `GET /exhibits/:id`: includes images with short-lived `previewUrl`s.
- `PATCH /exhibits/:id`: edit `publicDescription`, `interestingFacts`,
  `distribution`, `diet`, `layoutType`, and `publicSpecimenFields`. The public
  URL never changes here (REQ-4.12-10). On a published exhibit, an edit that
  would break the [publish-readiness rule](#publish-readiness) returns 400.
- `PATCH /exhibits/:id/replace-url` `{ publicSlug }`: intentional page
  replacement. QR codes printed for the old URL stop working and show the
  unavailable state. Audited with both slugs. A retired slug stays reserved,
  so no other exhibit can take it and make old labels open a different
  specimen; only the exhibit that retired it can take it back.
- `PATCH /exhibits/:id/publish | unpublish | disable | archive`: see
  [Lifecycle](#lifecycle).
- `PATCH /exhibits/:id/ar` `{ enabled }`: turn AR on or off (see
  [AR](#ar)).
- `GET /exhibits/:id/qr?format=png|svg&size=128..2048`: the QR code.
- `GET /exhibits/:id/label`: a printable SVG label.
- `POST /exhibits/:id/media` (multipart `file`, `caption?`, `displayOrder?`,
  `isCover?`), `PATCH /exhibits/:id/media/:mediaId` `{ caption?, displayOrder?,
  isCover? }`, `DELETE /exhibits/:id/media/:mediaId`. Setting a cover clears
  the previous one.

Every change is written to the audit log in the same transaction
(REQ-4.12-11), e.g. `CREATE_EXHIBIT`, `PUBLISH_EXHIBIT`, `UNPUBLISH_EXHIBIT`,
`DISABLE_EXHIBIT`, `ARCHIVE_EXHIBIT`, `REPLACE_EXHIBIT_URL`,
`ENABLE_EXHIBIT_AR`, `DISABLE_EXHIBIT_AR`, `ADD/UPDATE/REMOVE_EXHIBIT_MEDIA`.
`CREATE_EXHIBIT` records the starting field selection. `UPDATE_EXHIBIT`
records `changedFields` and, when the selection changed,
`publicSpecimenFields: { previous, current }`. Content text is never copied
into the audit log.

Curator responses include `publicSpecimenFields` (the selection, in display
order), `missingForPublish` (why it cannot be published yet: `identifyingName`
and/or `publicInformation`, or `[]`), and `emptySelectedFields` (selected
fields this specimen has no value for), so the frontend can show the field
toggles, warn about empty fields, and disable Publish.

## Public specimen fields (REQ-4.12-03)

The curator chooses which specimen fields appear on each exhibit's public
page. They are stored in `exhibit.public_specimen_fields` (`TEXT[]`) and
checked against a strict allowlist (`src/exhibit/exhibit-public-fields.ts`):

`commonName`, `scientificName`, `collection`, `kingdom`, `phylum`, `class`,
`order`, `family`, `genus`, `species`, `habitat`, `ecologicalRole`,
`conservationStatus`

- Any other key, a duplicate, a non-array, or `null` returns 400. Restricted
  fields (accession number, remarks, storage, condition, provenance, curator
  or audit data) are not on the list and can never be shown (REQ-4.12-08).
- The selection is stored in allowlist order, whatever order it was sent in.
  An empty list shows no specimen fields.
- The column is `NOT NULL`, and its migration default is the full list, so
  existing exhibits keep the page they had until a curator changes it.
- It fails closed: if a stored selection is ever missing or not a list, the
  public page shows no specimen fields, and unknown stored keys are ignored.
  A bad value can only hide fields, never show more.
- The selection covers specimen-derived fields only. The exhibit's own content
  (`publicDescription`, `interestingFacts`, `distribution`, `diet`,
  `layoutType`) and its images in `exhibit_media` are not part of it.

A selected field with no value for this specimen is left off the public page
and listed in `emptySelectedFields` as a warning; it never blocks publishing.

## Publish readiness

An exhibit only needs enough approved information to be meaningful to a
visitor. `publish` succeeds when all of these hold:

- The specimen is Cataloged, not archived, and approved for public display
  (REQ-4.12-02, BR-20).
- The exhibit has a unique public URL (checked when it is created or its URL
  is replaced).
- **`identifyingName`:** `commonName` or `scientificName` is selected and has a
  value.
- **`publicInformation`:** at least one other piece of public information has a
  value: the description, interesting facts, distribution, or diet, or any
  other selected specimen field (collection, a taxonomy rank, habitat,
  ecological role, conservation status).

Otherwise it returns 400, naming each unmet requirement, e.g.
`Missing: identifyingName.` No single content item is required: a specimen
may have no known diet, distribution, images, or AR. Images and AR are always
optional.

A published exhibit must stay publishable: an edit that would hide every name
or remove the last piece of public information returns 400. An unpublished
draft can be edited freely.

## Lifecycle

SRS B.3: Unpublished -> Published -> Unpublished or Disabled.

| From | `publish` | `unpublish` | `disable` | `archive` |
| --- | --- | --- | --- | --- |
| `UNPUBLISHED` | yes (re-checks specimen eligibility and [publish readiness](#publish-readiness)) | no-op | 400 | yes |
| `PUBLISHED` | no-op | yes | yes | yes |
| `DISABLED` | 400 | 400 | no-op | yes |
| archived | 400 | 400 | 400 | no-op |

- `UNPUBLISHED`: a draft, or a page taken offline for now. It can be published
  again.
- `DISABLED`: intentionally retired from public use.
- Archived: final and read-only.

Only a published exhibit can be disabled; retire an unpublished draft with
archive. B.3 has no Disabled -> Published transition, so a disabled exhibit
stays disabled until it is archived. Archiving is final: the exhibit becomes
read-only (including its images), leaves curator lists, and its QR code and
label can no longer be generated.

## Public page

`GET /exhibits/public/:slug` (no token) returns only approved public content
(REQ-4.12-08, REQ-4.13-07): the specimen fields the curator selected
(REQ-4.12-03), the curator's description, facts, distribution, and diet, the
layout, images as short-lived signed URLs, and the AR block. A specimen field
that is not selected, or is selected but has no value, is left out of the
response rather than sent empty; the shown taxonomy ranks are grouped under
`taxonomy`, which is left out when none are shown. It never returns storage locations, condition notes, remarks,
accession numbers, curator attribution, or audit data.

A missing, unpublished, disabled, or archived page, or one whose specimen is no
longer Cataloged, is archived, or is no longer approved for public display,
returns the same 404 message, so nothing about it is revealed (REQ-4.12-09).
Specimen eligibility is checked on every request, so the page stops being
public as soon as the specimen changes.

## QR code and label

- The QR encodes the public page URL:
  `${PUBLIC_SITE_URL}/exhibits/<slug>` (falls back to `FRONTEND_URL`). Set
  `PUBLIC_SITE_URL` to the production visitor domain before printing.
- The code is generated on request, never stored, and does not expire. The
  same URL always gives the same code, so a damaged label is fixed by
  downloading and printing it again; earlier prints keep working.
- Error correction level H lets a printed code scan with up to about 30% of it
  damaged.
- The label (REQ-4.12-06) shows the museum name, specimen names, the QR code,
  and the complete human-readable URL (wrapped, never shortened), so visitors
  without a scanner can type it (REQ-4.12-12).
- A printed code stops working only if the exhibit is unpublished, disabled, or
  archived, or its URL is intentionally replaced.

## AR

AR state lives in `ar_asset` (one row per model file, linked by `exhibit_id`,
with `is_enabled`). No exhibit column is used.

1. The developer uploads an exhibit's model (`.glb` or `.usdz`) through
   `/developer/ar-assets` (REQ-4.13-03, REQ-4.2-04/05). `GET
   /developer/ar-exhibits` lists active exhibits, plus archived ones that still
   hold assets, so the developer can pick where to deploy and clean up.
2. The curator turns AR on or off with `PATCH /exhibits/:id/ar { "enabled" }`
   (REQ-4.13-02). This enables or disables all of the exhibit's uploaded
   assets. Turning it on before any asset exists returns 400. Selection is the
   curator's decision; BioSphere never scores or ranks specimens for AR
   (REQ-4.13-08). Developers can still activate or deactivate individual
   assets.
3. The public page sets `ar.available = true`, with signed model URLs, while
   at least one asset is enabled (REQ-4.13-01/04). A model whose file cannot
   be signed is left out. The frontend still checks device support and asks
   for camera permission only after the visitor taps View in AR
   (REQ-4.13-05).
4. Turning AR off hides it immediately and keeps the files, so it can be
   turned back on without a new upload. The normal page stays available either
   way (REQ-4.13-06).

Curator responses include `arEnabled` (at least one asset enabled) and
`arAssetCount` (assets uploaded). `GET /exhibits?arEnabled=true|false` filters
on the same rule.

### AR preparation request (REQ-4.13-02)

Marking an exhibit as requested for AR preparation is an operational handoff,
not a stored state: the curator selects the exhibit and asks the developer
outside BioSphere, the developer uploads the asset to that exhibit, and the
curator then decides with the on/off switch whether it is shown. No schema
field records the request. Being public-display approved makes an exhibit
eligible to receive an AR asset; it does not mean the curator selected it for
AR. REQ-4.13-02 should be updated in the SRS to describe this workflow.

## Configuration

- `PUBLIC_SITE_URL`: visitor-facing site used in QR codes and labels. In
  production, QR codes and labels return 503 until it (or `FRONTEND_URL`) is
  set, so no label is printed with a `localhost` address.

## Not in scope

- PDF labels: the label is SVG, which browsers print directly.
