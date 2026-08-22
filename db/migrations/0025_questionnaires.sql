CREATE TABLE "questionnaires" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "engagement_id" uuid NOT NULL,
  "title" text NOT NULL,
  "source_filename" text NOT NULL,
  "source_format" text NOT NULL,
  "source_sha256" text NOT NULL,
  "data_classification" "classification" NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "due_at" timestamp with time zone,
  "created_by" uuid,
  "finalised_by" uuid,
  "finalised_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "questionnaires_source_format_check" CHECK ("source_format" IN ('csv', 'xlsx', 'docx', 'pdf')),
  CONSTRAINT "questionnaires_status_check" CHECK ("status" IN ('draft', 'in_progress', 'in_review', 'finalised'))
);

CREATE TABLE "questionnaire_questions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "questionnaire_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "engagement_id" uuid NOT NULL,
  "external_ref" text,
  "section" text,
  "prompt" text NOT NULL,
  "sort_order" integer NOT NULL,
  "assigned_to_user_id" uuid,
  "assigned_by" uuid,
  "assigned_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "questionnaire_questions_order_check" CHECK ("sort_order" >= 0)
);

CREATE TABLE "questionnaire_answers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "question_id" uuid NOT NULL,
  "questionnaire_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "engagement_id" uuid NOT NULL,
  "version" integer NOT NULL,
  "answer_text" text NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "generation_source" text DEFAULT 'human' NOT NULL,
  "generator_model_id" text,
  "created_by" uuid,
  "submitted_by" uuid,
  "submitted_at" timestamp with time zone,
  "reviewed_by" uuid,
  "reviewed_at" timestamp with time zone,
  "reviewer_notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "questionnaire_answers_version_check" CHECK ("version" > 0),
  CONSTRAINT "questionnaire_answers_status_check" CHECK ("status" IN ('draft', 'submitted', 'approved', 'changes_requested')),
  CONSTRAINT "questionnaire_answers_source_check" CHECK ("generation_source" IN ('human', 'burl'))
);

CREATE TABLE "questionnaire_answer_citations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "answer_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "engagement_id" uuid NOT NULL,
  "evidence_item_id" uuid NOT NULL,
  "chunk_index" integer,
  "filename_snapshot" text NOT NULL,
  "source_sha256" text NOT NULL,
  "excerpt" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "questionnaire_answer_citations_chunk_check" CHECK ("chunk_index" IS NULL OR "chunk_index" >= 0)
);

ALTER TABLE "questionnaires" ADD CONSTRAINT "questionnaires_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");
ALTER TABLE "questionnaires" ADD CONSTRAINT "questionnaires_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade;
ALTER TABLE "questionnaires" ADD CONSTRAINT "questionnaires_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id");
ALTER TABLE "questionnaires" ADD CONSTRAINT "questionnaires_finalised_by_user_id_fk" FOREIGN KEY ("finalised_by") REFERENCES "public"."user"("id");

ALTER TABLE "questionnaire_questions" ADD CONSTRAINT "questionnaire_questions_questionnaire_id_questionnaires_id_fk" FOREIGN KEY ("questionnaire_id") REFERENCES "public"."questionnaires"("id") ON DELETE cascade;
ALTER TABLE "questionnaire_questions" ADD CONSTRAINT "questionnaire_questions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");
ALTER TABLE "questionnaire_questions" ADD CONSTRAINT "questionnaire_questions_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade;
ALTER TABLE "questionnaire_questions" ADD CONSTRAINT "questionnaire_questions_assigned_to_user_id_user_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."user"("id");
ALTER TABLE "questionnaire_questions" ADD CONSTRAINT "questionnaire_questions_assigned_by_user_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."user"("id");

ALTER TABLE "questionnaire_answers" ADD CONSTRAINT "questionnaire_answers_question_id_questionnaire_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questionnaire_questions"("id") ON DELETE cascade;
ALTER TABLE "questionnaire_answers" ADD CONSTRAINT "questionnaire_answers_questionnaire_id_questionnaires_id_fk" FOREIGN KEY ("questionnaire_id") REFERENCES "public"."questionnaires"("id") ON DELETE cascade;
ALTER TABLE "questionnaire_answers" ADD CONSTRAINT "questionnaire_answers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");
ALTER TABLE "questionnaire_answers" ADD CONSTRAINT "questionnaire_answers_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade;
ALTER TABLE "questionnaire_answers" ADD CONSTRAINT "questionnaire_answers_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id");
ALTER TABLE "questionnaire_answers" ADD CONSTRAINT "questionnaire_answers_submitted_by_user_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."user"("id");
ALTER TABLE "questionnaire_answers" ADD CONSTRAINT "questionnaire_answers_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id");

ALTER TABLE "questionnaire_answer_citations" ADD CONSTRAINT "questionnaire_answer_citations_answer_id_questionnaire_answers_id_fk" FOREIGN KEY ("answer_id") REFERENCES "public"."questionnaire_answers"("id") ON DELETE cascade;
ALTER TABLE "questionnaire_answer_citations" ADD CONSTRAINT "questionnaire_answer_citations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");
ALTER TABLE "questionnaire_answer_citations" ADD CONSTRAINT "questionnaire_answer_citations_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade;
ALTER TABLE "questionnaire_answer_citations" ADD CONSTRAINT "questionnaire_answer_citations_evidence_item_id_evidence_items_id_fk" FOREIGN KEY ("evidence_item_id") REFERENCES "public"."evidence_items"("id");

CREATE INDEX "questionnaires_engagement_idx" ON "questionnaires" ("engagement_id", "created_at");
CREATE INDEX "questionnaires_tenant_status_idx" ON "questionnaires" ("tenant_id", "status");
CREATE UNIQUE INDEX "questionnaire_questions_order_uq" ON "questionnaire_questions" ("questionnaire_id", "sort_order");
CREATE INDEX "questionnaire_questions_assignment_idx" ON "questionnaire_questions" ("assigned_to_user_id");
CREATE INDEX "questionnaire_questions_engagement_idx" ON "questionnaire_questions" ("engagement_id");
CREATE UNIQUE INDEX "questionnaire_answers_question_version_uq" ON "questionnaire_answers" ("question_id", "version");
CREATE INDEX "questionnaire_answers_question_idx" ON "questionnaire_answers" ("question_id", "version");
CREATE INDEX "questionnaire_answers_review_idx" ON "questionnaire_answers" ("engagement_id", "status");
CREATE INDEX "questionnaire_answer_citations_answer_idx" ON "questionnaire_answer_citations" ("answer_id");
CREATE INDEX "questionnaire_answer_citations_evidence_idx" ON "questionnaire_answer_citations" ("evidence_item_id");
