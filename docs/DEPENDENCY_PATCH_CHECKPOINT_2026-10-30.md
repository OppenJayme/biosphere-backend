# Compatible parser/tooling dependency patch - 2026-10-30

OBS-005 follow-up on base `560222c` (application source `f4df176`). The isolated
branch changes only these resolved packages in `package-lock.json`:

| Package | Before | After | Reason |
| --- | --- | --- | --- |
| body-parser | 2.3.0 | 2.4.0 | Patched compressed-request trailing-byte handling |
| qs | 6.16.0 | 6.17.1 | Compatible resolution required by body-parser's newer dependency range; removes the reported qs entry |
| handlebars | 4.7.9 | 4.7.10 | Patched development-tool template/AST issues; reached through ts-jest |

`package.json`, framework major versions, application code and configuration
are unchanged. Express's `^2.2.1` body-parser range and ts-jest's `^4.7.9`
Handlebars range already permit the selected updates. proxy-addr remains 2.0.8.

## Verification

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
Multer/upload, CSV, Prisma/tooling, Swagger/YAML and remaining development
advisories still require their recorded triage and targeted repairs.

## Review and rollout

Review the three changed lock entries and their integrity/declared ranges, the
audit delta and affected regression results. No broad framework upgrade,
`npm audit fix --force`, shared migration or production restart is included.
Merge/CI and a separately scoped rollout are required before calling the
running application patched. The manual Inventory acceptance checklist remains
separate from the [supporting lot API regressions](./SPECIMEN_LOTS_GUIDE.md#supporting-http-regression-checkpoint---2026-10-30).

Upstream: [body-parser advisory](https://github.com/advisories/GHSA-27r3-jxmh-p828),
[Handlebars AST compilation advisory](https://github.com/advisories/GHSA-8r5x-fm3f-whwj)
and [Handlebars own-property advisory](https://github.com/advisories/GHSA-p8wg-vrv2-v86f).
