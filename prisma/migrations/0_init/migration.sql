-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "account_status" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "audit_result" AS ENUM ('SUCCESS', 'FAILED', 'DENIED');

-- CreateEnum
CREATE TYPE "backup_status" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "faq_status" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "general_inquiry_status" AS ENUM ('PENDING', 'REVIEWED', 'TURNED_TO_VISIT_REQUEST', 'CLOSED');

-- CreateEnum
CREATE TYPE "lot_transaction_type" AS ENUM ('MOVEMENT', 'CONDITION_CHANGE', 'SPLIT', 'MERGE', 'QUANTITY_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "qr_exhibit_status" AS ENUM ('UNPUBLISHED', 'PUBLISHED', 'DISABLED');

-- CreateEnum
CREATE TYPE "quantity_adjustment_type" AS ENUM ('ADDITION', 'REMOVAL', 'TRANSFER_OUT', 'DEACCESSION', 'MISSING_LOSS', 'DESTRUCTION', 'DATA_CORRECTION');

-- CreateEnum
CREATE TYPE "specimen_gender" AS ENUM ('MALE', 'FEMALE', 'UNKNOWN', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "specimen_status" AS ENUM ('UNCATALOGED', 'CATALOGED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('CURATOR', 'DEVELOPER');

-- CreateEnum
CREATE TYPE "visit_request_status" AS ENUM ('PENDING', 'APPROVED_BY_CURATOR', 'SUBMITTED_FOR_CAMPUS_ENTRY', 'DECLINED', 'CANCELLED', 'COMPLETED');

-- CreateTable
CREATE TABLE "ar_asset" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "storage_path" VARCHAR(255) NOT NULL,
    "model_format" VARCHAR(255) NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT false,
    "exhibit_id" UUID NOT NULL,

    CONSTRAINT "ar_asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "affected_record_id" UUID,
    "affected_record_type" VARCHAR(100),
    "action" VARCHAR(100) NOT NULL,
    "module" VARCHAR(100) NOT NULL,
    "details" JSONB,
    "status" "audit_result" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backup_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_by" UUID,
    "backup_type" VARCHAR(100) NOT NULL,
    "storage_path" VARCHAR(255),
    "status" "backup_status" NOT NULL DEFAULT 'IN_PROGRESS',
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "backup_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "collection_name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "inquiry_id" UUID,
    "visit_request_id" UUID,
    "recorded_by" UUID NOT NULL,
    "direction" VARCHAR(50) NOT NULL,
    "communication_type" VARCHAR(100) NOT NULL,
    "recipient_email" VARCHAR(100),
    "subject" VARCHAR(255),
    "message" TEXT NOT NULL,
    "delivery_result" VARCHAR(100),
    "sent_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "communication_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exhibit" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "specimen_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "public_slug" VARCHAR(255) NOT NULL,
    "interesting_facts" TEXT,
    "public_description" TEXT,
    "distribution" VARCHAR(255),
    "diet" VARCHAR(255),
    "layout_type" TEXT,
    "status" "qr_exhibit_status" NOT NULL DEFAULT 'UNPUBLISHED',
    "published_at" TIMESTAMPTZ(6),
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exhibit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exhibit_media" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "exhibit_id" UUID NOT NULL,
    "storage_path" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "caption" VARCHAR(255),
    "is_cover" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "exhibit_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faq_entry" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "alternative_wording" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "category" VARCHAR(100),
    "status" "faq_status" NOT NULL DEFAULT 'INACTIVE',
    "created_by" UUID NOT NULL,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "faq_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inquiry" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reviewed_by" UUID,
    "full_name" VARCHAR(100) NOT NULL,
    "email_address" VARCHAR(100) NOT NULL,
    "contact_number" VARCHAR(20),
    "organization_name" VARCHAR(100),
    "inquiry_type" VARCHAR(100) NOT NULL,
    "message" TEXT NOT NULL,
    "attachment_path" TEXT,
    "status" "general_inquiry_status" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consent_accepted_at" TIMESTAMPTZ(6),

    CONSTRAINT "inquiry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preferred_visit_date" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "visit_id" UUID NOT NULL,
    "preferred_date" DATE NOT NULL,
    "preferred_start_time" TIME(6) NOT NULL,
    "preferred_end_time" TIME(6) NOT NULL,
    "preference_order" SMALLINT NOT NULL,

    CONSTRAINT "preferred_visit_date_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "specimen" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "collection_id" UUID,
    "created_by" UUID NOT NULL,
    "updated_by" UUID,
    "archived_by" UUID,
    "accession_number" VARCHAR(100),
    "specimen_category" VARCHAR(100),
    "scientific_name" VARCHAR(255),
    "common_name" VARCHAR(255),
    "gender" "specimen_gender",
    "classification_status" TEXT,
    "status" "specimen_status" NOT NULL DEFAULT 'UNCATALOGED',
    "public_display_allowed" BOOLEAN NOT NULL DEFAULT false,
    "remarks" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(6),

    CONSTRAINT "specimen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "specimen_lot" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "specimen_id" UUID NOT NULL,
    "storage_unit_id" UUID NOT NULL,
    "condition_class" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "storage_notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID NOT NULL,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "specimen_lot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "specimen_lot_transaction" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source_lot_id" UUID,
    "target_lot_id" UUID,
    "transaction_type" "lot_transaction_type" NOT NULL,
    "quantity_affected" INTEGER,
    "adjustment_type" "quantity_adjustment_type",
    "reason" TEXT,
    "performed_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "specimen_lot_transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "specimen_media" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "specimen_id" UUID NOT NULL,
    "storage_path" VARCHAR(255) NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "caption" VARCHAR(255),
    "is_cover" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "specimen_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "specimen_provenance" (
    "specimen_id" UUID NOT NULL,
    "collector" VARCHAR(255),
    "donor" VARCHAR(255),
    "collection_date" DATE,
    "collection_location" VARCHAR(255),
    "preservation_type" VARCHAR(255),
    "preservation_method" VARCHAR(255),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "specimen_provenance_pkey" PRIMARY KEY ("specimen_id")
);

-- CreateTable
CREATE TABLE "specimen_revision_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "specimen_id" UUID NOT NULL,
    "changed_by" UUID NOT NULL,
    "field_changed" VARCHAR(100) NOT NULL,
    "old_value" TEXT,
    "new_value" TEXT,
    "reason" TEXT,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source_section" TEXT NOT NULL,

    CONSTRAINT "specimen_revision_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "specimen_tag" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "specimen_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,

    CONSTRAINT "specimen_tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "specimen_taxonomy" (
    "specimen_id" UUID NOT NULL,
    "kingdom" VARCHAR(100),
    "phylum" VARCHAR(100),
    "class" VARCHAR(100),
    "order_name" VARCHAR(100),
    "family" VARCHAR(100),
    "genus" VARCHAR(100),
    "species" VARCHAR(100),
    "habitat" VARCHAR(250),
    "ecological_role" VARCHAR(100),
    "conservation_status" VARCHAR(100),

    CONSTRAINT "specimen_taxonomy_pkey" PRIMARY KEY ("specimen_id")
);

-- CreateTable
CREATE TABLE "storage_movement_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "storage_unit_id" UUID NOT NULL,
    "from_storage_unit_id" UUID,
    "to_storage_unit_id" UUID,
    "moved_by" UUID NOT NULL,
    "moved_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,

    CONSTRAINT "storage_movement_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storage_unit" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "parent_id" UUID,
    "unit_type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "size" TEXT,
    "storage_type" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "holds_specimens" BOOLEAN NOT NULL DEFAULT false,
    "capacity" INTEGER,
    "archived_at" TIMESTAMPTZ(6),

    CONSTRAINT "storage_unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tag" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tag_name" VARCHAR(100) NOT NULL,

    CONSTRAINT "tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_account" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "auth_user_id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "role" "user_role" NOT NULL,
    "status" "account_status" NOT NULL,
    "avatar_path" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visit_request" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reviewed_by" UUID,
    "source_inquiry_id" UUID,
    "contact_person" VARCHAR(100) NOT NULL,
    "email_address" VARCHAR(100) NOT NULL,
    "contact_number" VARCHAR(20) NOT NULL,
    "organization_name" VARCHAR(255) NOT NULL,
    "address" TEXT,
    "purpose_of_visit" TEXT,
    "visitor_count" INTEGER NOT NULL,
    "miscellaneous_details" TEXT,
    "additional_notes" TEXT,
    "consent_accepted_at" TIMESTAMPTZ(6) NOT NULL,
    "status" "visit_request_status" NOT NULL DEFAULT 'PENDING',
    "approved_date" DATE,
    "approved_start_time" TIME(6),
    "approved_end_time" TIME(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visit_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visit_request_vehicle" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "visit_id" UUID NOT NULL,
    "driver_visitor_id" UUID,
    "plate_number" VARCHAR(20),
    "vehicle_brand" VARCHAR(100),
    "vehicle_type" VARCHAR(100),

    CONSTRAINT "visit_request_vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visit_request_visitor" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "visit_id" UUID NOT NULL,
    "visitor_name" VARCHAR(100) NOT NULL,
    "visitor_type" VARCHAR(100),

    CONSTRAINT "visit_request_visitor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_ar_asset_exhibit_id" ON "ar_asset"("exhibit_id");

-- CreateIndex
CREATE INDEX "idx_audit_log_affected_record" ON "audit_log"("affected_record_type", "affected_record_id");

-- CreateIndex
CREATE INDEX "idx_audit_log_created_at" ON "audit_log"("created_at");

-- CreateIndex
CREATE INDEX "idx_audit_log_user_id" ON "audit_log"("user_id");

-- CreateIndex
CREATE INDEX "idx_backup_history_created_by" ON "backup_history"("created_by");

-- CreateIndex
CREATE INDEX "idx_backup_history_started_at" ON "backup_history"("started_at");

-- CreateIndex
CREATE INDEX "idx_communication_inquiry_id" ON "communication_history"("inquiry_id");

-- CreateIndex
CREATE INDEX "idx_communication_visit_request_id" ON "communication_history"("visit_request_id");

-- CreateIndex
CREATE UNIQUE INDEX "exhibit_public_slug_key" ON "exhibit"("public_slug");

-- CreateIndex
CREATE INDEX "idx_exhibit_specimen_id" ON "exhibit"("specimen_id");

-- CreateIndex
CREATE INDEX "idx_exhibit_status" ON "exhibit"("status");

-- CreateIndex
CREATE INDEX "idx_exhibit_media_exhibit_id" ON "exhibit_media"("exhibit_id");

-- CreateIndex
CREATE INDEX "idx_faq_entry_category" ON "faq_entry"("category");

-- CreateIndex
CREATE INDEX "idx_faq_entry_status" ON "faq_entry"("status");

-- CreateIndex
CREATE INDEX "idx_inquiry_reviewed_by" ON "inquiry"("reviewed_by");

-- CreateIndex
CREATE INDEX "idx_inquiry_status" ON "inquiry"("status");

-- CreateIndex
CREATE INDEX "idx_preferred_visit_date_visit_id" ON "preferred_visit_date"("visit_id");

-- CreateIndex
CREATE UNIQUE INDEX "preferred_visit_order_unique" ON "preferred_visit_date"("visit_id", "preference_order");

-- CreateIndex
CREATE INDEX "idx_specimen_collection_id" ON "specimen"("collection_id");

-- CreateIndex
CREATE INDEX "idx_specimen_status" ON "specimen"("status");

-- CreateIndex
CREATE INDEX "idx_specimen_lot_specimen_id" ON "specimen_lot"("specimen_id");

-- CreateIndex
CREATE INDEX "idx_specimen_lot_storage_unit_id" ON "specimen_lot"("storage_unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_active_specimen_lot" ON "specimen_lot"("specimen_id", "storage_unit_id", "condition_class") WHERE (is_active = true);

-- CreateIndex
CREATE INDEX "idx_lot_transaction_source_lot" ON "specimen_lot_transaction"("source_lot_id");

-- CreateIndex
CREATE INDEX "idx_lot_transaction_target_lot" ON "specimen_lot_transaction"("target_lot_id");

-- CreateIndex
CREATE INDEX "idx_specimen_media_specimen_id" ON "specimen_media"("specimen_id");

-- CreateIndex
CREATE INDEX "idx_specimen_revision_changed_at" ON "specimen_revision_history"("changed_at");

-- CreateIndex
CREATE INDEX "idx_specimen_revision_specimen_id" ON "specimen_revision_history"("specimen_id");

-- CreateIndex
CREATE INDEX "idx_specimen_tag_specimen_id" ON "specimen_tag"("specimen_id");

-- CreateIndex
CREATE INDEX "idx_specimen_tag_tag_id" ON "specimen_tag"("tag_id");

-- CreateIndex
CREATE UNIQUE INDEX "specimen_tag_unique" ON "specimen_tag"("specimen_id", "tag_id");

-- CreateIndex
CREATE INDEX "idx_storage_movement_moved_at" ON "storage_movement_history"("moved_at");

-- CreateIndex
CREATE INDEX "idx_storage_movement_storage_unit" ON "storage_movement_history"("storage_unit_id");

-- CreateIndex
CREATE INDEX "idx_storage_unit_parent_id" ON "storage_unit"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "tag_tag_name_key" ON "tag"("tag_name");

-- CreateIndex
CREATE UNIQUE INDEX "user_account_auth_user_id_key" ON "user_account"("auth_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "visit_request_source_inquiry_id_key" ON "visit_request"("source_inquiry_id");

-- CreateIndex
CREATE INDEX "idx_visit_request_reviewed_by" ON "visit_request"("reviewed_by");

-- CreateIndex
CREATE INDEX "idx_visit_request_status" ON "visit_request"("status");

-- CreateIndex
CREATE INDEX "idx_visit_request_vehicle_driver_visitor_id" ON "visit_request_vehicle"("driver_visitor_id");

-- CreateIndex
CREATE INDEX "idx_visit_request_vehicle_visit_id" ON "visit_request_vehicle"("visit_id");

-- CreateIndex
CREATE INDEX "idx_visit_request_visitor_visit_id" ON "visit_request_visitor"("visit_id");

-- AddForeignKey
ALTER TABLE "ar_asset" ADD CONSTRAINT "ar_asset_exhibit_id_fkey" FOREIGN KEY ("exhibit_id") REFERENCES "exhibit"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "backup_history" ADD CONSTRAINT "backup_history_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "communication_history" ADD CONSTRAINT "communication_history_inquiry_id_fkey" FOREIGN KEY ("inquiry_id") REFERENCES "inquiry"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "communication_history" ADD CONSTRAINT "communication_history_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "user_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "communication_history" ADD CONSTRAINT "communication_history_visit_request_id_fkey" FOREIGN KEY ("visit_request_id") REFERENCES "visit_request"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "exhibit" ADD CONSTRAINT "exhibit_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "exhibit" ADD CONSTRAINT "exhibit_specimen_id_fkey" FOREIGN KEY ("specimen_id") REFERENCES "specimen"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "exhibit_media" ADD CONSTRAINT "exhibit_media_exhibit_id_fkey" FOREIGN KEY ("exhibit_id") REFERENCES "exhibit"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "faq_entry" ADD CONSTRAINT "faq_entry_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "faq_entry" ADD CONSTRAINT "faq_entry_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "user_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "inquiry" ADD CONSTRAINT "inquiry_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "user_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "preferred_visit_date" ADD CONSTRAINT "preferred_visit_date_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "visit_request"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "specimen" ADD CONSTRAINT "specimen_archived_by_fkey" FOREIGN KEY ("archived_by") REFERENCES "user_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "specimen" ADD CONSTRAINT "specimen_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "collection"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "specimen" ADD CONSTRAINT "specimen_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "specimen" ADD CONSTRAINT "specimen_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "user_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "specimen_lot" ADD CONSTRAINT "specimen_lot_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "specimen_lot" ADD CONSTRAINT "specimen_lot_specimen_id_fkey" FOREIGN KEY ("specimen_id") REFERENCES "specimen"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "specimen_lot" ADD CONSTRAINT "specimen_lot_storage_unit_id_fkey" FOREIGN KEY ("storage_unit_id") REFERENCES "storage_unit"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "specimen_lot" ADD CONSTRAINT "specimen_lot_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "user_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "specimen_lot_transaction" ADD CONSTRAINT "specimen_lot_transaction_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "user_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "specimen_lot_transaction" ADD CONSTRAINT "specimen_lot_transaction_source_lot_id_fkey" FOREIGN KEY ("source_lot_id") REFERENCES "specimen_lot"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "specimen_lot_transaction" ADD CONSTRAINT "specimen_lot_transaction_target_lot_id_fkey" FOREIGN KEY ("target_lot_id") REFERENCES "specimen_lot"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "specimen_media" ADD CONSTRAINT "specimen_media_specimen_id_fkey" FOREIGN KEY ("specimen_id") REFERENCES "specimen"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "specimen_provenance" ADD CONSTRAINT "specimen_provenance_specimen_id_fkey" FOREIGN KEY ("specimen_id") REFERENCES "specimen"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "specimen_revision_history" ADD CONSTRAINT "specimen_revision_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "user_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "specimen_revision_history" ADD CONSTRAINT "specimen_revision_history_specimen_id_fkey" FOREIGN KEY ("specimen_id") REFERENCES "specimen"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "specimen_tag" ADD CONSTRAINT "specimen_tag_specimen_id_fkey" FOREIGN KEY ("specimen_id") REFERENCES "specimen"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "specimen_tag" ADD CONSTRAINT "specimen_tag_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tag"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "specimen_taxonomy" ADD CONSTRAINT "specimen_taxonomy_specimen_id_fkey" FOREIGN KEY ("specimen_id") REFERENCES "specimen"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "storage_movement_history" ADD CONSTRAINT "storage_movement_history_from_storage_unit_id_fkey" FOREIGN KEY ("from_storage_unit_id") REFERENCES "storage_unit"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "storage_movement_history" ADD CONSTRAINT "storage_movement_history_moved_by_fkey" FOREIGN KEY ("moved_by") REFERENCES "user_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "storage_movement_history" ADD CONSTRAINT "storage_movement_history_storage_unit_id_fkey" FOREIGN KEY ("storage_unit_id") REFERENCES "storage_unit"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "storage_movement_history" ADD CONSTRAINT "storage_movement_history_to_storage_unit_id_fkey" FOREIGN KEY ("to_storage_unit_id") REFERENCES "storage_unit"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "storage_unit" ADD CONSTRAINT "storage_unit_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "storage_unit"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_account" ADD CONSTRAINT "user_account_auth_user_id_fkey" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "visit_request" ADD CONSTRAINT "visit_request_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "user_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "visit_request" ADD CONSTRAINT "visit_request_source_inquiry_id_fkey" FOREIGN KEY ("source_inquiry_id") REFERENCES "inquiry"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "visit_request_vehicle" ADD CONSTRAINT "visit_request_vehicle_driver_visitor_id_fkey" FOREIGN KEY ("driver_visitor_id") REFERENCES "visit_request_visitor"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "visit_request_vehicle" ADD CONSTRAINT "visit_request_vehicle_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "visit_request"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "visit_request_visitor" ADD CONSTRAINT "visit_request_visitor_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "visit_request"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- PostgreSQL features preserved from the pre-Prisma BioSphere schema.
-- Prisma cannot represent check constraints or row-level security in the
-- Prisma schema, so they are maintained as custom migration SQL.

-- AddCheckConstraint
ALTER TABLE "storage_unit" ADD CONSTRAINT "storage_unit_not_own_parent"
CHECK ("parent_id" IS NULL OR "parent_id" <> "id");

-- AddCheckConstraint
ALTER TABLE "storage_unit" ADD CONSTRAINT "storage_unit_capacity_positive"
CHECK ("capacity" IS NULL OR "capacity" > 0);

-- AddCheckConstraint
ALTER TABLE "specimen" ADD CONSTRAINT "specimen_public_display_requires_cataloged"
CHECK ("public_display_allowed" = FALSE OR "status" = 'CATALOGED');

-- AddCheckConstraint
ALTER TABLE "specimen_lot" ADD CONSTRAINT "specimen_lot_quantity_positive"
CHECK ("quantity" > 0);

-- AddCheckConstraint
ALTER TABLE "specimen_lot_transaction" ADD CONSTRAINT "specimen_lot_transaction_quantity_positive"
CHECK ("quantity_affected" IS NULL OR "quantity_affected" > 0);

-- AddCheckConstraint
ALTER TABLE "storage_movement_history" ADD CONSTRAINT "storage_movement_different_parent"
CHECK ("from_storage_unit_id" IS DISTINCT FROM "to_storage_unit_id");

-- AddCheckConstraint
ALTER TABLE "visit_request" ADD CONSTRAINT "visit_request_visitor_count_positive"
CHECK ("visitor_count" > 0);

-- AddCheckConstraint
ALTER TABLE "preferred_visit_date" ADD CONSTRAINT "preferred_visit_time_valid"
CHECK ("preferred_end_time" > "preferred_start_time");

-- AddCheckConstraint
ALTER TABLE "preferred_visit_date" ADD CONSTRAINT "preferred_visit_order_positive"
CHECK ("preference_order" > 0);

-- AddCheckConstraint
ALTER TABLE "communication_history" ADD CONSTRAINT "communication_has_one_parent"
CHECK (
    ("inquiry_id" IS NOT NULL AND "visit_request_id" IS NULL)
    OR
    ("inquiry_id" IS NULL AND "visit_request_id" IS NOT NULL)
);

-- EnableRowLevelSecurity
ALTER TABLE "ar_asset" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "backup_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "collection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "communication_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "exhibit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "exhibit_media" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "faq_entry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inquiry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "preferred_visit_date" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "specimen" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "specimen_lot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "specimen_lot_transaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "specimen_media" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "specimen_provenance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "specimen_revision_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "specimen_tag" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "specimen_taxonomy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "storage_movement_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "storage_unit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tag" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "visit_request" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "visit_request_vehicle" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "visit_request_visitor" ENABLE ROW LEVEL SECURITY;
