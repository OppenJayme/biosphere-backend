-- Durable server-side receipts prevent retries of one curator's offline draft
-- from creating more than one specimen (REQ-4.14-08).
CREATE TABLE "offline_draft_sync" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_by" UUID NOT NULL,
    "client_draft_id" UUID NOT NULL,
    "specimen_id" UUID NOT NULL,
    "payload_fingerprint" CHAR(64) NOT NULL,
    "synchronized_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offline_draft_sync_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "offline_draft_sync_specimen_id_key"
ON "offline_draft_sync"("specimen_id");

CREATE UNIQUE INDEX "offline_draft_sync_created_by_client_draft_id_key"
ON "offline_draft_sync"("created_by", "client_draft_id");

CREATE INDEX "idx_offline_draft_sync_created_by"
ON "offline_draft_sync"("created_by");

ALTER TABLE "offline_draft_sync"
ADD CONSTRAINT "offline_draft_sync_created_by_fkey"
FOREIGN KEY ("created_by") REFERENCES "user_account"("id")
ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "offline_draft_sync"
ADD CONSTRAINT "offline_draft_sync_specimen_id_fkey"
FOREIGN KEY ("specimen_id") REFERENCES "specimen"("id")
ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "offline_draft_sync" ENABLE ROW LEVEL SECURITY;
