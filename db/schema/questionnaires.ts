import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { classificationEnum } from './enums';
import { engagements } from './engagements';
import { evidenceItems } from './evidence';
import { tenants } from './tenants';
import { users } from './auth';

export const questionnaires = pgTable(
  'questionnaires',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => engagements.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    sourceFilename: text('source_filename').notNull(),
    sourceFormat: text('source_format').notNull(),
    sourceSha256: text('source_sha256').notNull(),
    dataClassification: classificationEnum('data_classification').notNull(),
    status: text('status').notNull().default('draft'),
    dueAt: timestamp('due_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id),
    finalisedBy: uuid('finalised_by').references(() => users.id),
    finalisedAt: timestamp('finalised_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('questionnaires_engagement_idx').on(table.engagementId, table.createdAt),
    index('questionnaires_tenant_status_idx').on(table.tenantId, table.status),
  ],
);

export const questionnaireQuestions = pgTable(
  'questionnaire_questions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    questionnaireId: uuid('questionnaire_id')
      .notNull()
      .references(() => questionnaires.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => engagements.id, { onDelete: 'cascade' }),
    externalRef: text('external_ref'),
    section: text('section'),
    prompt: text('prompt').notNull(),
    sortOrder: integer('sort_order').notNull(),
    assignedToUserId: uuid('assigned_to_user_id').references(() => users.id),
    assignedBy: uuid('assigned_by').references(() => users.id),
    assignedAt: timestamp('assigned_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('questionnaire_questions_order_uq').on(table.questionnaireId, table.sortOrder),
    index('questionnaire_questions_assignment_idx').on(table.assignedToUserId),
    index('questionnaire_questions_engagement_idx').on(table.engagementId),
  ],
);

export const questionnaireAnswers = pgTable(
  'questionnaire_answers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    questionId: uuid('question_id')
      .notNull()
      .references(() => questionnaireQuestions.id, { onDelete: 'cascade' }),
    questionnaireId: uuid('questionnaire_id')
      .notNull()
      .references(() => questionnaires.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => engagements.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    answerText: text('answer_text').notNull(),
    status: text('status').notNull().default('draft'),
    generationSource: text('generation_source').notNull().default('human'),
    generatorModelId: text('generator_model_id'),
    createdBy: uuid('created_by').references(() => users.id),
    submittedBy: uuid('submitted_by').references(() => users.id),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    reviewedBy: uuid('reviewed_by').references(() => users.id),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewerNotes: text('reviewer_notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('questionnaire_answers_question_version_uq').on(table.questionId, table.version),
    index('questionnaire_answers_question_idx').on(table.questionId, table.version),
    index('questionnaire_answers_review_idx').on(table.engagementId, table.status),
  ],
);

export const questionnaireAnswerCitations = pgTable(
  'questionnaire_answer_citations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    answerId: uuid('answer_id')
      .notNull()
      .references(() => questionnaireAnswers.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => engagements.id, { onDelete: 'cascade' }),
    evidenceItemId: uuid('evidence_item_id')
      .notNull()
      .references(() => evidenceItems.id),
    chunkIndex: integer('chunk_index'),
    filenameSnapshot: text('filename_snapshot').notNull(),
    sourceSha256: text('source_sha256').notNull(),
    excerpt: text('excerpt'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('questionnaire_answer_citations_answer_idx').on(table.answerId),
    index('questionnaire_answer_citations_evidence_idx').on(table.evidenceItemId),
  ],
);

export type Questionnaire = typeof questionnaires.$inferSelect;
export type QuestionnaireQuestion = typeof questionnaireQuestions.$inferSelect;
export type QuestionnaireAnswer = typeof questionnaireAnswers.$inferSelect;
