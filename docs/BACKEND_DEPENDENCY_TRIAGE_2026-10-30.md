# Backend dependency triage - 2026-10-30

Read-only assessment of backend `f4df176` and its installed lockfile, following
the proxy-addr 2.0.8 repair. No dependency install/update, exploit request,
configuration change, server restart or database operation was performed.
OBS-005 remains Open; this assessment is not a security approval.

## Audit evidence

| Audit scope | Critical | High | Moderate | Low | Total |
| --- | --- | --- | --- | --- | --- |
| `npm audit --omit=dev --json --ignore-scripts` | 0 | 8 | 4 | 0 | 12 |
| `npm audit --json --ignore-scripts` | 1 | 9 | 4 | 8 | 22 |

These are npm's affected-package entries, including parent packages affected
through dependencies, not twelve or twenty-two independent exploit paths.
Both commands returned findings (exit 1). Private raw reports remain outside
Git; dependency paths were checked with `npm ls`. The full-tree audit took
longer than the production-only request; no application timing conclusion is
drawn from registry response time. Counts describe this snapshot only.

## Runtime and toolchain relevance

| Group / installed versions | Source evidence and applicability | Next repair scope |
| --- | --- | --- |
| `@nestjs/platform-express` 11.2.3 / `multer` 2.2.0 | Real import, specimen-media, exhibit-media and Developer asset routes use `FileInterceptor`. Role guards reduce access; they do not repair multipart parsing. Several advisory conditions differ; no shared-server reproduction was attempted. | Prioritize upload dependencies. Registry metadata for platform-express 11.2.6 still pins multer 2.4.0, which remains inside the latest reported affected range; that parent upgrade alone is insufficient. Verify a compatible parent release or explicitly reviewed narrow override before changing the lock. |
| `body-parser` 2.3.0 | Express 5.2.1 declares `^2.2.1`; Nest enables normal body parsing and public JSON routes exist. Compressed request parsing occurs before controller validation. | Assess a lock-only resolution to patched 2.4.0 within the declared range; test normal and bounded compressed-body/error handling in isolation. |
| `csv-parse` 5.6.0 | Import uses `columns: true`, but does not enable `group_columns_by_name`. The reported duplicate-header branch requires both; that specific condition was not established here. | Plan a separately verified parser update; audit suggests 7.0.3, a major change. Preserve CSV/XLSX preview/selected-commit contracts and header validation; do not force-upgrade just to clear the count. |
| `@nestjs/swagger` 11.4.7 / nested `js-yaml` 5.3.0 | Startup generates OpenAPI and serves `/docs`; application source does not parse uploaded YAML. No visitor-controlled YAML parsing path was identified. Serving generated documentation is not itself proof of the advisory's YAML-input condition. | Review a compatible Swagger/dependency update. Audit suggests Swagger 12.0.5, a major change; check Nest peers and docs generation before selecting it. |
| `@prisma/config` 7.10.0 / `deepmerge-ts` 7.1.5 / `prisma` 7.10.0 | Included through Prisma's dependency tree. The application service uses generated PrismaClient with PrismaPg. No request-to-recursive-config-merge path was identified in application source. | Evaluate coordinated Prisma/client/adapter 7.10.1 metadata and compatibility; use synthetic generation/build and disposable database checks if changed. No shared migration is authorized. |
| `mysql2` 3.15.3 | Present through Prisma, but schema provider is PostgreSQL and runtime service constructs PrismaPg. No application MySQL connection path was identified. | Address through the Prisma dependency update; presence alone does not establish exposed MySQL protocol behavior. |
| `fast-uri` 3.1.6 | `prisma` -> `@prisma/dev` -> `@prisma/streams-local` -> `ajv`; no direct application import was identified. | Review parent-compatible transitive update with Prisma tooling; do not label unreachable in every CLI/deployment context. |
| `qs` 6.16.0 | Express/body-parser depend on it. The reported issue concerns `stringify` with comma array format and unusual object values; no direct application call using that combination was found. | Assess compatible transitive patch together with request-parser regressions. |
| Development tree: `handlebars` 4.7.9; `brace-expansion` 1.1.18/2.1.4/5.0.9; low-severity parents | Handlebars comes from ts-jest; brace-expansion comes from build/lint/test tools. Handlebars is critical in the full audit and absent from the production-only audit. No application template-compilation endpoint was found. Development tools still need patching. | Prioritize compatible Handlebars 4.7.10 resolution (registry version confirmed), then compatible brace-expansion branches. Reject audit-suggested major downgrades of Jest/Nest CLI as an automatic fix. |

## Repair order and verification

1. Prepare a separate dependency branch for compatible request-body and
   development-tool patches. Review lock changes, preserve proxy-addr 2.0.8,
   use script-disabled install, and run affected HTTP/build/test-tool checks.
2. Resolve the upload dependency path against current parent metadata. Patched
   multer versions must cover all applicable advisories, not just the first
   listed one. Use synthetic guarded upload/error fixtures, never destructive
   payloads against the shared running backend.
3. Assess Prisma, CSV and Swagger changes separately where API/peer changes
   require it. Re-audit both scopes; report residual entries and conditions.
4. Obtain review of dependency/runtime changes, then perform any separately
   authorized local rollout. A source patch is not deployment evidence.

No `npm audit fix --force`, broad framework upgrade, new feature or production
deferral is approved by this triage. Source-path relevance above is an inference
from inspected code/dependency metadata, not a successful exploit or exhaustive
proof of non-exploitability. Existing acceptance checks are not requeued merely
because this assessment was documented.

## Upstream advisory references

- [Multer crafted field-name denial of service](https://github.com/advisories/GHSA-wc9g-mqfw-jrwm)
  and [pending async fileFilter teardown](https://github.com/advisories/GHSA-q7qp-rjg7-q26m).
  The latter identifies 2.5.0 as patched for that issue.
- [body-parser compressed-body trailing bytes](https://github.com/advisories/GHSA-27r3-jxmh-p828)
  identifies 2.4.0 as the patched 2.x release.
- [CSV duplicate-column prototype replacement](https://github.com/advisories/GHSA-8cw4-87c7-c6xx).
- [js-yaml merge-limit CPU behavior](https://github.com/advisories/GHSA-r3ph-w7gj-g6xm).
- [DeepmergeTS recursive-object stack exhaustion](https://github.com/advisories/GHSA-ggr8-5vv4-36mx).
- [Handlebars AST compilation injection](https://github.com/advisories/GHSA-8r5x-fm3f-whwj)
  and [own-property check bypass](https://github.com/advisories/GHSA-p8wg-vrv2-v86f)
  identify 4.7.10 as patched for those issues.
