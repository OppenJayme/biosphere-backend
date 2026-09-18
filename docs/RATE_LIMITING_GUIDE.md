# BioSphere API Rate-Limiting Guide

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
recovery and public FAQ queries when those endpoints are introduced.
