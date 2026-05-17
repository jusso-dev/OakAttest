ALTER TABLE "sessions" ALTER COLUMN "absolute_expires_at" SET DEFAULT now() + interval '12 hours';--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
