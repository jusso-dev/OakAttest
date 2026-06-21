-- Phase 4: client-imported frameworks (SOC 2, ISO 27001). Their control text is
-- licensed to the client, so OakAttest stores it tenant-scoped (never global).
-- Adds tenant_id to the catalogue tables and splits the unique constraints into
-- global (tenant_id IS NULL) and tenant-scoped (tenant_id IS NOT NULL) partials.

ALTER TABLE "framework_controls" ADD COLUMN "tenant_id" uuid;
--> statement-breakpoint
ALTER TABLE "framework_controls" ADD CONSTRAINT "framework_controls_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
DROP INDEX "framework_controls_fw_control_revision_uq";
--> statement-breakpoint
CREATE UNIQUE INDEX "framework_controls_global_uq" ON "framework_controls" USING btree ("framework_id","control_id","revision") WHERE "framework_controls"."tenant_id" is null;
--> statement-breakpoint
CREATE UNIQUE INDEX "framework_controls_tenant_uq" ON "framework_controls" USING btree ("framework_id","tenant_id","control_id","revision") WHERE "framework_controls"."tenant_id" is not null;
--> statement-breakpoint
CREATE INDEX "framework_controls_tenant_idx" ON "framework_controls" USING btree ("tenant_id");
--> statement-breakpoint

ALTER TABLE "framework_imports" ADD COLUMN "tenant_id" uuid;
--> statement-breakpoint
ALTER TABLE "framework_imports" ADD CONSTRAINT "framework_imports_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
DROP INDEX "framework_imports_fw_revision_sha_uq";
--> statement-breakpoint
CREATE UNIQUE INDEX "framework_imports_global_uq" ON "framework_imports" USING btree ("framework_id","revision","source_sha256") WHERE "framework_imports"."tenant_id" is null;
--> statement-breakpoint
CREATE UNIQUE INDEX "framework_imports_tenant_uq" ON "framework_imports" USING btree ("framework_id","tenant_id","revision","source_sha256") WHERE "framework_imports"."tenant_id" is not null;
--> statement-breakpoint
CREATE INDEX "framework_imports_tenant_idx" ON "framework_imports" USING btree ("tenant_id");
