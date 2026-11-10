-- Curator AR selection per QR exhibit (REQ-4.13-02). The curator marks an
-- approved exhibit for AR preparation in BioSphere; developers may then deploy
-- AR assets only to selected exhibits (SRS 4.2.2, REQ-4.13-03). The optional
-- note records the curator's reason for the developer. It is free text and is
-- never scored or ranked (REQ-4.13-08).
ALTER TABLE "exhibit" ADD COLUMN     "ar_selected_at" TIMESTAMPTZ(6),
ADD COLUMN     "ar_selection_note" TEXT;

-- Exhibits that already hold AR assets were selected outside BioSphere before
-- this change. Mark them selected so their deployed models keep working.
UPDATE "exhibit" SET "ar_selected_at" = now()
WHERE EXISTS (SELECT 1 FROM "ar_asset" WHERE "ar_asset"."exhibit_id" = "exhibit"."id");
