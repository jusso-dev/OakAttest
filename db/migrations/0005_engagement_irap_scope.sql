ALTER TABLE "engagements" ADD COLUMN "assessment_type" text DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE "engagements" ADD COLUMN "cloud_provider" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "engagement_controls" ADD COLUMN "assessment_methods" text;--> statement-breakpoint
ALTER TABLE "engagement_controls" ADD COLUMN "assessment_objects" text;--> statement-breakpoint
ALTER TABLE "engagement_controls" ADD COLUMN "evidence_quality" text;--> statement-breakpoint
ALTER TABLE "engagement_controls" ADD COLUMN "evidence_limitations" text;
