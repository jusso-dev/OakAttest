CREATE TABLE "trust_portals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "engagement_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "slug" text NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "title" text NOT NULL,
  "organisation_name" text NOT NULL,
  "overview" text NOT NULL,
  "commitments" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "security_contact_email" text NOT NULL,
  "current_publication_id" uuid,
  "created_by" uuid,
  "updated_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "trust_portals_status_check" CHECK ("status" IN ('draft', 'published', 'disabled'))
);

CREATE TABLE "trust_portal_publications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "portal_id" uuid NOT NULL,
  "engagement_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "certification_report_id" uuid NOT NULL,
  "version" integer NOT NULL,
  "snapshot" jsonb NOT NULL,
  "snapshot_sha256" text NOT NULL,
  "release_classification" text DEFAULT 'PUBLIC' NOT NULL,
  "approval_statement" text NOT NULL,
  "approved_by" uuid NOT NULL,
  "published_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "revoked_at" timestamp with time zone,
  "revoked_by" uuid,
  "revoked_reason" text,
  CONSTRAINT "trust_portal_publications_classification_check" CHECK ("release_classification" = 'PUBLIC'),
  CONSTRAINT "trust_portal_publications_expiry_check" CHECK ("expires_at" > "published_at")
);

CREATE TABLE "trust_portal_access_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "portal_id" uuid NOT NULL,
  "publication_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "requester_email" text NOT NULL,
  "requester_organisation" text NOT NULL,
  "purpose" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "decision_notes" text,
  "decided_by" uuid,
  "decided_at" timestamp with time zone,
  "requested_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "trust_portal_access_requests_status_check" CHECK ("status" IN ('pending', 'approved', 'denied'))
);

CREATE TABLE "trust_portal_access_grants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "request_id" uuid NOT NULL,
  "portal_id" uuid NOT NULL,
  "publication_id" uuid NOT NULL,
  "certification_report_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "token_sha256" text NOT NULL,
  "requester_email" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "max_downloads" integer DEFAULT 3 NOT NULL,
  "download_count" integer DEFAULT 0 NOT NULL,
  "last_downloaded_at" timestamp with time zone,
  "created_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "revoked_at" timestamp with time zone,
  "revoked_by" uuid,
  CONSTRAINT "trust_portal_access_grants_downloads_check" CHECK ("max_downloads" BETWEEN 1 AND 20 AND "download_count" >= 0 AND "download_count" <= "max_downloads"),
  CONSTRAINT "trust_portal_access_grants_expiry_check" CHECK ("expires_at" > "created_at")
);

ALTER TABLE "trust_portals" ADD CONSTRAINT "trust_portals_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade;
ALTER TABLE "trust_portals" ADD CONSTRAINT "trust_portals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");
ALTER TABLE "trust_portals" ADD CONSTRAINT "trust_portals_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id");
ALTER TABLE "trust_portals" ADD CONSTRAINT "trust_portals_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id");
ALTER TABLE "trust_portal_publications" ADD CONSTRAINT "trust_portal_publications_portal_id_trust_portals_id_fk" FOREIGN KEY ("portal_id") REFERENCES "public"."trust_portals"("id") ON DELETE cascade;
ALTER TABLE "trust_portal_publications" ADD CONSTRAINT "trust_portal_publications_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade;
ALTER TABLE "trust_portal_publications" ADD CONSTRAINT "trust_portal_publications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");
ALTER TABLE "trust_portal_publications" ADD CONSTRAINT "trust_portal_publications_certification_report_id_certification_reports_id_fk" FOREIGN KEY ("certification_report_id") REFERENCES "public"."certification_reports"("id");
ALTER TABLE "trust_portal_publications" ADD CONSTRAINT "trust_portal_publications_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id");
ALTER TABLE "trust_portal_publications" ADD CONSTRAINT "trust_portal_publications_revoked_by_user_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."user"("id");
ALTER TABLE "trust_portal_access_requests" ADD CONSTRAINT "trust_portal_access_requests_portal_id_trust_portals_id_fk" FOREIGN KEY ("portal_id") REFERENCES "public"."trust_portals"("id") ON DELETE cascade;
ALTER TABLE "trust_portal_access_requests" ADD CONSTRAINT "trust_portal_access_requests_publication_id_trust_portal_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."trust_portal_publications"("id") ON DELETE cascade;
ALTER TABLE "trust_portal_access_requests" ADD CONSTRAINT "trust_portal_access_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");
ALTER TABLE "trust_portal_access_requests" ADD CONSTRAINT "trust_portal_access_requests_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id");
ALTER TABLE "trust_portal_access_grants" ADD CONSTRAINT "trust_portal_access_grants_request_id_trust_portal_access_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."trust_portal_access_requests"("id") ON DELETE cascade;
ALTER TABLE "trust_portal_access_grants" ADD CONSTRAINT "trust_portal_access_grants_portal_id_trust_portals_id_fk" FOREIGN KEY ("portal_id") REFERENCES "public"."trust_portals"("id") ON DELETE cascade;
ALTER TABLE "trust_portal_access_grants" ADD CONSTRAINT "trust_portal_access_grants_publication_id_trust_portal_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."trust_portal_publications"("id") ON DELETE cascade;
ALTER TABLE "trust_portal_access_grants" ADD CONSTRAINT "trust_portal_access_grants_certification_report_id_certification_reports_id_fk" FOREIGN KEY ("certification_report_id") REFERENCES "public"."certification_reports"("id");
ALTER TABLE "trust_portal_access_grants" ADD CONSTRAINT "trust_portal_access_grants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");
ALTER TABLE "trust_portal_access_grants" ADD CONSTRAINT "trust_portal_access_grants_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id");
ALTER TABLE "trust_portal_access_grants" ADD CONSTRAINT "trust_portal_access_grants_revoked_by_user_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."user"("id");
ALTER TABLE "trust_portals" ADD CONSTRAINT "trust_portals_current_publication_id_trust_portal_publications_id_fk" FOREIGN KEY ("current_publication_id") REFERENCES "public"."trust_portal_publications"("id") ON DELETE set null;

CREATE UNIQUE INDEX "trust_portals_engagement_uq" ON "trust_portals" ("engagement_id");
CREATE UNIQUE INDEX "trust_portals_slug_uq" ON "trust_portals" ("slug");
CREATE INDEX "trust_portals_tenant_idx" ON "trust_portals" ("tenant_id");
CREATE INDEX "trust_portals_status_idx" ON "trust_portals" ("status");
CREATE UNIQUE INDEX "trust_portal_publications_version_uq" ON "trust_portal_publications" ("portal_id", "version");
CREATE INDEX "trust_portal_publications_portal_idx" ON "trust_portal_publications" ("portal_id", "published_at");
CREATE INDEX "trust_portal_publications_report_idx" ON "trust_portal_publications" ("certification_report_id");
CREATE INDEX "trust_portal_access_requests_portal_idx" ON "trust_portal_access_requests" ("portal_id", "requested_at");
CREATE INDEX "trust_portal_access_requests_status_idx" ON "trust_portal_access_requests" ("status");
CREATE UNIQUE INDEX "trust_portal_access_requests_pending_uq" ON "trust_portal_access_requests" ("publication_id", "requester_email") WHERE "status" = 'pending';
CREATE UNIQUE INDEX "trust_portal_access_grants_request_uq" ON "trust_portal_access_grants" ("request_id");
CREATE UNIQUE INDEX "trust_portal_access_grants_token_uq" ON "trust_portal_access_grants" ("token_sha256");
CREATE INDEX "trust_portal_access_grants_portal_idx" ON "trust_portal_access_grants" ("portal_id", "created_at");
