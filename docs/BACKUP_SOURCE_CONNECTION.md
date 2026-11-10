# Explicit read-only Supabase inventory connection

This assembles the [inventory boundary](./BACKUP_SOURCE_INVENTORY.md) with a
dedicated PostgreSQL client and bounded Storage metadata requests. It exports
no application/Auth records, downloads no object bytes and creates no backup,
B2 object, history entry, schema change or schedule. Intended-source access
requires its own explicit owner authorization.

## Default and opt-in behavior

`npm run recovery:inventory:connect` prints a no-I/O plan. To inspect an
explicitly authorized source:

```text
npm run recovery:inventory:connect -- inspect --project-ref <project-ref> --authorization-ref <restricted-record-reference>
```

The default object source is **database metadata**: one parameterized aggregate
over the five required buckets' visible `storage.objects` rows, within the
catalog inspection's read-only snapshot. It avoids a request per owner folder.
Only bucket listing uses Storage HTTP in this mode.

To compare the API-visible listing explicitly, append `--object-source api`.
This retains recursive/offset listing and its existing traversal limits; it may
time out on a large source. `--object-source database` selects the default
explicitly. No automatic fallback or retry changes the inventory's meaning.

The authorization reference is operator tracking, not verified institutional
approval. Results record its SHA-256 digest as `authorizationReferenceSha256`,
including inspection failures; keep the original reference/mapping in the
restricted operating record. No raw reference, password, URL, key or token
belongs in reports. The digest does not write an Audit/Backup History entry,
prove authorization or authorize an agent to access hosted data.

## Dedicated credentials

Supply these only through an approved protected execution mechanism:

| Variable                              | Purpose                                                                                                                                                                                     |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BIOSPHERE_INVENTORY_DATABASE_URL`    | Explicit direct or shared session-pooler URI for database `postgres`. Use an approved limited database role with the required catalog/Storage metadata permissions.                         |
| `BIOSPHERE_INVENTORY_STORAGE_API_KEY` | Explicit Storage `apikey` value.                                                                                                                                                            |
| `BIOSPHERE_INVENTORY_STORAGE_BEARER`  | JWT token for legacy/publishable-key authentication. Omit or leave empty for `sb_secret_...` key-only mode. A secret key is never sent as a bearer JWT.                                     |
| `BIOSPHERE_INVENTORY_DATABASE_CA_PEM` | Approved database CA certificate PEM when the chain is not already trusted by Node. Obtain the correct project/provider CA in advance; do not assume the default trust store is sufficient. |

No `.env`, application URL, B2 credential or DPAPI packet is loaded. Do not put
secrets in arguments or source files. The tool does not acquire/refresh tokens,
create roles, grant access, verify credential scope or accept a private key as
a CA. Secret API keys have elevated privileges; this tool's read-only operations
do not make those credentials least-privilege.
See [Supabase API-key guidance](https://supabase.com/docs/guides/getting-started/api-keys).

## Connection restrictions

- Direct: exactly `db.<project-ref>.supabase.co:5432/postgres`, with an explicit
  role/password.
- Shared session pooler: an approved
  `aws-<index>-<region>.pooler.supabase.com:5432/postgres`, with username
  `<role>.<same-project-ref>`. Copy the endpoint from the provider; do not guess
  the cluster. Transaction port 6543 is unsupported.
- Arbitrary hosts/databases, URI query/SSL overrides and fragments are refused.
- Database TLS verifies the chain and hostname. Supply the approved CA when
  necessary; never disable certificate verification to overcome a failure.
- Pooler-sensitive `options`, server statement/lock timeouts and idle-transaction
  settings are not sent as connection startup parameters. The core starts
  `BEGIN ... READ ONLY`, sets transaction-local statement/lock/idle timeouts and
  checks read-only state before inspection. Client connection/query deadlines
  remain enabled; each dedicated connection closes on completion/failure.
- Storage uses only verified HTTPS to the same project's fixed bucket/object
  list routes. No redirects, shared agent, download, mutation or retry is added.
- Unsafe TLS/debug/preload invocation settings are rejected. These checks do not
  protect a runtime or host already compromised before the command starts.

`configuredProjectAddressesAgree: true` appears only after successful inventory.
It describes configuration agreement, not independent project authentication.
`sourceIdentityVerified`, content verification, capture consistency and backup
completion remain false. Actual hosted CA/pooler/network behavior remains to
be verified under separate authorized access.

## Database sizing and visibility

The SQL mode returns aggregate counts and declared byte totals only. It needs
SELECT visibility of `bucket_id`, `name` and `metadata`; no grants are created.
It reports `storageInventoryBasis: DATABASE_ROLE_VISIBLE_METADATA` and
`storage.rowSecurityActive`. A real restricted-role fixture demonstrates that
RLS can reduce these counts. Direct SQL is **not** assumed to bypass RLS or
prove full visibility. HTTP bucket visibility can also be restricted.

Counts cover all visible metadata rows in the selected buckets, potentially
including noncurrent versions/delete markers. They are not interchangeable
with current-file API listing counts. Unsupported/missing scope or insufficient
privileges fails rather than falling back silently.

Missing/null sizes remain explicitly unknown. Negative, fractional,
string-valued or unsafe numeric sizes and totals fail closed. Known integral
JSON numbers are aggregated with bounded numeric conversion. The exact
`.emptyFolderPlaceholder` basename is excluded only when its declared size is
zero, and excluded rows are counted in `placeholderObjects`. Nonzero or
unknown-size namesakes remain included. No names are returned.

Physical DB size and declared metadata bytes are not measured exported or
encrypted checkpoint size. Neither mode reads file content, confirms its
existence, coordinates writers or grants a capacity/readiness verdict.

## Explicit API comparison and resource limits

API mode lists buckets by offset and recursively pages objects by stable name.
Folder markers are not files; zero-byte dashboard placeholder objects are also
excluded/count-reported. Unknown sizes stay unknown. Existing limits remain:
30-second traversal allowance across buckets, 1,000 pages per bucket, 100,000
objects overall, 10,000 prefixes, 64 nested segments and 1,024-character keys.
Do not raise them merely to make a large inventory pass.

HTTP has a four-second per-request deadline, two-MiB response limit, JSON-only
responses and no redirects/retries. Active requests are destroyed at cleanup.
Errors return safe codes, not raw diagnostics. Cleanup failure cannot report
success. Secrets exist in process memory; zeroization is not promised.

## Verification and remaining limits

The existing command and owned PostgreSQL/loopback HTTP suites cover default
SQL sizing at hundreds of owner folders, actual RLS visibility, malformed and
unknown sizes, placeholders, API traversal, both key formats, startup settings,
safe result/reference fields, response failures/timeouts and cleanup.

Synthetic boundaries substitute the database destination and route HTTPS
requests to a local HTTP server; no CLI TLS-disable or loopback mode is exposed.
These tests do not prove deployed Supabase permissions, TLS or pooler behavior,
complete provider visibility, real project identity, source consistency,
capture/restore, B2 integration, scheduling or budget sufficiency. BAK-002 stays
Deferred. No live inspection was performed.

Provider references: [database connections](https://supabase.com/docs/guides/database/connecting-to-postgres),
[object listing](https://supabase.com/docs/reference/javascript/storage-from-list),
[bucket listing](https://supabase.com/docs/reference/javascript/storage-listbuckets).
