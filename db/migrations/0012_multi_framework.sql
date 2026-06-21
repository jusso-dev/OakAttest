-- Generalise the ISM-only catalogue into a multi-framework model.
-- Data-preserving: existing ISM controls/imports/engagements are migrated onto
-- the new framework-aware tables under a seeded 'ism' framework row.
-- See docs/frameworks/multi-framework-plan.md (Phase 1 + Phase 2 cutover).

-- 1. Framework registry.
CREATE TABLE "frameworks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"scoping_mode" text DEFAULT 'classification' NOT NULL,
	"source_kind" text DEFAULT 'oscal_github_tags' NOT NULL,
	"source_config" jsonb,
	"overlays" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"classification_scheme" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "frameworks_key_uq" ON "frameworks" USING btree ("key");
--> statement-breakpoint

-- 2. Seed the ISM framework with a fixed id so existing rows can be backfilled.
INSERT INTO "frameworks" ("id","key","label","scoping_mode","source_kind","overlays","classification_scheme")
VALUES (
	'00000000-0000-4000-8000-000000000001',
	'ism',
	'Australian Government ISM',
	'classification',
	'oscal_github_tags',
	'["essential-eight"]'::jsonb,
	'{"OFFICIAL":1,"OFFICIAL_SENSITIVE":2,"PROTECTED":3,"SECRET":4,"TOP_SECRET":5}'::jsonb
)
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint

-- 3. ism_controls -> framework_controls (+ framework_id).
ALTER TABLE "ism_controls" RENAME TO "framework_controls";
--> statement-breakpoint
ALTER TABLE "framework_controls" ADD COLUMN "framework_id" uuid;
--> statement-breakpoint
UPDATE "framework_controls" SET "framework_id" = '00000000-0000-4000-8000-000000000001' WHERE "framework_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "framework_controls" ALTER COLUMN "framework_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "framework_controls" ADD CONSTRAINT "framework_controls_framework_id_frameworks_id_fk" FOREIGN KEY ("framework_id") REFERENCES "public"."frameworks"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
DROP INDEX "ism_controls_control_revision_uq";
--> statement-breakpoint
CREATE UNIQUE INDEX "framework_controls_fw_control_revision_uq" ON "framework_controls" USING btree ("framework_id","control_id","revision");
--> statement-breakpoint
ALTER INDEX "ism_controls_min_rank_idx" RENAME TO "framework_controls_min_rank_idx";
--> statement-breakpoint
ALTER INDEX "ism_controls_revision_idx" RENAME TO "framework_controls_revision_idx";
--> statement-breakpoint
CREATE INDEX "framework_controls_framework_idx" ON "framework_controls" USING btree ("framework_id");
--> statement-breakpoint

-- 4. ism_imports -> framework_imports (+ framework_id).
ALTER TABLE "ism_imports" RENAME TO "framework_imports";
--> statement-breakpoint
ALTER TABLE "framework_imports" ADD COLUMN "framework_id" uuid;
--> statement-breakpoint
UPDATE "framework_imports" SET "framework_id" = '00000000-0000-4000-8000-000000000001' WHERE "framework_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "framework_imports" ALTER COLUMN "framework_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "framework_imports" ADD CONSTRAINT "framework_imports_framework_id_frameworks_id_fk" FOREIGN KEY ("framework_id") REFERENCES "public"."frameworks"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
DROP INDEX "ism_imports_revision_sha_uq";
--> statement-breakpoint
CREATE UNIQUE INDEX "framework_imports_fw_revision_sha_uq" ON "framework_imports" USING btree ("framework_id","revision","source_sha256");
--> statement-breakpoint

-- 5. engagement_controls: ism_control_id -> framework_control_id (+ framework_id).
ALTER TABLE "engagement_controls" RENAME COLUMN "ism_control_id" TO "framework_control_id";
--> statement-breakpoint
ALTER TABLE "engagement_controls" ADD COLUMN "framework_id" uuid;
--> statement-breakpoint
UPDATE "engagement_controls" SET "framework_id" = '00000000-0000-4000-8000-000000000001' WHERE "framework_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "engagement_controls" ALTER COLUMN "framework_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "engagement_controls" ADD CONSTRAINT "engagement_controls_framework_id_frameworks_id_fk" FOREIGN KEY ("framework_id") REFERENCES "public"."frameworks"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

-- 6. Link tables: ism_control_id -> framework_control_id.
ALTER TABLE "finding_controls" RENAME COLUMN "ism_control_id" TO "framework_control_id";
--> statement-breakpoint
ALTER TABLE "evidence_request_controls" RENAME COLUMN "ism_control_id" TO "framework_control_id";
--> statement-breakpoint
ALTER TABLE "evidence_item_controls" RENAME COLUMN "ism_control_id" TO "framework_control_id";
--> statement-breakpoint
ALTER TABLE "interview_controls" RENAME COLUMN "ism_control_id" TO "framework_control_id";
--> statement-breakpoint

-- 7. engagements: ism_revision -> framework_revision (+ framework_id).
ALTER TABLE "engagements" RENAME COLUMN "ism_revision" TO "framework_revision";
--> statement-breakpoint
ALTER TABLE "engagements" ADD COLUMN "framework_id" uuid;
--> statement-breakpoint
UPDATE "engagements" SET "framework_id" = '00000000-0000-4000-8000-000000000001' WHERE "framework_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "engagements" ALTER COLUMN "framework_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "engagements" ADD CONSTRAINT "engagements_framework_id_frameworks_id_fk" FOREIGN KEY ("framework_id") REFERENCES "public"."frameworks"("id") ON DELETE no action ON UPDATE no action;
