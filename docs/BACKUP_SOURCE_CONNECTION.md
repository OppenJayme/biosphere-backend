# Explicit read-only Supabase inventory connection

This connects the [metadata inventory boundary](./BACKUP_SOURCE_INVENTORY.md)
to a dedicated PostgreSQL client and bounded Supabase Storage list requests.
It does not export application/Auth rows, download object bytes, create a
checkpoint, publish to B2, write Backup History, apply migrations or schedule
backups. Intended-source access still requires explicit owner authorization.

## Default and opt-in behavior

`npm run recovery:inventory:connect` prints a plan without reading credentials or
constructing transports. Inspection is deliberately explicit:

```text
npm run recovery:inventory:connect -- inspect --project-ref <project-ref> --authorization-ref <restricted-record-reference>
```

The authorization reference is an operator-supplied tracking reference, not a
cryptographically verified approval or an institutional-policy decision. It
does not authorize an agent to run the command against hosted data. Do not
include passwords, URLs, keys or tokens in command arguments or reports.

Supply only these dedicated variables through the approved secret mechanism:

| Variable                              | Purpose                                                                                                                                                                                        |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BIOSPHERE_INVENTORY_DATABASE_URL`    | Explicit direct or shared session-pooler PostgreSQL URI for database `postgres`. Use an approved limited role where supported; the tool does not create/grant one.                             |
| `BIOSPHERE_INVENTORY_STORAGE_API_KEY` | Explicit Storage API key for the `apikey` header.                                                                                                                                              |
| `BIOSPHERE_INVENTORY_STORAGE_BEARER`  | Explicit JWT access token for the Authorization header; permissions must allow the approved bucket/object metadata scope. The tool does not acquire/refresh one or infer a service-role token. |
| `BIOSPHERE_INVENTORY_DATABASE_CA_PEM` | Optional approved PEM CA certificate material when necessary for verified database TLS; never a private key or a filename to read automatically.                                               |

No `.env`, existing application URL or B2 credential is loaded. The tool does
not read `DATABASE_URL`, `DIRECT_URL`, `backblaze.env` or a DPAPI packet as a
fallback. Credential expiry, least privilege and source permission remain owner
responsibilities. Full/service-role credentials can exceed the needs of these
operations; accepting a credential does not certify its privilege scope.

## Connection restrictions

- Direct: exactly `db.<project-ref>.supabase.co:5432/postgres`, with an explicit
  database role and password.
- Shared session pooler: an explicitly supplied
  `aws-<index>-<region>.pooler.supabase.com:5432/postgres`, with username
  `<role>.<same-project-ref>`. Copy the approved endpoint from the provider; do
  not guess a cluster from the region. Transaction port 6543 is not supported.
- No arbitrary host, database, query/SSL option or URL fragment is accepted.
  URI query parameters such as `sslmode=disable` fail before I/O.
- Database TLS requires certificate verification and the configured hostname.
  A dedicated client sets read-only session defaults and bounded connection,
  query/statement, lock and idle-transaction timeouts. The existing inventory
  opens/rolls back its own read-only snapshot and the connector closes the client.
- Storage goes only to `https://<same-project-ref>.supabase.co:443` using
  bucket-list GET and object-list POST routes. No redirect, proxy adapter,
  download, upload, delete or retry is supplied. Native HTTPS uses certificate
  verification and a non-shared agent.
- TLS/debug/preload runtime overrides are rejected before credentials are used.
  Do not disable certificate verification to overcome a connection failure.
  These checks prevent accidental unsafe invocation; they do not make an already
  compromised Node runtime or host safe. Use a trusted clean execution context.

Configured project addresses agreeing is not independent evidence of a real
project's identity. Results retain `sourceIdentityVerified: false` and all
backup/content/consistency limitations from the inventory guide. TLS settings
were inspected and exercised only through synthetic transport substitution in
local tests, not verified against a hosted Supabase project. Direct IPv6 or
session-pooler reachability must be measured separately in the intended runner.

## Storage contract and bounds

Storage list requests use the installed SDK's documented REST shape. Bucket
lists explicitly page by offset, up to the inventory's 1,000-bucket bound.
Object lists page 1,000 entries at a time with stable name sorting, and traverse
folders separately; folder markers are not counted as files. A full page causes
another offset request. Object metadata with an absent/null size becomes
unknown, not an asserted zero-byte object; invalid numeric sizes fail the
inventory check. Object keys and cursor state are never returned in the summary.

Traversal is bounded by the existing inventory's page/object/deadline limits,
plus 10,000 prefixes, 64 nested segments and 1,024-character object keys. This
adapter supports one-segment list entry names; malformed folder markers,
duplicate folders and unsupported path shapes fail instead of silently skipping.
Provider permissions may filter listings; success does not prove that every
object is visible to the supplied token. Object content and configuration are
not inspected, and lists can change during inspection.

Each HTTP request has a four-second deadline, a two-MiB response-body limit,
strict JSON responses and no redirect handling. Active HTTP requests are
destroyed when inspection finishes/fails; the database is closed in the final
cleanup path. Errors are normalized without raw provider diagnostics, URLs,
tokens or names. Some provider failures surface as the inventory boundary's
generic failure code. A cleanup failure cannot be reported as successful
inspection. Secrets exist in process memory; zeroization is not promised.

## Verification and limitations

- `npm run test:recovery:inventory:connection`: no-I/O plan, wrong-project and
  unsafe URL/runtime/header configuration checks with synthetic values.
- `npm run test:recovery:inventory:connection:db`: one owned PostgreSQL fixture
  plus a loopback-only synthetic Storage HTTP server. The trusted test transport
  substitutes only system boundaries: the database client points to generated
  fixture credentials and HTTPS requests are routed to the local HTTP server.
  There is no command-line loopback mode or TLS-disable option in production.
- Cases cover recursive and offset listing, unknown sizes, denial, redirects,
  malformed/oversized responses, timeout and real database-authentication
  failure, including connection cleanup and sanitized output.

These checks do not prove deployed Supabase permissions, real TLS/network
connectivity, complete provider visibility, source consistency, actual exported
size, backup/restore, B2 integration or production readiness. The standalone
command is plan-only by default; a real read-only inspection needs its own
explicit source/credential authorization and resource limits. BAK-002 stays
Deferred. No daily schedule is enabled by this implementation.

Provider references: [database connection modes](https://supabase.com/docs/guides/database/connecting-to-postgres),
[object listing and folder markers](https://supabase.com/docs/reference/javascript/storage-from-list),
[bucket listing](https://supabase.com/docs/reference/javascript/storage-listbuckets).
