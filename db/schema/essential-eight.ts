import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  uniqueIndex,
  index,
  integer,
  primaryKey,
} from 'drizzle-orm/pg-core';
import {
  essentialEightStrategyEnum,
  maturityLevelEnum,
} from './enums';
import { engagements } from './engagements';
import { tenants } from './tenants';
import { users } from './auth';
import { evidenceItems } from './evidence';

// One row per (engagement, strategy). Captures current and target maturity
// and pointers to the evidence references that justify the assessment.
export const essentialEightAssessments = pgTable(
  'essential_eight_assessments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => engagements.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    strategy: essentialEightStrategyEnum('strategy').notNull(),
    currentMaturity: maturityLevelEnum('current_maturity').notNull().default('ml0'),
    targetMaturity: maturityLevelEnum('target_maturity').notNull().default('ml1'),
    // Array of evidence_item ids. Stored as JSONB (rather than a join table)
    // because the maturity scorecard renders a stable list per strategy and
    // the relationship is engagement-local.
    evidenceRefs: jsonb('evidence_refs').$type<string[]>(),
    remediationPlan: text('remediation_plan'),
    assessmentMethods: text('assessment_methods'),
    assessmentObjects: text('assessment_objects'),
    sampleSize: text('sample_size'),
    evidenceQuality: text('evidence_quality'),
    evidenceLimitations: text('evidence_limitations'),
    assessorConclusion: text('assessor_conclusion'),
    criteriaResults: jsonb('criteria_results').$type<
      Array<{
        criterionId: string;
        maturity: 'ml1' | 'ml2' | 'ml3';
        status: 'not_assessed' | 'met' | 'partially_met' | 'not_met' | 'not_applicable';
        notes?: string;
        evidenceRefs?: string[];
      }>
    >(),
    exceptions: jsonb('exceptions').$type<
      Array<{
        scope?: string;
        justification?: string;
        owner?: string;
        compensatingControls?: string;
        conclusion?: string;
      }>
    >(),
    assessedBy: uuid('assessed_by').references(() => users.id),
    assessedAt: timestamp('assessed_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('e8_engagement_strategy_uq').on(t.engagementId, t.strategy),
    index('e8_engagement_idx').on(t.engagementId),
  ],
);

export const essentialEightProfiles = pgTable(
  'essential_eight_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => engagements.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    targetMaturity: maturityLevelEnum('target_maturity').notNull().default('ml1'),
    scope: text('scope'),
    approach: text('approach'),
    limitations: text('limitations'),
    updatedBy: uuid('updated_by').references(() => users.id),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('e8_profiles_engagement_uq').on(t.engagementId)],
);

export const essentialEightEvidence = pgTable(
  'essential_eight_evidence',
  {
    assessmentId: uuid('assessment_id')
      .notNull()
      .references(() => essentialEightAssessments.id, { onDelete: 'cascade' }),
    evidenceItemId: uuid('evidence_item_id')
      .notNull()
      .references(() => evidenceItems.id, { onDelete: 'cascade' }),
    quality: text('quality'),
    notes: text('notes'),
    linkedBy: uuid('linked_by').references(() => users.id),
    linkedAt: timestamp('linked_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.assessmentId, t.evidenceItemId] })],
);

export const essentialEightReports = pgTable(
  'essential_eight_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => engagements.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    version: integer('version').notNull(),
    snapshot: jsonb('snapshot').notNull(),
    storageKey: text('storage_key').notNull(),
    storageBucket: text('storage_bucket').notNull(),
    sha256: text('sha256').notNull(),
    generatedBy: uuid('generated_by').references(() => users.id),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('e8_reports_engagement_version_uq').on(t.engagementId, t.version),
    index('e8_reports_engagement_idx').on(t.engagementId),
  ],
);

// History of maturity changes for the trend chart (§9.6 "charts showing
// posture over time").
export const essentialEightHistory = pgTable(
  'essential_eight_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => engagements.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    strategy: essentialEightStrategyEnum('strategy').notNull(),
    maturity: maturityLevelEnum('maturity').notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
    recordedBy: uuid('recorded_by').references(() => users.id),
  },
  (t) => [index('e8_history_engagement_idx').on(t.engagementId, t.recordedAt)],
);
