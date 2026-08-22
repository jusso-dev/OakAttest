CREATE TABLE "governance_policies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "policy_group_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "engagement_id" uuid NOT NULL,
  "title" text NOT NULL,
  "category" text NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "content" text NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "owner_user_id" uuid,
  "review_due_at" timestamp with time zone NOT NULL,
  "approved_by" uuid,
  "approved_at" timestamp with time zone,
  "published_by" uuid,
  "published_at" timestamp with time zone,
  "retired_at" timestamp with time zone,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "governance_policies_version_check" CHECK ("version" > 0),
  CONSTRAINT "governance_policies_status_check" CHECK ("status" IN ('draft', 'in_review', 'approved', 'published', 'retired'))
);

CREATE TABLE "policy_attestations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "policy_id" uuid NOT NULL,
  "policy_version" integer NOT NULL,
  "tenant_id" uuid NOT NULL,
  "engagement_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "due_at" timestamp with time zone NOT NULL,
  "accepted_at" timestamp with time zone,
  "acceptance_sha256" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "policy_attestations_status_check" CHECK ("status" IN ('pending', 'accepted'))
);

CREATE TABLE "personnel_assurance_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "engagement_id" uuid NOT NULL,
  "person_name" text NOT NULL,
  "person_email" text NOT NULL,
  "role_title" text,
  "employment_status" text DEFAULT 'onboarding' NOT NULL,
  "screening_status" text DEFAULT 'pending' NOT NULL,
  "screening_expires_at" timestamp with time zone,
  "training_due_at" timestamp with time zone,
  "training_completed_at" timestamp with time zone,
  "offboarding_due_at" timestamp with time zone,
  "offboarding_completed_at" timestamp with time zone,
  "owner_user_id" uuid,
  "notes" text,
  "created_by" uuid,
  "updated_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "personnel_assurance_employment_check" CHECK ("employment_status" IN ('onboarding', 'active', 'suspended', 'terminated')),
  CONSTRAINT "personnel_assurance_screening_check" CHECK ("screening_status" IN ('not_required', 'pending', 'verified', 'expired'))
);

CREATE TABLE "access_review_campaigns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "engagement_id" uuid NOT NULL,
  "title" text NOT NULL,
  "scope" text NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "owner_user_id" uuid,
  "due_at" timestamp with time zone NOT NULL,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "access_review_campaigns_status_check" CHECK ("status" IN ('draft', 'in_progress', 'in_review', 'completed'))
);

CREATE TABLE "access_review_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "campaign_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "engagement_id" uuid NOT NULL,
  "subject_name" text NOT NULL,
  "subject_email" text,
  "system_name" text NOT NULL,
  "access_level" text NOT NULL,
  "reviewer_user_id" uuid,
  "decision" text DEFAULT 'pending' NOT NULL,
  "rationale" text,
  "remediation_status" text DEFAULT 'none' NOT NULL,
  "decided_by" uuid,
  "decided_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "access_review_items_decision_check" CHECK ("decision" IN ('pending', 'retain', 'modify', 'revoke')),
  CONSTRAINT "access_review_items_remediation_check" CHECK ("remediation_status" IN ('none', 'open', 'complete'))
);

CREATE TABLE "vendor_risk_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "engagement_id" uuid NOT NULL,
  "vendor_name" text NOT NULL,
  "service_description" text NOT NULL,
  "criticality" text NOT NULL,
  "status" text DEFAULT 'intake' NOT NULL,
  "inherent_risk" text DEFAULT 'medium' NOT NULL,
  "residual_risk" text,
  "data_handled" text,
  "due_diligence_summary" text,
  "owner_user_id" uuid,
  "contract_expires_at" timestamp with time zone,
  "next_review_at" timestamp with time zone,
  "last_assessed_at" timestamp with time zone,
  "risk_acceptance_statement" text,
  "risk_accepted_by" uuid,
  "risk_accepted_at" timestamp with time zone,
  "created_by" uuid,
  "updated_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "vendor_risk_records_criticality_check" CHECK ("criticality" IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT "vendor_risk_records_status_check" CHECK ("status" IN ('intake', 'assessing', 'approved', 'monitoring', 'offboarding', 'closed')),
  CONSTRAINT "vendor_risk_records_inherent_check" CHECK ("inherent_risk" IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT "vendor_risk_records_residual_check" CHECK ("residual_risk" IS NULL OR "residual_risk" IN ('low', 'medium', 'high', 'critical'))
);

ALTER TABLE "governance_policies" ADD CONSTRAINT "governance_policies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");
ALTER TABLE "governance_policies" ADD CONSTRAINT "governance_policies_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade;
ALTER TABLE "governance_policies" ADD CONSTRAINT "governance_policies_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id");
ALTER TABLE "governance_policies" ADD CONSTRAINT "governance_policies_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id");
ALTER TABLE "governance_policies" ADD CONSTRAINT "governance_policies_published_by_user_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id");
ALTER TABLE "governance_policies" ADD CONSTRAINT "governance_policies_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");

ALTER TABLE "policy_attestations" ADD CONSTRAINT "policy_attestations_policy_id_governance_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."governance_policies"("id") ON DELETE cascade;
ALTER TABLE "policy_attestations" ADD CONSTRAINT "policy_attestations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");
ALTER TABLE "policy_attestations" ADD CONSTRAINT "policy_attestations_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade;
ALTER TABLE "policy_attestations" ADD CONSTRAINT "policy_attestations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");

ALTER TABLE "personnel_assurance_records" ADD CONSTRAINT "personnel_assurance_records_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");
ALTER TABLE "personnel_assurance_records" ADD CONSTRAINT "personnel_assurance_records_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade;
ALTER TABLE "personnel_assurance_records" ADD CONSTRAINT "personnel_assurance_records_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id");
ALTER TABLE "personnel_assurance_records" ADD CONSTRAINT "personnel_assurance_records_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");
ALTER TABLE "personnel_assurance_records" ADD CONSTRAINT "personnel_assurance_records_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id");

ALTER TABLE "access_review_campaigns" ADD CONSTRAINT "access_review_campaigns_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");
ALTER TABLE "access_review_campaigns" ADD CONSTRAINT "access_review_campaigns_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade;
ALTER TABLE "access_review_campaigns" ADD CONSTRAINT "access_review_campaigns_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id");
ALTER TABLE "access_review_campaigns" ADD CONSTRAINT "access_review_campaigns_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");

ALTER TABLE "access_review_items" ADD CONSTRAINT "access_review_items_campaign_id_access_review_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."access_review_campaigns"("id") ON DELETE cascade;
ALTER TABLE "access_review_items" ADD CONSTRAINT "access_review_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");
ALTER TABLE "access_review_items" ADD CONSTRAINT "access_review_items_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade;
ALTER TABLE "access_review_items" ADD CONSTRAINT "access_review_items_reviewer_user_id_user_id_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."users"("id");
ALTER TABLE "access_review_items" ADD CONSTRAINT "access_review_items_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id");

ALTER TABLE "vendor_risk_records" ADD CONSTRAINT "vendor_risk_records_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");
ALTER TABLE "vendor_risk_records" ADD CONSTRAINT "vendor_risk_records_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade;
ALTER TABLE "vendor_risk_records" ADD CONSTRAINT "vendor_risk_records_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id");
ALTER TABLE "vendor_risk_records" ADD CONSTRAINT "vendor_risk_records_risk_accepted_by_user_id_fk" FOREIGN KEY ("risk_accepted_by") REFERENCES "public"."users"("id");
ALTER TABLE "vendor_risk_records" ADD CONSTRAINT "vendor_risk_records_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");
ALTER TABLE "vendor_risk_records" ADD CONSTRAINT "vendor_risk_records_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id");

CREATE UNIQUE INDEX "governance_policies_group_version_uq" ON "governance_policies" ("policy_group_id", "version");
CREATE INDEX "governance_policies_engagement_idx" ON "governance_policies" ("engagement_id", "status");
CREATE INDEX "governance_policies_review_due_idx" ON "governance_policies" ("review_due_at");
CREATE UNIQUE INDEX "policy_attestations_policy_user_uq" ON "policy_attestations" ("policy_id", "user_id");
CREATE INDEX "policy_attestations_user_status_idx" ON "policy_attestations" ("user_id", "status");
CREATE INDEX "policy_attestations_engagement_due_idx" ON "policy_attestations" ("engagement_id", "due_at");
CREATE UNIQUE INDEX "personnel_assurance_engagement_email_uq" ON "personnel_assurance_records" ("engagement_id", "person_email");
CREATE INDEX "personnel_assurance_status_idx" ON "personnel_assurance_records" ("engagement_id", "employment_status");
CREATE INDEX "personnel_assurance_training_due_idx" ON "personnel_assurance_records" ("training_due_at");
CREATE INDEX "access_review_campaigns_engagement_idx" ON "access_review_campaigns" ("engagement_id", "status");
CREATE INDEX "access_review_campaigns_due_idx" ON "access_review_campaigns" ("due_at");
CREATE INDEX "access_review_items_campaign_idx" ON "access_review_items" ("campaign_id", "decision");
CREATE INDEX "access_review_items_reviewer_idx" ON "access_review_items" ("reviewer_user_id");
CREATE UNIQUE INDEX "vendor_risk_records_engagement_name_uq" ON "vendor_risk_records" ("engagement_id", "vendor_name");
CREATE INDEX "vendor_risk_records_engagement_status_idx" ON "vendor_risk_records" ("engagement_id", "status");
CREATE INDEX "vendor_risk_records_review_due_idx" ON "vendor_risk_records" ("next_review_at");
