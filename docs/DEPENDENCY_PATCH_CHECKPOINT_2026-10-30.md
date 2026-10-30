# Backend security dependency patch - 2026-10-30

OBS-005 follow-up on base `560222c` (application source `f4df176`). The isolated
branch updates these resolved versions, with a scoped Multer override described
below:

| Package | Before | After | Reason |
| --- | --- | --- | --- |
| body-parser | 2.3.0 | 2.4.0 | Patched compressed-request trailing-byte handling |
| qs | 6.16.0 | 6.17.1 | Compatible resolution required by body-parser's newer dependency range; removes the reported qs entry |
| handlebars | 4.7.9 | 4.7.10 | Patched development-tool template/AST issues; reached through ts-jest |
| multer | 2.2.0 | 2.5.0 | Patched multipart upload handling; scoped to the Nest Express adapter |
| prisma / @prisma/client / @prisma/adapter-pg | 7.10.0 | 7.10.1 | Coordinated vendor patch release; regenerate the client before build/test |
| fast-uri | 3.1.6 | 3.1.9 | Compatible transitive resolution used by Prisma/build tooling |
| brace-expansion | 1.1.18 / 2.1.4 / 5.0.9 | 1.1.21 / 2.1.7 / 5.0.12 | Compatible resolutions on each existing development-tool major branch |

Framework major versions, application code and runtime configuration are
unchanged. Express's `^2.2.1` body-parser range and ts-jest's `^4.7.9`
Handlebars range already permit the selected updates. proxy-addr remains 2.0.8.

Besides the three coordinated Prisma patch pins, `package.json` adds the parent-scoped override
`"@nestjs/platform-express": { "multer": "2.5.0" }`. Registry inspection of
Nest adapter 11.2.6, 11.2.7 and the current 11.x legacy tag 11.2.8 found each
still pins Multer 2.4.0. That remains affected by the latest reported teardown
advisory, patched in 2.5.0. The override avoids upgrading Nest to 12.x or changing
unrelated dependencies. It deliberately replaces the adapter's exact transitive
pin and therefore needs compatibility review, not just a semver-range assertion.
Remove it when the chosen adapter natively supplies a suitable patched Multer
and the affected checks pass.

The final lock also drops unused concat-stream/typedarray nodes and marks
remaining shared stream helpers development-only after Multer removes its
concat-stream dependency. These are dependency-graph changes, not app logic.

## Final verification including Prisma and transitive patches - 2026-10-30

The coordinated Prisma update resolves deepmerge-ts 8.0.2 and mysql2 3.24.4
through vendor-selected dependencies. fast-uri and brace-expansion were then
updated within their existing declared ranges; no root dependency or override
was added for them. Other lock changes are Prisma runtime/engine/support and
configuration-reader dependencies, not an application/schema refactor.
`@prisma/engines-version` has upstream identifier
`8.1.0-1.d1b3f377ca835d73fd50954a5e22128b9ebdd6b8`; registry metadata for
`@prisma/engines@7.10.1` confirms that exact dependency. The CLI, client and
PostgreSQL adapter all remain 7.10.1; the engine identifier is not a root major
version upgrade.

- A fresh script-disabled `npm ci` installed 940 packages. Prisma Client
  7.10.1 generated with the synthetic loopback datasource; build passed.
- **701/701 unit tests in 53 suites** and **222/222 existing HTTP tests in seven
  suites** passed. These replace the earlier graph verification below rather
  than being additional unique cases. Unit logs include intentional mocked
  failure-path errors/warnings; they were not suppressed or claimed absent.
- The already-authorized collection suite passed **16/16 real SQL/HTTP checks**
  using the generated client/PrismaPg 7.10.1 in a fresh owned PostgreSQL
  container. It covers create/read/audit, normalized uniqueness, concurrent
  collisions, migration behavior and atomic rollback. The intentional audit
  permission revocation emitted SQL 42501 through Prisma P2039; its rollback
  assertion passed. Node's experimental VM warning is expected.
- The fixture uses its pinned image digest, random synthetic identities,
  loopback-only ephemeral port and tmpfs; the helper verifies its owner label
  before removing the container. Before/after owned-collection container lists
  were empty. No shared datasource, migration, live provider or Inventory data
  was used. Environment: Node 24.7.0, local Docker server 28.4.0.
- Full lint passed with **0 errors / 6 unused-disable warnings** in unchanged
  files. Installed resolution readback and `git diff --check` passed.
- Production audit: **3 moderate / 0 high / 0 critical**, down from 12 affected
  package entries. Full audit: **3 moderate / 8 low / 0 high / 0 critical**,
  down from 22. Both still exit 1. Remaining production entries are csv-parse,
  @nestjs/swagger and its js-yaml dependency; these are not three independent
  exploit paths. OBS-005 remains Open for their disposition/repair.

The lock-comparison diagnostic initially hit PowerShell's empty-property JSON
limitation, then a sandboxed Node child-process permission error. Reading a
separately exported baseline with Node corrected the diagnostic; no app code
was changed for those stops. Application servers and browsers were untouched.
These results do not establish real museum/lot concurrency, live provider
compatibility, exploit reproduction, independent sign-off or rollout. Earlier
stages below retain their own versions/counts and do not override this result.

## Intermediate verification including Multer - 2026-10-30

- A fresh `npm ci --ignore-scripts --prefer-offline --no-audit --no-fund`
  accepted the override/lock and installed 942 packages. Installed readback
  reports Multer 2.5.0 overridden beneath platform-express 11.2.3, body-parser
  2.4.0, qs 6.17.1, Handlebars 4.7.10 and proxy-addr 2.0.8.
- The existing generated Prisma client was retained; no migration or database
  operation occurred. `npm run build` passed after the clean install.
- **222/222 existing HTTP tests passed in seven suites:** specimens,
  public-submissions, specimen-lots, proxy-trust, specimen-media, exhibits,
  and developer-ar-exhibits. This final run includes the earlier 136 cases;
  it is not 222 additional cases. The added suites exercise real multipart
  parsing with synthetic auth/database/storage adapters, without real uploads
  to museum storage, visitor messages or live credentials.
- Production audit: **8** affected-package entries (5 high / 3 moderate /
  0 critical), down from the original 12. Full audit: **17** (6 high /
  3 moderate / 8 low / 0 critical), down from 22. Neither audit lists Multer or
  platform-express. Both still return exit 1 for residual findings.
- `git diff --check` passed. Application servers and signed-in browser windows
  were untouched. These checks do not reproduce the upstream exploits or prove
  live storage/concurrency, a clean audit, independent acceptance or rollout.

OBS-005 remains Open for the residual CSV/Prisma/Swagger/tooling findings. The
earlier three-package checkpoint below is preserved as historical evidence.

## Initial parser/tooling verification before the Multer follow-up

- `npm ci --ignore-scripts --prefer-offline --no-audit --no-fund` completed in
  the owned worktree. Deprecation notices for existing glob/eslint versions
  were retained; they were not suppressed or treated as fixes.
- Prisma Client 7.10.0 generated using a synthetic loopback datasource string,
  with no migration or database connection. The first sandboxed generation
  failed on Prisma cache-file permissions; the same generation succeeded with
  the cache-access permission. No application repair was needed for that stop.
- `npm run build` passed.
- Existing Nest/Express HTTP regressions passed **136/136 in four suites**:
  `specimens`, `public-submissions`, `specimen-lots`, and `proxy-trust`.
  Authentication/database adapters are synthetic; public submission mail is
  mocked. No live fixture, account, email or database was used.
- Production audit: **12 -> 10** affected-package entries, now 7 high,
  3 moderate, 0 critical. Full development audit: **22 -> 19**, now 8 high,
  3 moderate, 8 low, 0 critical. Both audits returned exit 1 for residual findings.
- Installed dependency readback and `git diff --check` passed. The running
  frontend/backend and signed-in browsers were left untouched.

This verifies compatible resolution, build and existing HTTP behavior. It does
not reproduce malicious compressed-body or template payloads, establish live
provider/database behavior, or claim a clean security audit/deployed repair.
At this initial checkpoint, Multer/upload, CSV, Prisma/tooling, Swagger/YAML and remaining development
advisories still require their recorded triage and targeted repairs.

## Review and rollout

Review the parser/tooling and coordinated Prisma updates, scoped override and graph cleanup, the
audit delta and affected regression results. No broad framework upgrade,
`npm audit fix --force`, shared migration or production restart is included.
Merge/CI and a separately scoped rollout are required before calling the
running application patched. The manual Inventory acceptance checklist remains
separate from the [supporting lot API regressions](./SPECIMEN_LOTS_GUIDE.md#supporting-http-regression-checkpoint---2026-10-30).

Upstream: [body-parser advisory](https://github.com/advisories/GHSA-27r3-jxmh-p828),
[Handlebars AST compilation advisory](https://github.com/advisories/GHSA-8r5x-fm3f-whwj)
and [Handlebars own-property advisory](https://github.com/advisories/GHSA-p8wg-vrv2-v86f).
Multer: [upstream 2.5.0 release](https://github.com/expressjs/multer/releases/tag/v2.5.0)
and [async-fileFilter teardown advisory](https://github.com/advisories/GHSA-q7qp-rjg7-q26m).
The latter requires an asynchronous fileFilter; no such application option was
found in the inspected upload controllers. This does not dismiss the other
Multer advisories or establish comprehensive non-exploitability. No exploit
payload was sent to shared servers.
Prisma: [upstream 7.10.1 release](https://github.com/prisma/orm/releases/tag/7.10.1).
