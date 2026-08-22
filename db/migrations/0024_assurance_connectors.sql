CREATE TABLE "assurance_connectors" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "engagement_id" uuid NOT NULL,
  "provider" text NOT NULL,
  "name" text NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "configuration" jsonb NOT NULL,
  "schedule_minutes" integer DEFAULT 1440 NOT NULL,
  "last_connection_test_at" timestamp with time zone,
  "last_run_at" timestamp with time zone,
  "next_run_at" timestamp with time zone,
  "last_error" text,
  "created_by" uuid,
  "updated_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "assurance_connectors_provider_check" CHECK ("provider" IN ('aws_security_hub')),
  CONSTRAINT "assurance_connectors_status_check" CHECK ("status" IN ('draft', 'active', 'disabled', 'error')),
  CONSTRAINT "assurance_connectors_schedule_check" CHECK ("schedule_minutes" BETWEEN 15 AND 43200)
);

CREATE TABLE "assurance_test_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "engagement_id" uuid NOT NULL,
  "connector_id" uuid NOT NULL,
  "trigger" text NOT NULL,
  "status" text DEFAULT 'running' NOT NULL,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  "summary" jsonb,
  "error" text,
  "requested_by" uuid,
  CONSTRAINT "assurance_test_runs_trigger_check" CHECK ("trigger" IN ('manual', 'scheduled')),
  CONSTRAINT "assurance_test_runs_status_check" CHECK ("status" IN ('running', 'completed', 'error'))
);

CREATE TABLE "assurance_test_results" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "engagement_id" uuid NOT NULL,
  "connector_id" uuid NOT NULL,
  "run_id" uuid NOT NULL,
  "test_key" text NOT NULL,
  "title" text NOT NULL,
  "outcome" text NOT NULL,
  "observation" text NOT NULL,
  "observed_at" timestamp with time zone NOT NULL,
  "evidence" jsonb NOT NULL,
  "evidence_sha256" text NOT NULL,
  "review_status" text DEFAULT 'pending' NOT NULL,
  "review_notes" text,
  "reviewed_by" uuid,
  "reviewed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "assurance_test_results_outcome_check" CHECK ("outcome" IN ('pass', 'fail', 'error', 'unknown')),
  CONSTRAINT "assurance_test_results_review_check" CHECK ("review_status" IN ('pending', 'accepted', 'rejected'))
);

CREATE TABLE "assurance_test_result_controls" (
  "result_id" uuid NOT NULL,
  "framework_control_id" uuid NOT NULL,
  CONSTRAINT "assurance_test_result_controls_pk" PRIMARY KEY ("result_id", "framework_control_id")
);

CREATE TABLE "assurance_test_control_mappings" (
  "connector_id" uuid NOT NULL,
  "test_key" text NOT NULL,
  "framework_control_id" uuid NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "assurance_test_control_mappings_pk" PRIMARY KEY ("connector_id", "test_key", "framework_control_id")
);

CREATE TABLE "common_control_mappings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "source_framework_control_id" uuid NOT NULL,
  "target_framework_control_id" uuid NOT NULL,
  "relation" text DEFAULT 'supporting' NOT NULL,
  "rationale" text NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "common_control_mappings_relation_check" CHECK ("relation" IN ('equivalent', 'supporting', 'partial')),
  CONSTRAINT "common_control_mappings_distinct_check" CHECK ("source_framework_control_id" <> "target_framework_control_id")
);

CREATE TABLE "evidence_reuse_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "source_engagement_id" uuid NOT NULL,
  "target_engagement_id" uuid NOT NULL,
  "source_evidence_item_id" uuid NOT NULL,
  "target_framework_control_id" uuid NOT NULL,
  "common_control_mapping_id" uuid,
  "status" text DEFAULT 'proposed' NOT NULL,
  "rationale" text NOT NULL,
  "valid_until" timestamp with time zone NOT NULL,
  "proposed_by" uuid,
  "decided_by" uuid,
  "decided_at" timestamp with time zone,
  "decision_notes" text,
  "revoked_at" timestamp with time zone,
  "revoked_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "evidence_reuse_links_status_check" CHECK ("status" IN ('proposed', 'approved', 'rejected', 'revoked')),
  CONSTRAINT "evidence_reuse_links_distinct_engagement_check" CHECK ("source_engagement_id" <> "target_engagement_id"),
  CONSTRAINT "evidence_reuse_links_expiry_check" CHECK ("valid_until" > "created_at")
);

ALTER TABLE "assurance_connectors" ADD CONSTRAINT "assurance_connectors_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");
ALTER TABLE "assurance_connectors" ADD CONSTRAINT "assurance_connectors_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade;
ALTER TABLE "assurance_connectors" ADD CONSTRAINT "assurance_connectors_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id");
ALTER TABLE "assurance_connectors" ADD CONSTRAINT "assurance_connectors_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id");

ALTER TABLE "assurance_test_runs" ADD CONSTRAINT "assurance_test_runs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");
ALTER TABLE "assurance_test_runs" ADD CONSTRAINT "assurance_test_runs_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade;
ALTER TABLE "assurance_test_runs" ADD CONSTRAINT "assurance_test_runs_connector_id_assurance_connectors_id_fk" FOREIGN KEY ("connector_id") REFERENCES "public"."assurance_connectors"("id") ON DELETE cascade;
ALTER TABLE "assurance_test_runs" ADD CONSTRAINT "assurance_test_runs_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id");

ALTER TABLE "assurance_test_results" ADD CONSTRAINT "assurance_test_results_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");
ALTER TABLE "assurance_test_results" ADD CONSTRAINT "assurance_test_results_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade;
ALTER TABLE "assurance_test_results" ADD CONSTRAINT "assurance_test_results_connector_id_assurance_connectors_id_fk" FOREIGN KEY ("connector_id") REFERENCES "public"."assurance_connectors"("id") ON DELETE cascade;
ALTER TABLE "assurance_test_results" ADD CONSTRAINT "assurance_test_results_run_id_assurance_test_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."assurance_test_runs"("id") ON DELETE cascade;
ALTER TABLE "assurance_test_results" ADD CONSTRAINT "assurance_test_results_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id");

ALTER TABLE "assurance_test_result_controls" ADD CONSTRAINT "assurance_test_result_controls_result_id_assurance_test_results_id_fk" FOREIGN KEY ("result_id") REFERENCES "public"."assurance_test_results"("id") ON DELETE cascade;
ALTER TABLE "assurance_test_result_controls" ADD CONSTRAINT "assurance_test_result_controls_framework_control_id_framework_controls_id_fk" FOREIGN KEY ("framework_control_id") REFERENCES "public"."framework_controls"("id");

ALTER TABLE "assurance_test_control_mappings" ADD CONSTRAINT "assurance_test_control_mappings_connector_id_assurance_connectors_id_fk" FOREIGN KEY ("connector_id") REFERENCES "public"."assurance_connectors"("id") ON DELETE cascade;
ALTER TABLE "assurance_test_control_mappings" ADD CONSTRAINT "assurance_test_control_mappings_framework_control_id_framework_controls_id_fk" FOREIGN KEY ("framework_control_id") REFERENCES "public"."framework_controls"("id");
ALTER TABLE "assurance_test_control_mappings" ADD CONSTRAINT "assurance_test_control_mappings_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id");

ALTER TABLE "common_control_mappings" ADD CONSTRAINT "common_control_mappings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade;
ALTER TABLE "common_control_mappings" ADD CONSTRAINT "common_control_mappings_source_framework_control_id_framework_controls_id_fk" FOREIGN KEY ("source_framework_control_id") REFERENCES "public"."framework_controls"("id");
ALTER TABLE "common_control_mappings" ADD CONSTRAINT "common_control_mappings_target_framework_control_id_framework_controls_id_fk" FOREIGN KEY ("target_framework_control_id") REFERENCES "public"."framework_controls"("id");
ALTER TABLE "common_control_mappings" ADD CONSTRAINT "common_control_mappings_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id");

ALTER TABLE "evidence_reuse_links" ADD CONSTRAINT "evidence_reuse_links_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");
ALTER TABLE "evidence_reuse_links" ADD CONSTRAINT "evidence_reuse_links_source_engagement_id_engagements_id_fk" FOREIGN KEY ("source_engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade;
ALTER TABLE "evidence_reuse_links" ADD CONSTRAINT "evidence_reuse_links_target_engagement_id_engagements_id_fk" FOREIGN KEY ("target_engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade;
ALTER TABLE "evidence_reuse_links" ADD CONSTRAINT "evidence_reuse_links_source_evidence_item_id_evidence_items_id_fk" FOREIGN KEY ("source_evidence_item_id") REFERENCES "public"."evidence_items"("id");
ALTER TABLE "evidence_reuse_links" ADD CONSTRAINT "evidence_reuse_links_target_framework_control_id_framework_controls_id_fk" FOREIGN KEY ("target_framework_control_id") REFERENCES "public"."framework_controls"("id");
ALTER TABLE "evidence_reuse_links" ADD CONSTRAINT "evidence_reuse_links_common_control_mapping_id_common_control_mappings_id_fk" FOREIGN KEY ("common_control_mapping_id") REFERENCES "public"."common_control_mappings"("id");
ALTER TABLE "evidence_reuse_links" ADD CONSTRAINT "evidence_reuse_links_proposed_by_user_id_fk" FOREIGN KEY ("proposed_by") REFERENCES "public"."user"("id");
ALTER TABLE "evidence_reuse_links" ADD CONSTRAINT "evidence_reuse_links_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id");
ALTER TABLE "evidence_reuse_links" ADD CONSTRAINT "evidence_reuse_links_revoked_by_user_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."user"("id");

CREATE UNIQUE INDEX "assurance_connectors_engagement_name_uq" ON "assurance_connectors" ("engagement_id", "name");
CREATE INDEX "assurance_connectors_tenant_idx" ON "assurance_connectors" ("tenant_id");
CREATE INDEX "assurance_connectors_due_idx" ON "assurance_connectors" ("status", "next_run_at");
CREATE INDEX "assurance_test_runs_connector_idx" ON "assurance_test_runs" ("connector_id", "started_at");
CREATE INDEX "assurance_test_runs_engagement_idx" ON "assurance_test_runs" ("engagement_id", "started_at");
CREATE UNIQUE INDEX "assurance_test_results_run_key_uq" ON "assurance_test_results" ("run_id", "test_key");
CREATE INDEX "assurance_test_results_connector_idx" ON "assurance_test_results" ("connector_id", "created_at");
CREATE INDEX "assurance_test_results_outcome_idx" ON "assurance_test_results" ("outcome");
CREATE INDEX "assurance_test_results_review_idx" ON "assurance_test_results" ("review_status");
CREATE INDEX "assurance_test_control_mappings_control_idx" ON "assurance_test_control_mappings" ("framework_control_id");
CREATE UNIQUE INDEX "common_control_mappings_pair_uq" ON "common_control_mappings" ("tenant_id", "source_framework_control_id", "target_framework_control_id");
CREATE INDEX "common_control_mappings_source_idx" ON "common_control_mappings" ("tenant_id", "source_framework_control_id");
CREATE INDEX "common_control_mappings_target_idx" ON "common_control_mappings" ("tenant_id", "target_framework_control_id");
CREATE UNIQUE INDEX "evidence_reuse_links_active_uq" ON "evidence_reuse_links" ("target_engagement_id", "source_evidence_item_id", "target_framework_control_id") WHERE "status" IN ('proposed', 'approved');
CREATE INDEX "evidence_reuse_links_target_idx" ON "evidence_reuse_links" ("target_engagement_id", "status");
CREATE INDEX "evidence_reuse_links_source_idx" ON "evidence_reuse_links" ("source_engagement_id");
