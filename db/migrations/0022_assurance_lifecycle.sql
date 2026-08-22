CREATE TABLE "system_risks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "engagement_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "sequence" integer NOT NULL,
  "code" text NOT NULL,
  "title" text NOT NULL,
  "description" text NOT NULL,
  "asset" text NOT NULL,
  "threat" text NOT NULL,
  "vulnerability" text NOT NULL,
  "inherent_likelihood" integer NOT NULL,
  "inherent_impact" integer NOT NULL,
  "existing_controls" text,
  "residual_likelihood" integer NOT NULL,
  "residual_impact" integer NOT NULL,
  "owner_name" text,
  "owner_email" text,
  "status" text DEFAULT 'identified' NOT NULL,
  "created_by" uuid,
  "updated_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "system_risks_likelihood_check" CHECK ("inherent_likelihood" BETWEEN 1 AND 5 AND "residual_likelihood" BETWEEN 1 AND 5),
  CONSTRAINT "system_risks_impact_check" CHECK ("inherent_impact" BETWEEN 1 AND 5 AND "residual_impact" BETWEEN 1 AND 5),
  CONSTRAINT "system_risks_status_check" CHECK ("status" IN ('identified', 'treating', 'monitoring', 'closed'))
);

CREATE TABLE "risk_treatment_decisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "risk_id" uuid NOT NULL,
  "engagement_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "decision" text NOT NULL,
  "rationale" text NOT NULL,
  "treatment_plan" text,
  "owner_name" text,
  "owner_email" text,
  "due_at" timestamp with time zone,
  "accepted_by_name" text,
  "accepted_by_role" text,
  "accepted_at" timestamp with time zone,
  "expires_at" timestamp with time zone,
  "recorded_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "risk_treatment_decision_check" CHECK ("decision" IN ('mitigate', 'avoid', 'transfer', 'accept'))
);

CREATE TABLE "system_authorisations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "engagement_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "version" integer NOT NULL,
  "status" text NOT NULL,
  "system_owner_name" text NOT NULL,
  "authorising_officer_name" text,
  "authorising_officer_role" text,
  "decision_statement" text,
  "conditions" text,
  "issued_at" timestamp with time zone,
  "expires_at" timestamp with time zone,
  "risk_snapshot" jsonb NOT NULL,
  "decided_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "system_authorisations_status_check" CHECK ("status" IN ('draft', 'submitted', 'authorised', 'authorised_with_conditions', 'declined', 'expired', 'revoked'))
);

CREATE TABLE "continuous_monitoring_plans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "engagement_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "objectives" text NOT NULL,
  "cadence_days" integer NOT NULL,
  "owner_name" text NOT NULL,
  "owner_email" text,
  "monitored_signals" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "change_triggers" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "next_review_at" timestamp with time zone NOT NULL,
  "last_reviewed_at" timestamp with time zone,
  "updated_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "continuous_monitoring_plans_status_check" CHECK ("status" IN ('draft', 'active', 'paused', 'retired')),
  CONSTRAINT "continuous_monitoring_plans_cadence_check" CHECK ("cadence_days" BETWEEN 1 AND 3650)
);

CREATE TABLE "monitoring_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "engagement_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "type" text NOT NULL,
  "severity" text NOT NULL,
  "title" text NOT NULL,
  "description" text NOT NULL,
  "source" text,
  "related_risk_id" uuid,
  "detected_at" timestamp with time zone NOT NULL,
  "requires_reassessment" boolean DEFAULT false NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "triage_notes" text,
  "created_by" uuid,
  "closed_by" uuid,
  "closed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "monitoring_events_type_check" CHECK ("type" IN ('policy_change', 'new_threat', 'control_ineffective', 'system_change', 'incident', 'scheduled_review')),
  CONSTRAINT "monitoring_events_severity_check" CHECK ("severity" IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT "monitoring_events_status_check" CHECK ("status" IN ('open', 'triaged', 'closed'))
);

ALTER TABLE "system_risks" ADD CONSTRAINT "system_risks_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade;
ALTER TABLE "system_risks" ADD CONSTRAINT "system_risks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");
ALTER TABLE "system_risks" ADD CONSTRAINT "system_risks_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");
ALTER TABLE "system_risks" ADD CONSTRAINT "system_risks_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id");
ALTER TABLE "risk_treatment_decisions" ADD CONSTRAINT "risk_treatment_decisions_risk_id_system_risks_id_fk" FOREIGN KEY ("risk_id") REFERENCES "public"."system_risks"("id") ON DELETE cascade;
ALTER TABLE "risk_treatment_decisions" ADD CONSTRAINT "risk_treatment_decisions_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade;
ALTER TABLE "risk_treatment_decisions" ADD CONSTRAINT "risk_treatment_decisions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");
ALTER TABLE "risk_treatment_decisions" ADD CONSTRAINT "risk_treatment_decisions_recorded_by_user_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id");
ALTER TABLE "system_authorisations" ADD CONSTRAINT "system_authorisations_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade;
ALTER TABLE "system_authorisations" ADD CONSTRAINT "system_authorisations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");
ALTER TABLE "system_authorisations" ADD CONSTRAINT "system_authorisations_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id");
ALTER TABLE "continuous_monitoring_plans" ADD CONSTRAINT "continuous_monitoring_plans_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade;
ALTER TABLE "continuous_monitoring_plans" ADD CONSTRAINT "continuous_monitoring_plans_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");
ALTER TABLE "continuous_monitoring_plans" ADD CONSTRAINT "continuous_monitoring_plans_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id");
ALTER TABLE "monitoring_events" ADD CONSTRAINT "monitoring_events_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade;
ALTER TABLE "monitoring_events" ADD CONSTRAINT "monitoring_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");
ALTER TABLE "monitoring_events" ADD CONSTRAINT "monitoring_events_related_risk_id_system_risks_id_fk" FOREIGN KEY ("related_risk_id") REFERENCES "public"."system_risks"("id") ON DELETE set null;
ALTER TABLE "monitoring_events" ADD CONSTRAINT "monitoring_events_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");
ALTER TABLE "monitoring_events" ADD CONSTRAINT "monitoring_events_closed_by_user_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id");

CREATE UNIQUE INDEX "system_risks_engagement_sequence_uq" ON "system_risks" ("engagement_id", "sequence");
CREATE UNIQUE INDEX "system_risks_engagement_code_uq" ON "system_risks" ("engagement_id", "code");
CREATE INDEX "system_risks_engagement_idx" ON "system_risks" ("engagement_id");
CREATE INDEX "system_risks_status_idx" ON "system_risks" ("status");
CREATE INDEX "risk_treatment_decisions_risk_idx" ON "risk_treatment_decisions" ("risk_id", "created_at");
CREATE INDEX "risk_treatment_decisions_engagement_idx" ON "risk_treatment_decisions" ("engagement_id");
CREATE UNIQUE INDEX "system_authorisations_engagement_version_uq" ON "system_authorisations" ("engagement_id", "version");
CREATE INDEX "system_authorisations_engagement_idx" ON "system_authorisations" ("engagement_id", "created_at");
CREATE UNIQUE INDEX "continuous_monitoring_plans_engagement_uq" ON "continuous_monitoring_plans" ("engagement_id");
CREATE INDEX "continuous_monitoring_plans_review_idx" ON "continuous_monitoring_plans" ("next_review_at");
CREATE INDEX "monitoring_events_engagement_idx" ON "monitoring_events" ("engagement_id", "detected_at");
CREATE INDEX "monitoring_events_status_idx" ON "monitoring_events" ("status");
