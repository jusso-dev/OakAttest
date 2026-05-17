CREATE TYPE "public"."certification_status" AS ENUM('draft', 'signed', 'superseded', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."cve_scan_source" AS ENUM('manifest', 'sbom', 'github');--> statement-breakpoint
CREATE TYPE "public"."cve_scan_status" AS ENUM('pending', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."cve_severity" AS ENUM('critical', 'high', 'medium', 'low', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."essential_eight_strategy" AS ENUM('application_control', 'patch_applications', 'configure_macro_settings', 'user_application_hardening', 'restrict_admin_privileges', 'patch_operating_systems', 'multi_factor_authentication', 'regular_backups');--> statement-breakpoint
CREATE TYPE "public"."evidence_request_status" AS ENUM('open', 'partially_satisfied', 'satisfied', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."evidence_review_status" AS ENUM('pending', 'accepted', 'insufficient', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."finding_severity" AS ENUM('critical', 'high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."finding_status" AS ENUM('open', 'in_progress', 'awaiting_retest', 'closed', 'accepted_risk');--> statement-breakpoint
CREATE TYPE "public"."finding_type" AS ENUM('non_conformance', 'observation');--> statement-breakpoint
CREATE TYPE "public"."interview_status" AS ENUM('scheduled', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."maturity_level" AS ENUM('ml0', 'ml1', 'ml2', 'ml3');--> statement-breakpoint
CREATE TYPE "public"."remediation_action_status" AS ENUM('open', 'in_progress', 'ready_for_retest', 'closed');--> statement-breakpoint
CREATE TYPE "public"."ssp_section_key" AS ENUM('overview', 'classification', 'boundary', 'controls', 'implementation', 'essential_eight', 'residual_risks', 'annexes');--> statement-breakpoint
CREATE TABLE "boundary_change_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"base_boundary_id" uuid NOT NULL,
	"proposed_graph" jsonb NOT NULL,
	"rationale" text NOT NULL,
	"impact_analysis" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"raised_by" uuid,
	"raised_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"review_notes" text
);
--> statement-breakpoint
CREATE TABLE "system_boundaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"graph" jsonb NOT NULL,
	"note" text,
	"locked" boolean DEFAULT false NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" uuid,
	"superseded_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence_item_controls" (
	"evidence_item_id" uuid NOT NULL,
	"ism_control_id" uuid NOT NULL,
	CONSTRAINT "evidence_item_controls_evidence_item_id_ism_control_id_pk" PRIMARY KEY("evidence_item_id","ism_control_id")
);
--> statement-breakpoint
CREATE TABLE "evidence_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"evidence_request_id" uuid,
	"filename" text NOT NULL,
	"mime_type" text,
	"size_bytes" bigint NOT NULL,
	"sha256" text NOT NULL,
	"storage_key" text NOT NULL,
	"storage_bucket" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"supersedes_id" uuid,
	"description" text,
	"uploaded_by" uuid,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"review_status" "evidence_review_status" DEFAULT 'pending' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"review_notes" text
);
--> statement-breakpoint
CREATE TABLE "evidence_request_controls" (
	"evidence_request_id" uuid NOT NULL,
	"ism_control_id" uuid NOT NULL,
	CONSTRAINT "evidence_request_controls_evidence_request_id_ism_control_id_pk" PRIMARY KEY("evidence_request_id","ism_control_id")
);
--> statement-breakpoint
CREATE TABLE "evidence_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"artifact_type" text,
	"due_at" timestamp with time zone,
	"status" "evidence_request_status" DEFAULT 'open' NOT NULL,
	"requested_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "finding_controls" (
	"finding_id" uuid NOT NULL,
	"ism_control_id" uuid NOT NULL,
	CONSTRAINT "finding_controls_finding_id_ism_control_id_pk" PRIMARY KEY("finding_id","ism_control_id")
);
--> statement-breakpoint
CREATE TABLE "finding_evidence" (
	"finding_id" uuid NOT NULL,
	"evidence_item_id" uuid NOT NULL,
	CONSTRAINT "finding_evidence_finding_id_evidence_item_id_pk" PRIMARY KEY("finding_id","evidence_item_id")
);
--> statement-breakpoint
CREATE TABLE "findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"code" text NOT NULL,
	"type" "finding_type" NOT NULL,
	"severity" "finding_severity" NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"recommendation" text,
	"status" "finding_status" DEFAULT 'open' NOT NULL,
	"reported_by" uuid,
	"reported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"signed_off_by" uuid,
	"signed_off_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "remediation_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"finding_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"description" text NOT NULL,
	"owner_name" text,
	"owner_email" text,
	"due_date" timestamp with time zone,
	"status" "remediation_action_status" DEFAULT 'open' NOT NULL,
	"proof_evidence_item_id" uuid,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "essential_eight_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"strategy" "essential_eight_strategy" NOT NULL,
	"current_maturity" "maturity_level" DEFAULT 'ml0' NOT NULL,
	"target_maturity" "maturity_level" DEFAULT 'ml1' NOT NULL,
	"evidence_refs" jsonb,
	"remediation_plan" text,
	"assessed_by" uuid,
	"assessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "essential_eight_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"strategy" "essential_eight_strategy" NOT NULL,
	"maturity" "maturity_level" NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recorded_by" uuid
);
--> statement-breakpoint
CREATE TABLE "ssp_exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"format" text NOT NULL,
	"storage_key" text NOT NULL,
	"storage_bucket" text NOT NULL,
	"sha256" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"generated_by" uuid,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ssp_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"section_key" "ssp_section_key" NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"auto_summary" text,
	"metadata" jsonb,
	"last_edited_by" uuid,
	"last_edited_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interview_controls" (
	"interview_id" uuid NOT NULL,
	"ism_control_id" uuid NOT NULL,
	CONSTRAINT "interview_controls_interview_id_ism_control_id_pk" PRIMARY KEY("interview_id","ism_control_id")
);
--> statement-breakpoint
CREATE TABLE "interviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" text NOT NULL,
	"purpose" text,
	"scheduled_at" timestamp with time zone,
	"duration_minutes" integer,
	"location" text,
	"attendees" jsonb,
	"notes" text,
	"observations" text,
	"status" "interview_status" DEFAULT 'scheduled' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "certification_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" "certification_status" DEFAULT 'draft' NOT NULL,
	"snapshot" jsonb NOT NULL,
	"pdf_storage_key" text,
	"pdf_storage_bucket" text,
	"pdf_sha256" text,
	"bundle_storage_key" text,
	"bundle_storage_bucket" text,
	"bundle_sha256" text,
	"public_verification_token" text,
	"signed_by" uuid,
	"signed_at" timestamp with time zone,
	"signature_value" text,
	"signature_algorithm" text,
	"revoked_at" timestamp with time zone,
	"revoked_reason" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "residual_risks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"certification_report_id" uuid,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"likelihood" text,
	"impact" text,
	"mitigation" text,
	"accepted_by" text,
	"accepted_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_signing_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"key_type" text NOT NULL,
	"public_key" text NOT NULL,
	"kms_key_arn" text,
	"fingerprint" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rotated_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "cve_scan_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scan_id" uuid NOT NULL,
	"package_ecosystem" text NOT NULL,
	"package_name" text NOT NULL,
	"version" text NOT NULL,
	"advisory_id" text NOT NULL,
	"severity" "cve_severity" NOT NULL,
	"cvss_score" numeric(4, 1),
	"summary" text,
	"fixed_versions" jsonb,
	"references" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cve_scans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"source" "cve_scan_source" NOT NULL,
	"source_filename" text,
	"source_artifact_hash" text NOT NULL,
	"status" "cve_scan_status" DEFAULT 'pending' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"failure_reason" text,
	"requested_by" uuid,
	"signed_hash" text,
	"signed_at" timestamp with time zone,
	"finding_count" integer DEFAULT 0 NOT NULL,
	"critical_count" integer DEFAULT 0 NOT NULL,
	"high_count" integer DEFAULT 0 NOT NULL,
	"medium_count" integer DEFAULT 0 NOT NULL,
	"low_count" integer DEFAULT 0 NOT NULL,
	"evidence_item_id" uuid,
	"previous_scan_id" uuid
);
--> statement-breakpoint
CREATE TABLE "engagement_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "engagement_role" NOT NULL,
	"token" text NOT NULL,
	"invited_by" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by" uuid,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "boundary_change_requests" ADD CONSTRAINT "boundary_change_requests_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boundary_change_requests" ADD CONSTRAINT "boundary_change_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boundary_change_requests" ADD CONSTRAINT "boundary_change_requests_base_boundary_id_system_boundaries_id_fk" FOREIGN KEY ("base_boundary_id") REFERENCES "public"."system_boundaries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boundary_change_requests" ADD CONSTRAINT "boundary_change_requests_raised_by_users_id_fk" FOREIGN KEY ("raised_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boundary_change_requests" ADD CONSTRAINT "boundary_change_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_boundaries" ADD CONSTRAINT "system_boundaries_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_boundaries" ADD CONSTRAINT "system_boundaries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_boundaries" ADD CONSTRAINT "system_boundaries_locked_by_users_id_fk" FOREIGN KEY ("locked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_boundaries" ADD CONSTRAINT "system_boundaries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_item_controls" ADD CONSTRAINT "evidence_item_controls_evidence_item_id_evidence_items_id_fk" FOREIGN KEY ("evidence_item_id") REFERENCES "public"."evidence_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_item_controls" ADD CONSTRAINT "evidence_item_controls_ism_control_id_ism_controls_id_fk" FOREIGN KEY ("ism_control_id") REFERENCES "public"."ism_controls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_items" ADD CONSTRAINT "evidence_items_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_items" ADD CONSTRAINT "evidence_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_items" ADD CONSTRAINT "evidence_items_evidence_request_id_evidence_requests_id_fk" FOREIGN KEY ("evidence_request_id") REFERENCES "public"."evidence_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_items" ADD CONSTRAINT "evidence_items_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_items" ADD CONSTRAINT "evidence_items_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_request_controls" ADD CONSTRAINT "evidence_request_controls_evidence_request_id_evidence_requests_id_fk" FOREIGN KEY ("evidence_request_id") REFERENCES "public"."evidence_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_request_controls" ADD CONSTRAINT "evidence_request_controls_ism_control_id_ism_controls_id_fk" FOREIGN KEY ("ism_control_id") REFERENCES "public"."ism_controls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_requests" ADD CONSTRAINT "evidence_requests_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_requests" ADD CONSTRAINT "evidence_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_requests" ADD CONSTRAINT "evidence_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding_controls" ADD CONSTRAINT "finding_controls_finding_id_findings_id_fk" FOREIGN KEY ("finding_id") REFERENCES "public"."findings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding_controls" ADD CONSTRAINT "finding_controls_ism_control_id_ism_controls_id_fk" FOREIGN KEY ("ism_control_id") REFERENCES "public"."ism_controls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding_evidence" ADD CONSTRAINT "finding_evidence_finding_id_findings_id_fk" FOREIGN KEY ("finding_id") REFERENCES "public"."findings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding_evidence" ADD CONSTRAINT "finding_evidence_evidence_item_id_evidence_items_id_fk" FOREIGN KEY ("evidence_item_id") REFERENCES "public"."evidence_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_reported_by_users_id_fk" FOREIGN KEY ("reported_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_signed_off_by_users_id_fk" FOREIGN KEY ("signed_off_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remediation_actions" ADD CONSTRAINT "remediation_actions_finding_id_findings_id_fk" FOREIGN KEY ("finding_id") REFERENCES "public"."findings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remediation_actions" ADD CONSTRAINT "remediation_actions_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remediation_actions" ADD CONSTRAINT "remediation_actions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remediation_actions" ADD CONSTRAINT "remediation_actions_proof_evidence_item_id_evidence_items_id_fk" FOREIGN KEY ("proof_evidence_item_id") REFERENCES "public"."evidence_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remediation_actions" ADD CONSTRAINT "remediation_actions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "essential_eight_assessments" ADD CONSTRAINT "essential_eight_assessments_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "essential_eight_assessments" ADD CONSTRAINT "essential_eight_assessments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "essential_eight_assessments" ADD CONSTRAINT "essential_eight_assessments_assessed_by_users_id_fk" FOREIGN KEY ("assessed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "essential_eight_history" ADD CONSTRAINT "essential_eight_history_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "essential_eight_history" ADD CONSTRAINT "essential_eight_history_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "essential_eight_history" ADD CONSTRAINT "essential_eight_history_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ssp_exports" ADD CONSTRAINT "ssp_exports_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ssp_exports" ADD CONSTRAINT "ssp_exports_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ssp_exports" ADD CONSTRAINT "ssp_exports_generated_by_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ssp_sections" ADD CONSTRAINT "ssp_sections_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ssp_sections" ADD CONSTRAINT "ssp_sections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ssp_sections" ADD CONSTRAINT "ssp_sections_last_edited_by_users_id_fk" FOREIGN KEY ("last_edited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_controls" ADD CONSTRAINT "interview_controls_interview_id_interviews_id_fk" FOREIGN KEY ("interview_id") REFERENCES "public"."interviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_controls" ADD CONSTRAINT "interview_controls_ism_control_id_ism_controls_id_fk" FOREIGN KEY ("ism_control_id") REFERENCES "public"."ism_controls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certification_reports" ADD CONSTRAINT "certification_reports_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certification_reports" ADD CONSTRAINT "certification_reports_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certification_reports" ADD CONSTRAINT "certification_reports_signed_by_users_id_fk" FOREIGN KEY ("signed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certification_reports" ADD CONSTRAINT "certification_reports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "residual_risks" ADD CONSTRAINT "residual_risks_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "residual_risks" ADD CONSTRAINT "residual_risks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "residual_risks" ADD CONSTRAINT "residual_risks_certification_report_id_certification_reports_id_fk" FOREIGN KEY ("certification_report_id") REFERENCES "public"."certification_reports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "residual_risks" ADD CONSTRAINT "residual_risks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_signing_keys" ADD CONSTRAINT "tenant_signing_keys_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cve_scan_findings" ADD CONSTRAINT "cve_scan_findings_scan_id_cve_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."cve_scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cve_scans" ADD CONSTRAINT "cve_scans_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cve_scans" ADD CONSTRAINT "cve_scans_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cve_scans" ADD CONSTRAINT "cve_scans_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cve_scans" ADD CONSTRAINT "cve_scans_evidence_item_id_evidence_items_id_fk" FOREIGN KEY ("evidence_item_id") REFERENCES "public"."evidence_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_invitations" ADD CONSTRAINT "engagement_invitations_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_invitations" ADD CONSTRAINT "engagement_invitations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_invitations" ADD CONSTRAINT "engagement_invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_invitations" ADD CONSTRAINT "engagement_invitations_accepted_by_users_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "boundary_change_requests_engagement_idx" ON "boundary_change_requests" USING btree ("engagement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "system_boundaries_engagement_version_uq" ON "system_boundaries" USING btree ("engagement_id","version");--> statement-breakpoint
CREATE INDEX "system_boundaries_engagement_idx" ON "system_boundaries" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "evidence_items_engagement_idx" ON "evidence_items" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "evidence_items_request_idx" ON "evidence_items" USING btree ("evidence_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "evidence_items_sha_engagement_uq" ON "evidence_items" USING btree ("engagement_id","sha256","version");--> statement-breakpoint
CREATE INDEX "evidence_requests_engagement_idx" ON "evidence_requests" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "evidence_requests_status_idx" ON "evidence_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "findings_engagement_idx" ON "findings" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "findings_status_idx" ON "findings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "findings_severity_idx" ON "findings" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "remediation_actions_finding_idx" ON "remediation_actions" USING btree ("finding_id");--> statement-breakpoint
CREATE INDEX "remediation_actions_engagement_idx" ON "remediation_actions" USING btree ("engagement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "e8_engagement_strategy_uq" ON "essential_eight_assessments" USING btree ("engagement_id","strategy");--> statement-breakpoint
CREATE INDEX "e8_engagement_idx" ON "essential_eight_assessments" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "e8_history_engagement_idx" ON "essential_eight_history" USING btree ("engagement_id","recorded_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ssp_exports_engagement_version_format_uq" ON "ssp_exports" USING btree ("engagement_id","version","format");--> statement-breakpoint
CREATE INDEX "ssp_exports_engagement_idx" ON "ssp_exports" USING btree ("engagement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ssp_sections_engagement_section_uq" ON "ssp_sections" USING btree ("engagement_id","section_key");--> statement-breakpoint
CREATE INDEX "interviews_engagement_idx" ON "interviews" USING btree ("engagement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "certification_engagement_version_uq" ON "certification_reports" USING btree ("engagement_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "certification_public_token_uq" ON "certification_reports" USING btree ("public_verification_token");--> statement-breakpoint
CREATE INDEX "certification_engagement_idx" ON "certification_reports" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "residual_risks_engagement_idx" ON "residual_risks" USING btree ("engagement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_signing_keys_fingerprint_uq" ON "tenant_signing_keys" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "tenant_signing_keys_tenant_idx" ON "tenant_signing_keys" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "cve_scan_findings_scan_idx" ON "cve_scan_findings" USING btree ("scan_id");--> statement-breakpoint
CREATE INDEX "cve_scan_findings_severity_idx" ON "cve_scan_findings" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "cve_scans_engagement_idx" ON "cve_scans" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "cve_scans_status_idx" ON "cve_scans" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "engagement_invitations_token_uq" ON "engagement_invitations" USING btree ("token");--> statement-breakpoint
CREATE INDEX "engagement_invitations_engagement_email_idx" ON "engagement_invitations" USING btree ("engagement_id","email");