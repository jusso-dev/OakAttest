ALTER TABLE "frameworks" ADD COLUMN "tenant_id" uuid;
ALTER TABLE "frameworks" ADD COLUMN "description" text;
ALTER TABLE "frameworks" ADD COLUMN "authority" text;
ALTER TABLE "frameworks" ADD COLUMN "lifecycle_status" text DEFAULT 'active' NOT NULL;
ALTER TABLE "frameworks" ADD COLUMN "created_by" uuid;
ALTER TABLE "frameworks" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "frameworks" ADD CONSTRAINT "frameworks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade;
ALTER TABLE "frameworks" ADD CONSTRAINT "frameworks_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");
ALTER TABLE "frameworks" ADD CONSTRAINT "frameworks_lifecycle_check" CHECK ("lifecycle_status" IN ('draft', 'active', 'retired'));
DROP INDEX IF EXISTS "frameworks_key_uq";
CREATE UNIQUE INDEX "frameworks_global_key_uq" ON "frameworks" ("key") WHERE "tenant_id" IS NULL;
CREATE UNIQUE INDEX "frameworks_tenant_key_uq" ON "frameworks" ("tenant_id", "key") WHERE "tenant_id" IS NOT NULL;
CREATE INDEX "frameworks_tenant_idx" ON "frameworks" ("tenant_id");

CREATE TABLE "framework_packs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "framework_id" uuid NOT NULL,
  "tenant_id" uuid,
  "revision" text NOT NULL,
  "label" text NOT NULL,
  "description" text,
  "status" text DEFAULT 'draft' NOT NULL,
  "source_kind" text NOT NULL,
  "source_url" text,
  "source_sha256" text,
  "base_framework_id" uuid,
  "base_revision" text,
  "control_count" integer DEFAULT 0 NOT NULL,
  "effective_at" timestamp with time zone,
  "expires_at" timestamp with time zone,
  "metadata" jsonb,
  "authored_by" uuid,
  "approved_by" uuid,
  "activated_at" timestamp with time zone,
  "retired_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "framework_packs_status_check" CHECK ("status" IN ('draft', 'active', 'retired')),
  CONSTRAINT "framework_packs_source_kind_check" CHECK ("source_kind" IN ('official_catalogue', 'oscal_profile', 'tenant_csv', 'custom_builder')),
  CONSTRAINT "framework_packs_control_count_check" CHECK ("control_count" >= 0),
  CONSTRAINT "framework_packs_dates_check" CHECK ("expires_at" IS NULL OR "effective_at" IS NULL OR "expires_at" > "effective_at")
);
ALTER TABLE "framework_packs" ADD CONSTRAINT "framework_packs_framework_id_frameworks_id_fk" FOREIGN KEY ("framework_id") REFERENCES "public"."frameworks"("id") ON DELETE cascade;
ALTER TABLE "framework_packs" ADD CONSTRAINT "framework_packs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade;
ALTER TABLE "framework_packs" ADD CONSTRAINT "framework_packs_base_framework_id_frameworks_id_fk" FOREIGN KEY ("base_framework_id") REFERENCES "public"."frameworks"("id");
ALTER TABLE "framework_packs" ADD CONSTRAINT "framework_packs_authored_by_user_id_fk" FOREIGN KEY ("authored_by") REFERENCES "public"."users"("id");
ALTER TABLE "framework_packs" ADD CONSTRAINT "framework_packs_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id");
CREATE UNIQUE INDEX "framework_packs_global_revision_uq" ON "framework_packs" ("framework_id", "revision") WHERE "tenant_id" IS NULL;
CREATE UNIQUE INDEX "framework_packs_tenant_revision_uq" ON "framework_packs" ("framework_id", "tenant_id", "revision") WHERE "tenant_id" IS NOT NULL;
CREATE INDEX "framework_packs_framework_status_idx" ON "framework_packs" ("framework_id", "status");
CREATE INDEX "framework_packs_tenant_idx" ON "framework_packs" ("tenant_id");

INSERT INTO "framework_packs" (
  "framework_id", "tenant_id", "revision", "label", "status", "source_kind",
  "source_url", "source_sha256", "control_count", "effective_at", "activated_at", "metadata"
)
SELECT DISTINCT ON ("framework_id", COALESCE("tenant_id", '00000000-0000-0000-0000-000000000000'::uuid), "revision")
  "framework_id", "tenant_id", "revision", "revision", 'active',
  CASE WHEN "tenant_id" IS NULL THEN 'official_catalogue' ELSE 'tenant_csv' END,
  "source_url", "source_sha256", "control_count", "completed_at", "completed_at",
  COALESCE("metadata", '{}'::jsonb)
FROM "framework_imports"
ORDER BY "framework_id", COALESCE("tenant_id", '00000000-0000-0000-0000-000000000000'::uuid), "revision", "completed_at" DESC
ON CONFLICT DO NOTHING;

INSERT INTO "frameworks" (
  "key", "label", "description", "authority", "scoping_mode", "source_kind",
  "source_config", "overlays", "lifecycle_status"
) VALUES (
  'pspf',
  'Protective Security Policy Framework',
  'Australian Government protective security policy assessment pack.',
  'Australian Government',
  'selection',
  'csv_client_import',
  '{"template":"/templates/pspf-controls-template.csv"}'::jsonb,
  '[]'::jsonb,
  'active'
) ON CONFLICT DO NOTHING;
