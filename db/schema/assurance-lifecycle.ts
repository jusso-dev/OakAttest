import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { engagements } from './engagements';
import { tenants } from './tenants';
import { users } from './auth';

export const systemRisks = pgTable(
  'system_risks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    engagementId: uuid('engagement_id').notNull().references(() => engagements.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    sequence: integer('sequence').notNull(),
    code: text('code').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    asset: text('asset').notNull(),
    threat: text('threat').notNull(),
    vulnerability: text('vulnerability').notNull(),
    inherentLikelihood: integer('inherent_likelihood').notNull(),
    inherentImpact: integer('inherent_impact').notNull(),
    existingControls: text('existing_controls'),
    residualLikelihood: integer('residual_likelihood').notNull(),
    residualImpact: integer('residual_impact').notNull(),
    ownerName: text('owner_name'),
    ownerEmail: text('owner_email'),
    status: text('status').notNull().default('identified'),
    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('system_risks_engagement_sequence_uq').on(table.engagementId, table.sequence),
    uniqueIndex('system_risks_engagement_code_uq').on(table.engagementId, table.code),
    index('system_risks_engagement_idx').on(table.engagementId),
    index('system_risks_status_idx').on(table.status),
  ],
);

export const riskTreatmentDecisions = pgTable(
  'risk_treatment_decisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    riskId: uuid('risk_id').notNull().references(() => systemRisks.id, { onDelete: 'cascade' }),
    engagementId: uuid('engagement_id').notNull().references(() => engagements.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    decision: text('decision').notNull(),
    rationale: text('rationale').notNull(),
    treatmentPlan: text('treatment_plan'),
    ownerName: text('owner_name'),
    ownerEmail: text('owner_email'),
    dueAt: timestamp('due_at', { withTimezone: true }),
    acceptedByName: text('accepted_by_name'),
    acceptedByRole: text('accepted_by_role'),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    recordedBy: uuid('recorded_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('risk_treatment_decisions_risk_idx').on(table.riskId, table.createdAt),
    index('risk_treatment_decisions_engagement_idx').on(table.engagementId),
  ],
);

export const systemAuthorisations = pgTable(
  'system_authorisations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    engagementId: uuid('engagement_id').notNull().references(() => engagements.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    version: integer('version').notNull(),
    status: text('status').notNull(),
    systemOwnerName: text('system_owner_name').notNull(),
    authorisingOfficerName: text('authorising_officer_name'),
    authorisingOfficerRole: text('authorising_officer_role'),
    decisionStatement: text('decision_statement'),
    conditions: text('conditions'),
    issuedAt: timestamp('issued_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    riskSnapshot: jsonb('risk_snapshot').notNull(),
    decidedBy: uuid('decided_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('system_authorisations_engagement_version_uq').on(table.engagementId, table.version),
    index('system_authorisations_engagement_idx').on(table.engagementId, table.createdAt),
  ],
);

export const continuousMonitoringPlans = pgTable(
  'continuous_monitoring_plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    engagementId: uuid('engagement_id').notNull().references(() => engagements.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    status: text('status').notNull().default('draft'),
    objectives: text('objectives').notNull(),
    cadenceDays: integer('cadence_days').notNull(),
    ownerName: text('owner_name').notNull(),
    ownerEmail: text('owner_email'),
    monitoredSignals: jsonb('monitored_signals').$type<string[]>().notNull().default([]),
    changeTriggers: jsonb('change_triggers').$type<string[]>().notNull().default([]),
    nextReviewAt: timestamp('next_review_at', { withTimezone: true }).notNull(),
    lastReviewedAt: timestamp('last_reviewed_at', { withTimezone: true }),
    updatedBy: uuid('updated_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('continuous_monitoring_plans_engagement_uq').on(table.engagementId),
    index('continuous_monitoring_plans_review_idx').on(table.nextReviewAt),
  ],
);

export const monitoringEvents = pgTable(
  'monitoring_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    engagementId: uuid('engagement_id').notNull().references(() => engagements.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    type: text('type').notNull(),
    severity: text('severity').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    source: text('source'),
    relatedRiskId: uuid('related_risk_id').references(() => systemRisks.id, { onDelete: 'set null' }),
    detectedAt: timestamp('detected_at', { withTimezone: true }).notNull(),
    requiresReassessment: boolean('requires_reassessment').notNull().default(false),
    status: text('status').notNull().default('open'),
    triageNotes: text('triage_notes'),
    createdBy: uuid('created_by').references(() => users.id),
    closedBy: uuid('closed_by').references(() => users.id),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('monitoring_events_engagement_idx').on(table.engagementId, table.detectedAt),
    index('monitoring_events_status_idx').on(table.status),
  ],
);
