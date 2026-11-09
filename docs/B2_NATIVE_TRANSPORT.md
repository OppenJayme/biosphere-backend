# Native HTTPS transport for synthetic checkpoint transfer

Prepared November 9, 2026. This implements the transport contract of the
[isolated checkpoint engine](./B2_CHECKPOINT_TRANSFER.md). It is a separately
reviewable follow-up to #278, which follows #276. It does not enable a deployed
backup, authorize provider access or consume the owner's B2 credentials.

## Explicit connection

`scripts/recovery/b2-native-request.cjs` exports `requestB2(options)`, compatible
with the engine's explicitly supplied `request` function. Imports make no
requests. There is no CLI, credential/configuration reader, dynamic adapter
loader, automatic engine wiring or schedule. Connecting this function to an
authorized real session would make actual HTTPS requests; doing so is a later
owner-authorized action, not something performed by the tests.

For reviewed caller code only, the intended connection is:

```javascript
const { requestB2 } = require('./b2-native-request.cjs');
// After independent scope/credential/live-run approval:
// await publishCheckpoint({ ...approvedOptions, request: requestB2 });
```

The owner credential bridge remains unimplemented. No administrative credential,
application key, encryption key or environment secret is discovered by this
adapter. Its authorization header comes only from the engine's explicit request.
Do not put keys in command arguments, logs or the example above.

## Transport constraints

- Only the engine's Native v4 operations are permitted: bucket metadata,
  upload-URL lookup, upload, file metadata and immutable-file-ID download. There
  is no authorization/key-creation, deletion, file-listing, hiding or retention-update
  endpoint in this adapter.
- Requests require HTTPS, approved B2 API/pod/download host patterns, default
  port, the expected path/method/query shape, and no URL credentials/fragment.
  The engine additionally validates the exact account/bucket/prefix/version.
- TLS verification is explicitly enabled. A caller cannot supply a CA override,
  custom lookup, `rejectUnauthorized: false`, Host override, proxy authorization
  or other arbitrary request options. Each call uses `agent: false`; the adapter
  creates no shared connection pool. This assumes a trusted Node/OS environment
  and its normal certificate authorities, not protection from a compromised host.
- Request headers have a strict allowlist and reject duplicate case variants
  and control characters. Content-Length is derived from the exact outgoing
  bytes. Metadata is capped at 64 KiB; the existing encrypted-file ceiling is
  64 MiB. Per-object retention headers permit Governance only, with a future
  decimal deadline no more than 24 hours away. No Legal Hold or bypass header
  is accepted.
- Input budgets/method/headers are copied before dispatch. Mutating the caller's
  original options while a response is pending cannot enlarge the validated cap.
  Callers must treat a supplied body Buffer as immutable while it is being sent.
- Response headers are bounded by Node's 16 KiB HTTP-header parser option.
  Non-200 status, redirects and compressed responses are rejected before body
  collection. No redirect or retry is performed, including on 429/5xx.
- Declared lengths are checked before allocation. Received bytes are copied
  into one buffer bounded by the validated response budget, not an accumulating
  list of arbitrarily many chunks. Overruns, malformed/duplicate lengths,
  length mismatch, incomplete messages, aborts and stream errors fail closed.
- One absolute deadline, at most 20 seconds, covers connection/headers/body.
  Expiry explicitly destroys the request and any response. Receiving a slow
  stream of bytes never resets the deadline. Premature request/response close
  settles the promise immediately. Late events cannot turn failure into success.
- Errors contain static codes only; raw Node/provider exceptions and headers
  are not logged. The engine maps transport failure to its existing sanitized
  error and keeps its upload-uncertainty marker when an upload may have been sent.

The implementation uses Node's public
[HTTPS request API](https://nodejs.org/api/https.html#httpsrequesturl-options-callback).
The [HTTP timeout documentation](https://nodejs.org/download/release/latest-jod/docs/api/http.html)
explains that a timeout event alone does not abort a request; the adapter's
deadline performs explicit destruction rather than relying on that event.

The byte cap includes payload buffering, not a measured whole-process RAM or
CPU guarantee. Source encryption, checkpoint loading, TLS and the caller have
additional memory costs. Capacity and runner-budget approval remain pending.

The 64 MiB ceiling is not a promise that an upload fits the 20-second deadline.
Before an authorized live publication, measure the actual ciphertext size and
conservative available upstream throughput on the intended connection. At
64 MiB, body transfer alone needs approximately 26.8 Mbit/s over 20 seconds,
leaving no time for connection setup or response/readback. Use a smaller
synthetic checkpoint and a comfortable time margin; if feasibility is unknown,
stop before publication. Do not use a live upload to benchmark the link. An
upload timeout may follow a remote commit and retains `uploadMayExist: true`;
never discard that receipt or retry publication automatically. The deadline
remains bounded rather than silently changing for a larger payload.

## Verification boundary

```powershell
node --test test/b2-native-transfer.test.cjs
```

The test seam remains the real publication/recovery workflow and existing
checkpoint loader with synthetic files. Only Node's external `https.request`
boundary is replaced. Actual Node Readable/Writable streams carry synthetic
HTTP responses; mocked timers exercise the absolute deadline without a wait.
No socket, DNS lookup, live TLS handshake, provider request or actual key is used.

Cases cover the streamed round trip, advertised/streamed oversize bodies,
redirects, compression, malformed/short lengths, incomplete responses, stalled
headers, slow drips, premature closes and unsafe caller overrides. Mocked
server commit followed by upload error/timeout preserves the engine's intent
receipt and refuses a second upload. These are local simulated outcomes, not
proof of real B2 commit behavior, TLS trust, DNS routing or transport performance.
The native options assertions do not constitute a live certificate-validation
test. Node's MockTimers experimental warning on older supported runtimes is a
test-runtime warning, not an observed BioSphere error.

Several response/deadline cases and mutable-budget enforcement were observed
failing before their implementation. November 9 local verification passed all
30 native-workflow checks, and 70/70 combined native/transfer/store checks, with
zero skipped on Windows Node 22.14.0 and 24.7.0. Scoped CJS lint, formatting,
workflow parsing and document-target checks passed. Pushed-head CI is recorded
separately in the PR. Existing checkpoint/transfer cases stay
in the same Windows/Linux CI checks. This follow-up does not close BAK-002 or
establish credential custody, source export, full-service recovery, scheduling
or institutional acceptance.
