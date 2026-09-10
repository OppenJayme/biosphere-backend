# BioSphere Prisma and Schema Guide

This guide is the team contract for using Prisma in the BioSphere backend. Read
it before adding a database-backed NestJS feature or changing the schema.

## Sources of truth

| File or directory                        | Purpose                                                          | Team rule                                                                                   |
| ---------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `DATABASE_CONVENTIONS.md`                | Agreed database rules and frozen values                          | Follow it for every database and API change.                                                |
| `database/sql/`                          | Historical SQL used to create the original Supabase schema       | Keep for traceability. Do not add ad hoc production changes here after the Prisma baseline. |
| `prisma/schema.prisma`                   | Current Prisma representation of Supabase PostgreSQL             | Review before writing Prisma queries.                                                       |
| `prisma/migrations/0_init/migration.sql` | Baseline snapshot of the pre-existing database                   | Never edit or apply it again. It is already marked as applied.                              |
| `prisma.config.ts`                       | Prisma CLI configuration and external Supabase Auth declarations | Keep `auth` objects external and use `DIRECT_URL` for CLI operations.                       |
| `src/generated/prisma/`                  | Generated Prisma 7 client                                        | Never edit or commit it. Regenerate it with `npm run prisma:generate`.                      |
| `src/prisma/`                            | NestJS runtime database connection                               | Feature modules consume `PrismaService`; they do not construct their own runtime clients.   |

## Schema ownership

BioSphere owns the application tables in PostgreSQL's `public` schema. The
current Prisma schema contains these 25 application models:

- `ar_asset`
- `audit_log`
- `backup_history`
- `collection`
- `communication_history`
- `exhibit`
- `exhibit_media`
- `faq_entry`
- `inquiry`
- `preferred_visit_date`
- `specimen`
- `specimen_lot`
- `specimen_lot_transaction`
- `specimen_media`
- `specimen_provenance`
- `specimen_revision_history`
- `specimen_tag`
- `specimen_taxonomy`
- `storage_movement_history`
- `storage_unit`
- `tag`
- `user_account`
- `visit_request`
- `visit_request_vehicle`
- `visit_request_visitor`

Supabase owns the `auth` schema, including `auth.users`. Its models and enums
are represented in Prisma only so relationships such as
`public.user_account.auth_user_id -> auth.users.id` can be typed. They are
declared as external in `prisma.config.ts` and must not be created, altered, or
dropped by BioSphere migrations.

## Current naming contract

The baseline was introspected from PostgreSQL, so the current Prisma models,
fields, delegates, and enums use the database's `snake_case` names. Examples:

| Database/Prisma name | Correct Prisma usage                 |
| -------------------- | ------------------------------------ |
| `user_account`       | `prisma.user_account.findMany()`     |
| `ar_asset`           | `prisma.ar_asset.create()`           |
| `audit_log`          | `prisma.audit_log.create()`          |
| `created_at`         | `orderBy: { created_at: 'desc' }`    |
| `storage_path`       | `data: { storage_path: path }`       |
| `user_role`          | generated enum type `user_role`      |
| `account_status`     | generated enum type `account_status` |

Do not guess camelCase delegate or field names such as `userAccount`,
`arAsset`, `createdAt`, or `storagePath`; TypeScript service code must use the
names that actually exist in `prisma/schema.prisma` and the generated client.

REST responses and DTOs should still use normal TypeScript/JSON camelCase.
Map database records at the service boundary instead of leaking snake_case to
the frontend. For example, map `auth_user_id` to `authUserId` and
`storage_path` to `modelUrl` in a response entity.

`AuthenticatedUser.id` comes from Supabase and is an `auth.users.id` value.
`AuthenticatedUser.accountId` is the matching `public.user_account.id` loaded
by the authentication layer. When a relation expects a BioSphere account ID
(for example `storage_movement_history.moved_by`), use `accountId`; never write
the Supabase Auth ID directly into a `user_account.id` foreign key. The
authentication layer also rejects missing and inactive BioSphere accounts and
uses `user_account.role` as the authoritative application role.

Changing the Prisma schema to PascalCase/camelCase with `@map` and `@@map`
could be considered later as a separate, team-reviewed refactor. Do not mix
that large naming refactor into a feature PR.

## Imports and NestJS wiring

The project uses Prisma 7's custom generated-client output:

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}
```

Import generated types and the `Prisma` namespace from the generated client,
using the correct relative path for the feature file:

```ts
import {
  Prisma,
  type account_status,
  type user_account,
  type user_role,
} from '../generated/prisma/client';
```

Do not import `PrismaClient`, `Prisma`, application models, or application
enums from `@prisma/client`. That package supplies Prisma runtime internals,
while BioSphere's generated application client lives in
`src/generated/prisma`.

A database-backed feature module must explicitly import `PrismaModule`:

```ts
@Module({
  imports: [PrismaModule],
  controllers: [FeatureController],
  providers: [FeatureService],
})
export class FeatureModule {}
```

Inject `PrismaService` into the service. Do not construct another
`PrismaClient` in application code. Import `SUPABASE_CLIENT` from
`src/supabase/supabase.constants.ts`, not from the provider implementation.

## Connection rules

- `DATABASE_URL` is the pooled runtime connection used by `PrismaService`.
- `DIRECT_URL` is the session/direct connection used by Prisma CLI operations.
- Keep both variables in an ignored local environment file or the deployment
  secret store.
- Never commit connection strings, database passwords, Supabase service-role
  keys, or test-account passwords.
- URL-encode special characters when a database password is placed inside a
  connection URL.

## Safe everyday commands

Run these after pulling dependency or schema changes:

```powershell
npm ci
npm run prisma:generate
npx prisma validate
npm run build
npm run lint:ci
npm test -- --runInBand
npm run test:e2e -- --runInBand
git diff --check
```

`npm ci` is the CI standard. If it reports that `package.json` and
`package-lock.json` are out of sync, repair the lockfile on a dedicated branch
with `npm install`, review the lockfile diff, and commit both files together.

The ordinary e2e command must not modify the shared Supabase database. The
Developer live e2e suite is intentionally skipped unless
`RUN_LIVE_DEVELOPER_E2E=true`. Run it only against a dedicated test/staging
Supabase project after reviewing its fixture creation, Auth invitations,
Storage uploads, and cleanup behavior.

## Database-change workflow

For an agreed structural change:

1. Update local `develop` with `git pull --ff-only origin develop`.
2. Create one focused feature or migration branch.
3. Confirm the change against the ERD, SRS, and `DATABASE_CONVENTIONS.md`.
4. Update `prisma/schema.prisma`.
5. Generate and review a new migration; never edit `0_init`.
6. Confirm the migration does not alter Supabase-owned `auth` objects or
   accidentally remove RLS, constraints, indexes, or comments.
7. Regenerate the client and run all quality checks.
8. Commit the schema, new migration, generated lockfile changes if any, tests,
   and documentation in one reviewable PR to `develop`.

Never run these casually against the shared Supabase project:

- `prisma db push`
- `prisma migrate reset`
- another baseline or `migrate resolve --applied 0_init`
- unreviewed `prisma migrate dev`
- random SQL that is not represented by an approved migration

`prisma db pull` is read-only, but it can overwrite local schema organization
and mappings. Use it only for an intentional drift audit on a clean branch,
review the complete diff, and never accept the result blindly.

## Pull-request checklist

Before requesting review for database-backed code, confirm:

- The branch started from current `develop`.
- Prisma imports come from `src/generated/prisma`.
- Prisma queries use names found in `prisma/schema.prisma`.
- Feature modules import the modules that provide their dependencies.
- DTOs and response entities do not expose internal database naming or secret
  fields.
- Frozen enum values match `DATABASE_CONVENTIONS.md`.
- Files are stored in Supabase Storage; PostgreSQL stores only their paths.
- AR uploads currently accept the self-contained `.glb` and `.usdz` formats;
  plain `.gltf` packages are not supported by the one-file upload workflow.
- Important museum records use the agreed archive/status behavior.
- Unit tests mock the real delegate and field names.
- Live integration tests are explicit, isolated, and safe to clean up.
- `npm ci`, validation, build, lint, tests, and `git diff --check` pass.
