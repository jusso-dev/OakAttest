ALTER TABLE "verification_tokens" ALTER COLUMN "purpose" SET DEFAULT 'better-auth';

ALTER TABLE "passkeys" ADD COLUMN IF NOT EXISTS "aaguid" text;

CREATE UNIQUE INDEX "audit_log_mcp_fingerprint_uq"
  ON "audit_log" ("resource_id")
  WHERE "action" = 'mcp.tool.call' AND "resource_id" LIKE 'fp:%';
