ALTER TABLE "evidence_items" ADD COLUMN "data_classification" "classification" DEFAULT 'OFFICIAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "evidence_items" ADD COLUMN "rag_status" text DEFAULT 'not_indexed' NOT NULL;--> statement-breakpoint
ALTER TABLE "evidence_items" ADD COLUMN "rag_error" text;--> statement-breakpoint
ALTER TABLE "evidence_items" ADD COLUMN "rag_indexed_at" timestamp with time zone;--> statement-breakpoint

CREATE TABLE "evidence_document_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"evidence_item_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "evidence_document_chunks" ADD CONSTRAINT "evidence_document_chunks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_document_chunks" ADD CONSTRAINT "evidence_document_chunks_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_document_chunks" ADD CONSTRAINT "evidence_document_chunks_evidence_item_id_evidence_items_id_fk" FOREIGN KEY ("evidence_item_id") REFERENCES "public"."evidence_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "evidence_document_chunks_item_chunk_uq" ON "evidence_document_chunks" USING btree ("evidence_item_id", "chunk_index");--> statement-breakpoint
CREATE INDEX "evidence_document_chunks_engagement_idx" ON "evidence_document_chunks" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "evidence_document_chunks_search_idx" ON "evidence_document_chunks" USING gin (to_tsvector('english', "content"));
