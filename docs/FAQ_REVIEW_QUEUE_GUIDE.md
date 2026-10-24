# Opt-in FAQ question review — 2026-10-25

## Status and authority

Implemented on paired `feat/faq-opt-in-review-queue` branches. **Disabled by
default; migration prepared only, not applied. No live question collection.**
The user approved isolated HTTP/UI checks and migration preparation only.
This is a working project policy, not institutional/privacy/legal sign-off.
It supersedes the older automatic unanswered-question logging proposal for
this slice: ordinary ask requests still do not create review records.

## Visitor contract

- Only a successful `NO_MATCH` response can offer the optional UI. A failed
  ask, answer, clarification or visit referral does not offer it.
- The offer appears only after GET `/faq/assistant/review-policy` explicitly
  reports enabled. Failure or malformed policy hides it.
- The visitor reviews/edits one question, sees the personal-data/retention
  warning and checks an initially unchecked consent checkbox before submission.
  Editing clears consent. Neither opening the offer nor asking sends feedback.
- POST `/faq/assistant/review-submissions` accepts only `question` (trimmed,
  1–500 characters), `consent: true` and a random UUID `submissionId`.
  Cookies/referrer are omitted by this client. No account, IP, contact fields,
  selected FAQ ID or conversation history are stored by the review service.
- Free text can still contain personal information. This is **not a guarantee
  of anonymity or de-identification**. Infrastructure must independently avoid
  request-body logging; the service cannot guarantee proxy/provider log behavior.
- Only confirmed `{accepted:true}` produces acknowledgement. Failure preserves
  the text/token in component memory and offers explicit retry, not automatic
  resubmission. Editing creates a separate submission; reload/leaving loses the
  in-memory receipt, so cross-reload idempotency is not guaranteed.
- Submission does not publish knowledge, promise an answer or promise contact.
  The server does not prove the text previously received NO_MATCH: this is a
  separately consented public feedback endpoint, not persisted chat tracking.

## Grouping, access and audit

NFKC/case/whitespace-normalized exact text is SHA-256 grouped; punctuation and
other wording differences remain separate. A hash is not anonymization.
Same-token retries within the group's lifetime do not increase `repeatCount`;
reusing that token for different normalized text returns 409. Separate explicit
opt-ins increment the count and reopen the group as PENDING, without extending
its original expiry. Counts mean submissions, **not distinct visitors**.

Authenticated active CURATOR callers alone can GET `/faq/review-queue?page=1`,
PATCH `/:id` with REVIEWED/DISMISSED, or DELETE `/:id`. Anonymous/Developer
callers are denied by the real authentication/role guards. Results are bounded
to 25, ordered latest-first, and exclude expired entries. Internal hashes and
retry receipts are not returned. UI: FAQ Knowledge → Review opt-in unanswered
questions. Text is escaped, never interpreted as instructions or HTML.

Reviewed/dismissed is a disposition, not deletion or FAQ activation. Curators
use the separate FAQ authoring/approval flow for any new answer or alias.
Permanent removal requires an explicit confirmation in the UI and cascades
retry receipts. Queue reads, dispositions and deletion create content-free
audit events: actor/action/record ID/count/status, **not question/hash**. A failed
read audit fails closed without returning question text. Database adapters in
tests do not prove transaction rollback or actual RLS/concurrency.

## Retention and deployment gate

**30 days from the first grouped submission** is the chosen project baseline,
not a statutory requirement. Repeat submissions and review do not renew it.
Expiry immediately excludes text from queue reads/dispositions; this is not
physical deletion. Source clocks must be synchronized. Receipts share the
group lifetime and cascade on removal. After deletion/expiry, a new opt-in can
start a new group even with a previously used token.

Prepared command (do not run against a shared database without authorization):

```powershell
npx --no-install ts-node scripts/purge-expired-faq-review.ts
# Default: read-only count of expired groups.
# Only an authorized cleanup job adds --apply for irreversible deletion.
```

The command requires a dedicated `FAQ_REVIEW_CLEANUP_DATABASE_URL`, never falls
back to the main connection, emits counts only, and fails nonzero with a generic
message. No command was executed or scheduled in this task. A deployment-owned
job should run at least daily with failure/missed-run monitoring; thus expiry
and physical disposal have different deadlines. Backups can retain text until
their separately approved retention/deletion policy; removing a live row does
not erase backups. The UI notice must match the actually approved policy.

Before setting `FAQ_REVIEW_ENABLED=true`, the deployment/privacy owners must:

1. Review the migration and test it on an authorized disposable database:
   schema/constraints, service role grants, anonymous/authenticated RLS denial,
   cascading receipts, transactions, concurrent grouping and retry uniqueness.
2. Verify least-privilege API and cleanup connections; review logging/telemetry
   and redact bodies. Treat hashes/free text as sensitive, with restricted access.
3. Approve the notice, 30-day baseline, backup policy and accidental-PII removal
   procedure; ensure it matches deployment reality.
4. Deploy and verify scheduled expiry deletion, failure alerts and missed-run
   detection; exercise the purge on disposable expired fixtures first.
5. Deploy backend before frontend; confirm disabled behavior without tables,
   then obtain independent end-to-end acceptance before public enablement.

Existing public throttling is 10 requests/minute/IP, including retries. It is
in-memory and may affect shared networks; it is not distributed bot protection.
Evaluate deployment-wide abuse controls before rollout rather than claiming
the feature is spam-proof. Turning the flag off stops submission/queue access,
not the separately scheduled purge. No LLM/provider or automatic publishing was
introduced. Minimization, access control and disposal follow the principles in
the [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html);
the exact 30-day policy is our project decision.

## Isolated evidence and limits

- `test/faq-review.e2e-spec.ts`: 12 passing HTTP cases using real Nest routes,
  validation, guards and service with synthetic auth/database adapters. Includes
  default-off, consent/field boundaries, Curator-only access, dispositions,
  removal, audit redaction/fail-closed reads, grouping/idempotency, expiry,
  safe failure/retry and the actual route throttle. Existing FAQ suite plus this
  suite: **41/41**. No live database/RLS/cleanup/concurrency proof.
- Frontend request, action and static page/form tests: **20/20** focused checks.
  Real API client and rendering run with synthetic HTTP/session boundaries.
  They cover escaped text, disposition requests, denial/errors and login
  redirect; not actual curator hydration/confirmation interaction.
- Real visitor widget on temporary `127.0.0.1:3002`: consent gate, zero implicit
  submissions, locally aborted first submission, retained question and same-token
  successful synthetic retry, acknowledgement, disabled-policy and ask-error
  exclusion passed. Two synthetic submission requests; zero live FAQ requests
  forwarded and zero unexpected mutation attempts. Only the probe tab closed;
  existing signed-in windows and production frontend/backend were preserved.
- Real curator row component in a credential-free browser bundle, with only
  its remote Server Action replaced: escaped question, thrown action failure,
  text retention, explicit retry, reviewed/dismissed status, removal confirmation,
  cancellation without removal and hidden removed text passed. Synthetic command
  sequence: REVIEWED (failed), REVIEWED, DISMISSED, REMOVE. No request forwarded.
  The initial harness failed because its bundle lacked a browser NODE_ENV
  replacement; correcting the harness resolved it. This was not an application
  defect. It does not prove full Next authenticated-page hydration or persistence.
- Final regression run: backend units **690/690**, isolated HTTP **361/361**
  (live Developer suite explicitly excluded), frontend **399/399**. Both type
  checks passed; frontend lint clean, backend lint zero errors with seven
  pre-existing unused-disable warnings. Known negative-path/fixture diagnostics
  remain visible in backend runs; no logger or guard was suppressed to pass.
  Prisma generate/validate succeeded locally; neither command applied SQL.
- Curator live browser lifecycle, migration, RLS, real rollback/concurrency,
  physical purge, scheduler and independent acceptance remain pending. No
  acceptance case or existing defect is promoted to Passed/Verified by this slice.
