# BioSphere Integrated Specimen Detail Guide

This catalog integration slice provides one protected curator read endpoint for
the related records already implemented across the BioSphere inventory model.
It introduces no database structure or new cataloging business rule.

## Endpoint

- `GET /specimens/:id/details`

The endpoint requires an authenticated, active BioSphere account with the
`CURATOR` role. A malformed UUID receives `400 Bad Request`; an unknown specimen
receives `404 Not Found`.

## Response sections

- `specimen`: the core record, including archived records when addressed by UUID
- `collection`: the configured collection record or `null`
- `taxonomy`: the specimen taxonomy record or `null`
- `provenance`: the specimen provenance record or `null`
- `activeLots`: active lots with their current storage-unit records
- `lotOverview`: active-lot count and total active specimen quantity
- `media`: private media metadata in display order
- `tags`: attached tags in stable case-insensitive name order

The response is assembled with one Prisma relation read. Only active lots are
included because inactive lots and their changes remain historical records.
Lot transactions and specimen revisions remain on their existing bounded,
paginated endpoints instead of being added to the detail payload.

Media records expose the private storage object path to the curator client. A
client must continue using the dedicated signed-URL endpoint when it needs to
display an image; this endpoint does not create public or permanent URLs.

## Deliberate boundaries

This endpoint does not:

- decide whether an `UNCATALOGED` specimen is complete;
- change specimen status or public-display eligibility;
- enforce accession-number uniqueness or duplicate matching;
- include revision or lot-transaction history;
- include offline synchronization receipts;
- expose the record through a public route.

Catalog-completion, duplicate-detection, bulk-import, and accession-number rules
remain deferred until the museum/team confirms their requirements.
