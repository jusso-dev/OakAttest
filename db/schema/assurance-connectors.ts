import {
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { engagements } from './engagements';
import { evidenceItems } from './evidence';
import { frameworkControls } from './frameworks';
import { tenants } from './tenants';
import { users } from './auth';
import type { AssuranceConnectorConfig, AssuranceObservation } from '@/lib/connectors/types';

export const assuranceConnectors = pgTable(
  'assurance_connectors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    engagementId: uuid('engagement_id').notNull().references(() => engagements.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    name: text('name').notNull(),
    status: text('status').notNull().default('draft'),
    configuration: jsonb('configuration').$type<AssuranceConnectorConfig>().notNull(),
    scheduleMinutes: integer('schedule_minutes').notNull().default(1440),
    lastConnectionTestAt: timestamp('last_connection_test_at', { withTimezone: true }),
    lastRunAt: timestamp('last_run_at', { withTimezone: true }),
    nextRunAt: timestamp('next_run_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('assurance_connectors_engagement_name_uq').on(table.engagementId, table.name),
    index('assurance_connectors_tenant_idx').on(table.tenantId),
    index('assurance_connectors_due_idx').on(table.status, table.nextRunAt),
  ],
);

export const assuranceTestRuns = pgTable(
  'assurance_test_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    engagementId: uuid('engagement_id').notNull().references(() => engagements.id, { onDelete: 'cascade' }),
    connectorId: uuid('connector_id').notNull().references(() => assuranceConnectors.id, { onDelete: 'cascade' }),
    trigger: text('trigger').notNull(),
    status: text('status').notNull().default('running'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    summary: jsonb('summary').$type<{ passed: number; failed: number; errors: number; unknown: number }>(),
    error: text('error'),
    requestedBy: uuid('requested_by').references(() => users.id),
  },
  (table) => [
    index('assurance_test_runs_connector_idx').on(table.connectorId, table.startedAt),
    index('assurance_test_runs_engagement_idx').on(table.engagementId, table.startedAt),
  ],
);

export const assuranceTestResults = pgTable(
  'assurance_test_results',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    engagementId: uuid('engagement_id').notNull().references(() => engagements.id, { onDelete: 'cascade' }),
    connectorId: uuid('connector_id').notNull().references(() => assuranceConnectors.id, { onDelete: 'cascade' }),
    runId: uuid('run_id').notNull().references(() => assuranceTestRuns.id, { onDelete: 'cascade' }),
    testKey: text('test_key').notNull(),
    title: text('title').notNull(),
    outcome: text('outcome').notNull(),
    observation: text('observation').notNull(),
    observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
    evidence: jsonb('evidence').$type<AssuranceObservation['evidence']>().notNull(),
    evidenceSha256: text('evidence_sha256').notNull(),
    reviewStatus: text('review_status').notNull().default('pending'),
    reviewNotes: text('review_notes'),
    reviewedBy: uuid('reviewed_by').references(() => users.id),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('assurance_test_results_run_key_uq').on(table.runId, table.testKey),
    index('assurance_test_results_connector_idx').on(table.connectorId, table.createdAt),
    index('assurance_test_results_outcome_idx').on(table.outcome),
    index('assurance_test_results_review_idx').on(table.reviewStatus),
  ],
);

export const assuranceTestResultControls = pgTable(
  'assurance_test_result_controls',
  {
    resultId: uuid('result_id').notNull().references(() => assuranceTestResults.id, { onDelete: 'cascade' }),
    frameworkControlId: uuid('framework_control_id').notNull().references(() => frameworkControls.id),
  },
  (table) => [primaryKey({ columns: [table.resultId, table.frameworkControlId] })],
);

export const assuranceTestControlMappings = pgTable(
  'assurance_test_control_mappings',
  {
    connectorId: uuid('connector_id').notNull().references(() => assuranceConnectors.id, { onDelete: 'cascade' }),
    testKey: text('test_key').notNull(),
    frameworkControlId: uuid('framework_control_id').notNull().references(() => frameworkControls.id),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.connectorId, table.testKey, table.frameworkControlId] }),
    index('assurance_test_control_mappings_control_idx').on(table.frameworkControlId),
  ],
);

export const commonControlMappings = pgTable(
  'common_control_mappings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    sourceFrameworkControlId: uuid('source_framework_control_id').notNull().references(() => frameworkControls.id),
    targetFrameworkControlId: uuid('target_framework_control_id').notNull().references(() => frameworkControls.id),
    relation: text('relation').notNull().default('supporting'),
    rationale: text('rationale').notNull(),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('common_control_mappings_pair_uq').on(
      table.tenantId,
      table.sourceFrameworkControlId,
      table.targetFrameworkControlId,
    ),
    index('common_control_mappings_source_idx').on(table.tenantId, table.sourceFrameworkControlId),
    index('common_control_mappings_target_idx').on(table.tenantId, table.targetFrameworkControlId),
  ],
);

export const evidenceReuseLinks = pgTable(
  'evidence_reuse_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    sourceEngagementId: uuid('source_engagement_id').notNull().references(() => engagements.id, { onDelete: 'cascade' }),
    targetEngagementId: uuid('target_engagement_id').notNull().references(() => engagements.id, { onDelete: 'cascade' }),
    sourceEvidenceItemId: uuid('source_evidence_item_id').notNull().references(() => evidenceItems.id),
    targetFrameworkControlId: uuid('target_framework_control_id').notNull().references(() => frameworkControls.id),
    commonControlMappingId: uuid('common_control_mapping_id').references(() => commonControlMappings.id),
    status: text('status').notNull().default('proposed'),
    rationale: text('rationale').notNull(),
    validUntil: timestamp('valid_until', { withTimezone: true }).notNull(),
    proposedBy: uuid('proposed_by').references(() => users.id),
    decidedBy: uuid('decided_by').references(() => users.id),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decisionNotes: text('decision_notes'),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedBy: uuid('revoked_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('evidence_reuse_links_active_uq')
      .on(table.targetEngagementId, table.sourceEvidenceItemId, table.targetFrameworkControlId)
      .where(sql`${table.status} in ('proposed', 'approved')`),
    index('evidence_reuse_links_target_idx').on(table.targetEngagementId, table.status),
    index('evidence_reuse_links_source_idx').on(table.sourceEngagementId),
  ],
);
