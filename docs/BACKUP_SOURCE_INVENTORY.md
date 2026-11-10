# Read-only source inventory boundary

Prepared against backend develop `cab23ab1f511415ae274f1645ed8abd17453e761`.
This is the first metadata-only adapter slice. It is not a database export,
complete hosted connector, snapshot coordinator or deployment-readiness check.
No application environment file, provider credential or connection is discovered.

## Public command boundary

`scripts/recovery/source-inventory.cjs` exports async
`runInventory(argv, adapters)`. `plan`/`help` or no arguments return a plan without
touching adapters. `inspect` requires an explicitly assembled trusted database
and Storage adapter. Other arguments fail before accessing either adapter.

Direct execution prints one sanitized JSON result and succeeds only for the
plan. `node scripts/recovery/source-inventory.cjs inspect` fails with
`SOURCE_INVENTORY_ADAPTER_REQUIRED`: the executable intentionally has no live
credential or connection fallback. The isolated database checks exercise the
public command function with owned real PostgreSQL and synthetic Storage data;
they do not prove a hosted process-launch or credential-delivery path.

The caller supplies:

- `database`: a dedicated connected, idle PostgreSQL client with `query(sql)`.
  The caller owns connection setup, TLS/source authentication, network timeout
  and shutdown. Do not supply an application pool's in-flight transaction: the
  inventory starts and rolls back its own read-only repeatable-read transaction.
- `expectedDatabase`: the expected database name. A mismatch stops before Storage
  inspection. Matching a common name such as `postgres` does not authenticate a
  Supabase project; results explicitly keep `sourceIdentityVerified: false`.
- `storage.listBuckets()`: returns bucket records with string `id` values.
- `storage.listObjects({bucketId, cursor, pageSize})`: returns normalized real
  object records `{key, sizeBytes}` and `nextCursor` (opaque string or `null`).
  The trusted future provider adapter must traverse nested prefixes, exclude
  directory placeholders and provide all object pages. A provider response
  shape is not assumed or directly accepted. Explicit `null` size means unknown;
  missing, negative and unsafe numeric sizes are rejected.

Alternatively, a trusted adapter can provide
`storage.summarizeObjects({bucketIds})` instead of `listObjects`. It runs inside
the read-only SQL transaction and returns one decimal-string aggregate per
required bucket (`objects`, `declaredObjectBytes`, `unknownSizeObjects`,
`invalidSizeObjects`, `placeholderObjects`) plus boolean `rowSecurityActive`.
The core validates bucket identity/uniqueness, safe totals and zero invalid-size
rows. The connection command defaults to this SQL mode; the base command still
has no connection fallback. The result labels its `storageInventoryBasis`, and
SQL-visible metadata is not assumed to be unfiltered by permissions/RLS.

## What inspection measures

The base database portion reads catalogs/settings and physical database size;
it does not select specimen, Auth or visitor row contents. It checks six required
table names, reports the scoped table count, PostgreSQL version number,
additional non-system schemas and extension count. It does not certify the
schema's correctness or schema/version compatibility. All other customizations
still require inventory and review.

Storage checks require all five existing application buckets. Additional buckets
and schemas prevent `scopeComplete: true`; this flag means only that no scope
outside the configured schema/bucket set was observed. It never establishes a
complete recoverable application. No bucket settings, object contents, policies,
Auth capabilities or cross-service consistency are verified.

The optional SQL summary reads aggregate Storage metadata, not file bytes or
specimen/Auth/visitor contents. Zero-byte dashboard placeholder objects are
excluded and counted separately in either supported connection mode. Unknown
and nonzero-size namesakes are not silently dropped. SQL totals cover all
role-visible metadata rows, which may differ from current-file API listings.

Results contain aggregates only: no database name/URL, object names, pagination
cursors, secrets or raw provider exception. Physical DB size includes overhead;
declared object sizes are metadata, not verified downloaded bytes. Unknown sizes
are counted separately; totals cannot be treated as complete when any are
unknown. There is no computed checkpoint size, free-budget verdict or export
capacity guarantee. Every result keeps deployment authorization false.

## Failure and resource bounds

The SQL transaction sets five-second statement and one-second lock timeouts and
rolls back on success or failure. Connection/query transport timeouts remain a
caller obligation. Rollback failure returns a sanitized failure, not success.
Storage calls have five-second response deadlines and traversal has a thirty-
second deadline checked between pages, with at most 1,000 pages per bucket,
1,000 objects per page and 100,000 objects overall. In-flight adapters are not
cancelled by the generic timeout and must implement bounded/cancellable I/O;
the function never retries. No default native transport is enabled.

Duplicate bucket IDs/object keys, repeated cursors, malformed pages and unsafe
integer arithmetic fail closed. A failure returns no partial sizing summary as
success. The caller must not use a failed result to authorize an export or
retention deletion. PostgreSQL snapshot consistency applies only to this catalog
inspection, not to later Storage metadata or a future data backup.

## Isolated verification

- Plan only: `npm run recovery:inventory`.
- Local CLI checks: `npm run test:recovery:inventory`.
- Owned SQL boundary: `npm run test:recovery:inventory:db`, using the existing
  fixture dependencies and reviewed PostgreSQL image. The command explicitly
  opts into only the owned fixture; it never accepts a hosted connection URL.
- The database suite owns a fresh container and synthetic schemas/records and
  uses the existing ownership-checked fixture cleanup. It accepts no external
  database URL and does not touch live credentials or buckets.
- The existing ordinary CI jobs run these focused checks; no extra scheduled
  workflow or provider secret is introduced.

No check here proves a real project's identity, hosted least privilege,
completeness of provider pagination, actual object bytes, source write
coordination, export/restore, peak production resource use or provider billing.
No scheduler, hosted adapter or production read permission is enabled.
