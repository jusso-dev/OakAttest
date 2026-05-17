import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import {
  essentialEightStrategyEnum,
  maturityLevelEnum,
} from './enums';
import { engagements } from './engagements';
import { tenants } from './tenants';
import { users } from './auth';

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
    assessedBy: uuid('assessed_by').references(() => users.id),
    assessedAt: timestamp('assessed_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('e8_engagement_strategy_uq').on(t.engagementId, t.strategy),
    index('e8_engagement_idx').on(t.engagementId),
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
