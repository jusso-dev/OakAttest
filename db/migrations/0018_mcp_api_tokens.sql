CREATE TABLE "mcp_api_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"token_prefix" text NOT NULL,
	"token_hash" text NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mcp_api_tokens_hash_uq" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "mcp_api_tokens" ADD CONSTRAINT "mcp_api_tokens_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "mcp_api_tokens" ADD CONSTRAINT "mcp_api_tokens_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "mcp_api_tokens" ADD CONSTRAINT "mcp_api_tokens_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "mcp_api_tokens_tenant_idx" ON "mcp_api_tokens" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX "mcp_api_tokens_actor_idx" ON "mcp_api_tokens" USING btree ("actor_user_id");
--> statement-breakpoint
CREATE INDEX "mcp_api_tokens_expiry_idx" ON "mcp_api_tokens" USING btree ("expires_at");
