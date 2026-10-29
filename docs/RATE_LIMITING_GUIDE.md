# BioSphere API Rate-Limiting Guide

## Merged local dependency refresh - 2026-10-29

Backend #217 merged at `f4df1761b6326f282f865c7749093d2f0a338749`. Voltaire
[independently approved the patch](https://github.com/OppenJayme/biosphere-backend/pull/217#issuecomment-6499447844)
on `64c4829`: request-IP tests 4/4 on 2.0.8, the advisory case failing on 2.0.7,
lint clean and audit 12 remaining / zero critical. Deployed proxy configuration
was not verified by his synthetic fixture.

The normal local backend was subsequently stopped, its previous compiled build
and source/lockfile references preserved privately, and dependencies installed
from the exact merged lockfile with scripts disabled. Client generation and
production compilation completed without migration. The rebuilt app started
on port 3001 as PID 26116; health and runtime Swagger returned 200. Installed
`proxy-addr` is 2.0.8. No trust-proxy setting, throttle limit, account, Inventory
record or database schema was changed by the refresh. The inspected app source
still contains no explicit trust-proxy enablement.

This is a local dependency deployment checkpoint, not a clean security audit,
production proxy-policy validation or remediation of the remaining 8 high /
4 moderate advisories. OBS-005 remains open for those findings. Earlier
statements below that the runtime was not updated describe the pre-rollout
isolated patch checkpoint.

BioSphere uses NestJS Throttler as a defense-in-depth per-IP request limiter.
Rate limiting supplements authentication, authorization, validation, and any
production reverse-proxy controls; it does not replace them.

## Current limits

| Scope                                    |         Limit |     Window |
| ---------------------------------------- | ------------: | ---------: |
| General API safety ceiling               |  300 requests | 60 seconds |
| `POST /auth/login`                       |    5 requests | 60 seconds |
| Intended public inquiry submission       |   10 requests | 60 seconds |
| Intended public visit-request submission |   10 requests | 60 seconds |
| Public FAQ Assistant (`/faq/assistant/*`) |   30 requests | 60 seconds |
| `GET /` health check                     | Not throttled |        N/A |

The stricter method-level limits override the general ceiling. Authentication
and role guards remain independent: applying a throttle does not make a route
public. The inquiry and visit-request submission routes retain their current
authentication behavior until those modules are deliberately completed.

## Operational boundary

The built-in storage is process-local and is appropriate for the current
single-instance backend. Before running multiple NestJS instances, configure a
shared throttler storage so all instances enforce one consistent counter.

When deploying behind Nginx or another proxy, configure trusted proxy handling
and forwarded IP headers together. Do not blindly trust client-supplied
`X-Forwarded-For` headers, or an attacker could evade per-IP limits.

Keep limits centralized in `src/config/rate-limit.config.ts`. Add stricter
method-level limits to future public or sensitive routes such as password
recovery when those endpoints are introduced.

## Proxy address dependency repair - 2026-10-29

The lockfile updates only `proxy-addr` from 2.0.7 to 2.0.8, within Express
5.2.1's existing `^2.0.7` requirement. No direct dependency, override, trust
policy, authentication, throttle limit or application source was changed.
This addresses [GHSA-jqcg-44mw-7w3h / CVE-2026-90711](https://github.com/advisories/GHSA-jqcg-44mw-7w3h),
which affects request-IP trust when an IPv4-mapped IPv6 trust subnet has an
incorrect short prefix. Source inspection found no explicit `trust proxy`
enablement in this backend; the advisory is not evidence of exploitation or
verification of deployed proxy configuration. The dependency finding was
originally recorded as OBS-005 in the pending XLSX PR #216; this patch is
independent of that feature and its parser review.

### Isolated HTTP evidence

`test/proxy-trust.e2e-spec.ts` creates fresh Express HTTP fixtures on ephemeral
`127.0.0.1` ports and closes them after each request. The real Express/request-IP
stack processes synthetic forwarded headers; no internal dependency function
is mocked. On 2.0.7, three controls pass but the malformed-subnet case fails:
the unrelated loopback peer can supply the forged `198.51.100.66` client IP.
On 2.0.8, all four cases pass:

- Default proxy distrust ignores the forwarded address.
- Explicit IPv4 loopback trust retains forwarded-address behavior.
- Correct full-prefix mapped-IPv6 loopback trust retains that behavior.
- `::ffff:10.0.0.0/8` does not trust an unrelated IPv4 loopback peer.

The unchanged real Nest Storage Inventory HTTP fixture also passes 5/5,
including protected access/validation and denial-audit readback using synthetic
auth/database adapters. Combined 9/9; changed-file ESLint, TypeScript and diff
checks pass. Run the same checks after clean dependency/client setup:

```sh
node --experimental-vm-modules node_modules/jest/bin/jest.js --config ./test/jest-e2e.json --runInBand proxy-trust.e2e-spec.ts storage-inventory.e2e-spec.ts
```

`npm audit --omit=dev --json` changes from 13 advisories (4 moderate, 8 high,
1 critical) to 12 (4 moderate, 8 high, **0 critical**), with `proxy-addr` absent
and no newly affected packages. These counts are the Oct 29 registry snapshot,
not a clean audit or proof that all security exposure is resolved. Remaining
advisories need separate compatible updates/applicability review.

### Release limits and review

Voltaire/backend dependency review should verify the lockfile's limited diff,
rerun the nine tests and audit, and confirm the real deployment's proxy policy.
Synthetic fixture trust settings are not application configuration changes.
No credentials, live login, shared record, email, server or proxy settings were
used or changed. The running app's installed dependency was not updated.
Reinstall from the merged lockfile and perform the normal controlled release
before claiming the deployed critical dependency has been remediated. Preserve
the existing default distrust unless the deployment owner explicitly defines
trusted hops/subnets; a dependency patch does not configure them.
