# Backend Architecture Notes

Drafted 2026-08-27 alongside `frontend-architecture.md`. This file describes the intended
structure for the **separate** `biosphere-backend` repo — the NestJS modular monolith the
frontend talks to over REST. Move this file into that repo's `docs/` (or delete it from here
once transferred). See `CLAUDE.md` and `BioSphere-SRS.pdf` / `BioSphere-Final-Capstone-1.pdf`
in this repo for the full product scope and requirement IDs (`REQ-*`, `NFR-*`, `BR-*`) this
structure needs to satisfy.

## 1. Module boundaries

NestJS modules should match the SRS's functional sections (§4.1–4.15) one-to-one, and match the
frontend's `features/` folders by name (see the frontend doc, §3) so a bug in one domain is easy
to find in both repos:

| NestJS module | SRS section | Frontend `features/` folder |
|---|---|---|
| `auth` | 4.1 Authentication and Curator Account Management | `auth` |
| `developer` | 4.2 Restricted Developer Functions | `developer` |
| `specimens` | 4.4 Specimen Inventory and Cataloging | `specimens` |
| `specimen-lots` | 4.5 Specimen Lot Grouping and Quantity Management | `specimens` (sub-feature) |
| `storage-locations` | 4.6 Hierarchical Storage-Location Management | `storage-locations` |
| `reports` | 4.7 Search, Filtering, Reports, and Export | `reports` |
| `inquiries` | 4.8 General Inquiry Management | `inquiries` |
| `visit-requests` | 4.9 Visit-Request Management | `visit-requests` |
| `faq` | 4.11 Controlled Knowledge-Based FAQ Assistant | `faq` |
| `exhibits` | 4.12 QR Exhibit Management and Public QR Pages | `exhibits-qr` |
| `ar-assets` | 4.13 Selected WebAR Experiences | `exhibits-qr` (sub-feature) |
| `sync` | 4.14 Selected Offline Inventory Operations and Synchronization | `offline` |
| `audit` / `backup` | 4.15 Audit Logging, Backup, and Recovery | (curator dashboard reads only) |

Cross-cutting, not feature modules: `PrismaModule` (DB connection), `StorageModule` (Supabase
Storage wrapper), `MailModule` (SendGrid wrapper), `AuthGuardModule`/RBAC decorators.

## 2. Anatomy of one module

Every domain module follows the same internal shape — this is standard NestJS, called out here
just so it's consistent project-wide:

```text
src/specimens/
├── specimens.module.ts       # wires controller + service + Prisma + guards together
├── specimens.controller.ts   # HTTP routes only — no business logic here
├── specimens.service.ts      # business logic, validation rules, calls Prisma
├── dto/
│   ├── create-specimen.dto.ts   # class-validator decorators — the source of truth
│   ├── update-specimen.dto.ts   #   the frontend's zod schemas should mirror these
│   └── query-specimen.dto.ts    # search/filter/pagination params
├── entities/
│   └── specimen.entity.ts    # response shape (what actually gets serialized to JSON)
└── specimens.service.spec.ts # unit tests colocated with the service
```

Controllers should stay thin — validate input via DTOs (`class-validator` +
`ValidationPipe`), delegate everything else to the service. Business rules from SRS §5.5
(`BR-01`…`BR-22` — e.g. lot-quantity preservation, archive-not-delete, public-approval gating)
belong in the **service** layer, not the controller, so they're enforced no matter which route
calls them.

## 3. Top-level structure

```text
src/
├── main.ts                    # bootstrap, global pipes/filters, Swagger setup
├── app.module.ts               # root module, imports every feature module
│
├── auth/
│   ├── auth.module.ts
│   ├── auth.controller.ts      # login/onboarding-invite/password-recovery endpoints
│   ├── auth.service.ts
│   ├── guards/
│   │   ├── supabase-auth.guard.ts   # verifies the Supabase JWT on every protected route
│   │   └── roles.guard.ts           # RBAC: curator vs developer
│   └── decorators/roles.decorator.ts
│
├── developer/
├── specimens/
├── specimen-lots/
├── storage-locations/
├── reports/
├── inquiries/
├── visit-requests/
├── faq/
├── exhibits/
├── ar-assets/
├── sync/                       # accepts batched offline Uncataloged drafts, dedupes on retry
├── audit/                      # AuditLog, SpecimenRevisionHistory, StorageMovementHistory writers
├── backup/                     # pg_dump/pg_restore orchestration, BackupHistory
│
├── common/
│   ├── filters/http-exception.filter.ts
│   ├── interceptors/           # e.g. audit-log interceptor, response-shaping interceptor
│   ├── pipes/
│   └── decorators/current-user.decorator.ts
│
├── prisma/
│   ├── prisma.module.ts
│   ├── prisma.service.ts
│   └── schema.prisma            # the six ERD clusters from the capstone doc (Fig. 8)
│
├── storage/
│   └── storage.service.ts       # Supabase Storage wrapper (images, exhibit media, 3D/AR assets)
│
└── mail/
    └── mail.service.ts          # SendGrid wrapper — outbound only, see BR-21/BR-22
```

## 4. How the frontend talks to this

- Every protected route is guarded by `SupabaseAuthGuard` (verifies the JWT the frontend sends
  as `Authorization: Bearer <token>`) plus a `RolesGuard` for curator-vs-developer separation
  (`BR-12`). Never trust a role claim without re-checking server-side — the frontend's `proxy.ts`
  redirect is a UX nicety, not a security boundary.
- All endpoints are documented via `@nestjs/swagger` decorators so the frontend can eventually
  generate `types/api.ts` from the OpenAPI spec instead of hand-syncing DTOs.
- Public endpoints (inquiry/visit-request submission, FAQ query, QR exhibit read, published
  Gallery data) live in the same modules as their curator-facing counterparts but on separate
  unguarded routes — keep the DTOs/entities returned to public routes deliberately narrower than
  the curator ones (`NFR-SEC-08`: never leak internal specimen/storage/audit fields publicly).
- Rate limiting (`NFR-SEC-15`) belongs on auth, account-recovery, public forms, and FAQ routes —
  `@nestjs/throttler` at the module or route level.

## Open items / not yet decided

- Whether `sync` is its own module or folded into `specimens` — depends on how much offline-draft
  logic ends up being just "create an Uncataloged specimen," vs needing its own
  conflict/dedupe rules.
- Whether reports (`REQ-4.7-*`, DOCX/PDF/CSV export) are generated in the `reports` service
  directly or delegated to a small worker/queue if generation time becomes a bottleneck at scale
  (60k-record NFR-PERF-02 target).
- Final Prisma schema file organization — one `schema.prisma` vs multiple `.prisma` files via
  `prismaSchemaFolder` preview feature, once the full ERD (Figs. 9–14 in the capstone doc) is
  finalized.
