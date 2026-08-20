CREATE TABLE "audit_readiness_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"audit_type" text NOT NULL,
	"status" text DEFAULT 'planning' NOT NULL,
	"audit_firm" text,
	"lead_auditor" text,
	"scope_statement" text NOT NULL,
	"trust_service_categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"target_audit_at" timestamp with time zone NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_readiness_profiles_audit_type_check" CHECK ("audit_type" IN ('iso_27001_stage_1', 'soc_2_type_1', 'soc_2_type_2')),
	CONSTRAINT "audit_readiness_profiles_status_check" CHECK ("status" IN ('planning', 'in_progress', 'ready', 'in_audit', 'complete'))
);
--> statement-breakpoint
CREATE TABLE "audit_readiness_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"audit_type" text NOT NULL,
	"requirement_key" text NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"guidance" text NOT NULL,
	"status" text DEFAULT 'not_started' NOT NULL,
	"notes" text,
	"owner_user_id" uuid,
	"due_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_readiness_requirements_audit_type_check" CHECK ("audit_type" IN ('iso_27001_stage_1', 'soc_2_type_1', 'soc_2_type_2')),
	CONSTRAINT "audit_readiness_requirements_status_check" CHECK ("status" IN ('not_started', 'in_progress', 'blocked', 'ready', 'not_applicable'))
);
--> statement-breakpoint
CREATE TABLE "audit_evidence_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"audit_type" text NOT NULL,
	"storage_key" text NOT NULL,
	"storage_bucket" text NOT NULL,
	"bundle_sha256" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"manifest" jsonb NOT NULL,
	"generated_by" uuid,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_evidence_packages_audit_type_check" CHECK ("audit_type" IN ('iso_27001_stage_1', 'soc_2_type_1', 'soc_2_type_2'))
);
--> statement-breakpoint
CREATE TABLE "audit_readiness_requirement_evidence" (
	"requirement_id" uuid NOT NULL,
	"evidence_item_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"linked_by" uuid,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_readiness_requirement_evidence_requirement_id_evidence_item_id_pk" PRIMARY KEY("requirement_id", "evidence_item_id")
);
--> statement-breakpoint
ALTER TABLE "audit_readiness_profiles" ADD CONSTRAINT "audit_readiness_profiles_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "audit_readiness_profiles" ADD CONSTRAINT "audit_readiness_profiles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "audit_readiness_profiles" ADD CONSTRAINT "audit_readiness_profiles_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "audit_readiness_profiles" ADD CONSTRAINT "audit_readiness_profiles_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "audit_readiness_requirements" ADD CONSTRAINT "audit_readiness_requirements_profile_id_audit_readiness_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."audit_readiness_profiles"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "audit_readiness_requirements" ADD CONSTRAINT "audit_readiness_requirements_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "audit_readiness_requirements" ADD CONSTRAINT "audit_readiness_requirements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "audit_readiness_requirements" ADD CONSTRAINT "audit_readiness_requirements_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "audit_readiness_requirements" ADD CONSTRAINT "audit_readiness_requirements_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "audit_evidence_packages" ADD CONSTRAINT "audit_evidence_packages_profile_id_audit_readiness_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."audit_readiness_profiles"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "audit_evidence_packages" ADD CONSTRAINT "audit_evidence_packages_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "audit_evidence_packages" ADD CONSTRAINT "audit_evidence_packages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "audit_evidence_packages" ADD CONSTRAINT "audit_evidence_packages_generated_by_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "audit_readiness_requirement_evidence" ADD CONSTRAINT "audit_readiness_requirement_evidence_requirement_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."audit_readiness_requirements"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "audit_readiness_requirement_evidence" ADD CONSTRAINT "audit_readiness_requirement_evidence_evidence_item_id_fk" FOREIGN KEY ("evidence_item_id") REFERENCES "public"."evidence_items"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "audit_readiness_requirement_evidence" ADD CONSTRAINT "audit_readiness_requirement_evidence_engagement_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "audit_readiness_requirement_evidence" ADD CONSTRAINT "audit_readiness_requirement_evidence_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "audit_readiness_requirement_evidence" ADD CONSTRAINT "audit_readiness_requirement_evidence_linked_by_fk" FOREIGN KEY ("linked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "audit_readiness_profiles_engagement_uq" ON "audit_readiness_profiles" USING btree ("engagement_id");
CREATE INDEX "audit_readiness_profiles_tenant_idx" ON "audit_readiness_profiles" USING btree ("tenant_id");
CREATE UNIQUE INDEX "audit_readiness_requirements_profile_key_uq" ON "audit_readiness_requirements" USING btree ("profile_id", "audit_type", "requirement_key");
CREATE INDEX "audit_readiness_requirements_engagement_idx" ON "audit_readiness_requirements" USING btree ("engagement_id", "audit_type");
CREATE INDEX "audit_readiness_requirements_owner_idx" ON "audit_readiness_requirements" USING btree ("owner_user_id");
CREATE UNIQUE INDEX "audit_evidence_packages_engagement_version_uq" ON "audit_evidence_packages" USING btree ("engagement_id", "version");
CREATE INDEX "audit_evidence_packages_tenant_idx" ON "audit_evidence_packages" USING btree ("tenant_id");
CREATE INDEX "audit_readiness_requirement_evidence_engagement_idx" ON "audit_readiness_requirement_evidence" USING btree ("engagement_id");
