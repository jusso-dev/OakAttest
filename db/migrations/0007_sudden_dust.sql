CREATE TABLE "finding_retests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"finding_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"method" text NOT NULL,
	"result" text NOT NULL,
	"notes" text,
	"evidence_item_ids" jsonb,
	"retested_by" uuid,
	"retested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finding_risk_acceptances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"finding_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"accepted_by_name" text NOT NULL,
	"accepted_at" timestamp with time zone NOT NULL,
	"rationale" text NOT NULL,
	"residual_risk_id" uuid,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "essential_eight_evidence" (
	"assessment_id" uuid NOT NULL,
	"evidence_item_id" uuid NOT NULL,
	"quality" text,
	"notes" text,
	"linked_by" uuid,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "essential_eight_evidence_assessment_id_evidence_item_id_pk" PRIMARY KEY("assessment_id","evidence_item_id")
);
--> statement-breakpoint
CREATE TABLE "essential_eight_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"target_maturity" "maturity_level" DEFAULT 'ml1' NOT NULL,
	"scope" text,
	"approach" text,
	"limitations" text,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "essential_eight_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"storage_key" text NOT NULL,
	"storage_bucket" text NOT NULL,
	"sha256" text NOT NULL,
	"generated_by" uuid,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ssp_section_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"parent_comment_id" uuid,
	"body" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_by" uuid,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ssp_section_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"content" text NOT NULL,
	"review_status" text NOT NULL,
	"edited_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "security_policy" jsonb;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "compliance_policy" jsonb;--> statement-breakpoint
ALTER TABLE "evidence_items" ADD COLUMN "storage_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "evidence_items" ADD COLUMN "storage_verification" text;--> statement-breakpoint
ALTER TABLE "evidence_items" ADD COLUMN "quarantined_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "evidence_items" ADD COLUMN "quarantine_reason" text;--> statement-breakpoint
ALTER TABLE "essential_eight_assessments" ADD COLUMN "assessment_methods" text;--> statement-breakpoint
ALTER TABLE "essential_eight_assessments" ADD COLUMN "assessment_objects" text;--> statement-breakpoint
ALTER TABLE "essential_eight_assessments" ADD COLUMN "sample_size" text;--> statement-breakpoint
ALTER TABLE "essential_eight_assessments" ADD COLUMN "evidence_quality" text;--> statement-breakpoint
ALTER TABLE "essential_eight_assessments" ADD COLUMN "evidence_limitations" text;--> statement-breakpoint
ALTER TABLE "essential_eight_assessments" ADD COLUMN "assessor_conclusion" text;--> statement-breakpoint
ALTER TABLE "essential_eight_assessments" ADD COLUMN "exceptions" jsonb;--> statement-breakpoint
ALTER TABLE "ssp_sections" ADD COLUMN "review_status" text DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "finding_retests" ADD CONSTRAINT "finding_retests_finding_id_findings_id_fk" FOREIGN KEY ("finding_id") REFERENCES "public"."findings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding_retests" ADD CONSTRAINT "finding_retests_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding_retests" ADD CONSTRAINT "finding_retests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding_retests" ADD CONSTRAINT "finding_retests_retested_by_users_id_fk" FOREIGN KEY ("retested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding_risk_acceptances" ADD CONSTRAINT "finding_risk_acceptances_finding_id_findings_id_fk" FOREIGN KEY ("finding_id") REFERENCES "public"."findings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding_risk_acceptances" ADD CONSTRAINT "finding_risk_acceptances_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding_risk_acceptances" ADD CONSTRAINT "finding_risk_acceptances_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding_risk_acceptances" ADD CONSTRAINT "finding_risk_acceptances_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "essential_eight_evidence" ADD CONSTRAINT "essential_eight_evidence_assessment_id_essential_eight_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."essential_eight_assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "essential_eight_evidence" ADD CONSTRAINT "essential_eight_evidence_evidence_item_id_evidence_items_id_fk" FOREIGN KEY ("evidence_item_id") REFERENCES "public"."evidence_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "essential_eight_evidence" ADD CONSTRAINT "essential_eight_evidence_linked_by_users_id_fk" FOREIGN KEY ("linked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "essential_eight_profiles" ADD CONSTRAINT "essential_eight_profiles_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "essential_eight_profiles" ADD CONSTRAINT "essential_eight_profiles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "essential_eight_profiles" ADD CONSTRAINT "essential_eight_profiles_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "essential_eight_reports" ADD CONSTRAINT "essential_eight_reports_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "essential_eight_reports" ADD CONSTRAINT "essential_eight_reports_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "essential_eight_reports" ADD CONSTRAINT "essential_eight_reports_generated_by_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ssp_section_comments" ADD CONSTRAINT "ssp_section_comments_section_id_ssp_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."ssp_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ssp_section_comments" ADD CONSTRAINT "ssp_section_comments_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ssp_section_comments" ADD CONSTRAINT "ssp_section_comments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ssp_section_comments" ADD CONSTRAINT "ssp_section_comments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ssp_section_comments" ADD CONSTRAINT "ssp_section_comments_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ssp_section_versions" ADD CONSTRAINT "ssp_section_versions_section_id_ssp_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."ssp_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ssp_section_versions" ADD CONSTRAINT "ssp_section_versions_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ssp_section_versions" ADD CONSTRAINT "ssp_section_versions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ssp_section_versions" ADD CONSTRAINT "ssp_section_versions_edited_by_users_id_fk" FOREIGN KEY ("edited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "finding_retests_finding_idx" ON "finding_retests" USING btree ("finding_id");--> statement-breakpoint
CREATE INDEX "finding_risk_acceptances_finding_idx" ON "finding_risk_acceptances" USING btree ("finding_id");--> statement-breakpoint
CREATE UNIQUE INDEX "e8_profiles_engagement_uq" ON "essential_eight_profiles" USING btree ("engagement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "e8_reports_engagement_version_uq" ON "essential_eight_reports" USING btree ("engagement_id","version");--> statement-breakpoint
CREATE INDEX "e8_reports_engagement_idx" ON "essential_eight_reports" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "ssp_section_comments_section_idx" ON "ssp_section_comments" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "ssp_section_comments_engagement_idx" ON "ssp_section_comments" USING btree ("engagement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ssp_section_versions_section_version_uq" ON "ssp_section_versions" USING btree ("section_id","version");