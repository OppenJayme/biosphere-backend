-- Weekly Excel export (spec 0003). Additive: nullable columns on
-- backup_history plus two partial unique indexes. Recovery and synthetic
-- rows leave export_date NULL, so the indexes never touch them.
ALTER TABLE "public"."backup_history"
  ADD COLUMN "export_date" DATE,
  ADD COLUMN "row_counts" JSONB,
  ADD COLUMN "truncated_counts" JSONB,
  ADD COLUMN "file_bytes" BIGINT,
  ADD COLUMN "file_sha256" CHAR(64),
  ADD COLUMN "field_set_version" VARCHAR(50),
  ADD COLUMN "failure_code" VARCHAR(50),
  ADD COLUMN "attempt" SMALLINT,
  ADD COLUMN "expired_at" TIMESTAMPTZ(6);

-- At most one completed scheduled export per export date.
CREATE UNIQUE INDEX "uq_backup_history_weekly_export_completed"
  ON "public"."backup_history" ("backup_type", "export_date")
  WHERE "status" = 'COMPLETED' AND "backup_type" = 'WEEKLY_EXCEL_EXPORT';

-- At most one export running at a time, across processes. Inserting the
-- IN_PROGRESS row is the lock; a second run fails on this index.
CREATE UNIQUE INDEX "uq_backup_history_export_running"
  ON "public"."backup_history" ((true))
  WHERE "status" = 'IN_PROGRESS' AND "export_date" IS NOT NULL;
