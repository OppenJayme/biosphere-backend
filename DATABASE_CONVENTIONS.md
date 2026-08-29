# BioSphere Database Conventions

This document records the conventions agreed upon for the BioSphere database. These rules apply before application tables are created and should be revisited only when a confirmed business requirement requires a change.

## Schemas

- Use PostgreSQL's `public` schema for BioSphere application tables.
- Leave Supabase-managed tables, including `auth.users`, in their Supabase-managed schemas.

## Naming

- Use `snake_case` for PostgreSQL table and column names.
- Examples include `specimen_lot`, `storage_unit`, `created_at`, and `accession_number`.
- Prisma models may later use TypeScript-style names and map them to the PostgreSQL names.

## Primary and Foreign Keys

- Use UUID primary keys for BioSphere records.
- Use UUID foreign keys for relationships instead of copying descriptive text.
- For example, a specimen lot should reference `storage_unit_id` rather than store `"Cabinet 3"` as its relationship.

## Timestamps

- Use `created_at` and `updated_at` consistently where appropriate.
- History and event tables may use specialized timestamps such as `moved_at` or `completed_at`.

## File Storage

- Do not store photos, documents, or 3D files directly in PostgreSQL rows.
- Store files in Supabase Storage and keep only their path or reference in PostgreSQL.

## Record Lifecycle

- Prefer status or archive behavior over permanently deleting important specimen records.

## Authentication

- Do not manually create or redesign Supabase's `auth.users` table.
- BioSphere will maintain its own user or curator profile table linked to the corresponding Supabase authentication user.

## Database Changes

- During initial database setup, SQL may be written and applied manually in an organized and reviewable manner.
- After Prisma is connected and the existing database is baselined, structural changes should normally use Prisma migrations rather than untracked manual changes.

## Secrets

- Never place database passwords, connection strings, Supabase service or secret keys, or similar credentials in SQL files or commit them to Git.

## Nullability

- Do not mark fields `NOT NULL` merely because they usually contain data.
- Required and optional fields must follow confirmed SRS and client requirements.

## Constraints

- Add `UNIQUE`, cascading deletes, and other strong constraints only when confirmed business rules support them.
- Do not enforce a final uniqueness rule for accession numbers until it has been validated with the curator.
