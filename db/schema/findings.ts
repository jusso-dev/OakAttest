import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  index,
  primaryKey,
  jsonb,
} from 'drizzle-orm/pg-core';
import {
  findingTypeEnum,
  findingSeverityEnum,
  findingStatusEnum,
  remediationActionStatusEnum,
} from './enums';
import { engagements } from './engagements';
import { tenants } from './tenants';
import { users } from './auth';
import { ismControls } from './ism';
import { evidenceItems } from './evidence';

// Findings register (§9.10). Non-conformance blocks certification;
// observation does not. The reverse mapping from controls and evidence
// lives in `finding_controls` and `finding_evidence`.
export const findings = pgTable(
  'findings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => engagements.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    // Auto-numbered per engagement for easy reference in reports
    // (FND-001, FND-002, ...). Set via a select max+1 inside the create
    // transaction so concurrent inserts cannot collide.
    sequence: integer('sequence').notNull(),
    code: text('code').notNull(),
    type: findingTypeEnum('type').notNull(),
    severity: findingSeverityEnum('severity').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    // The recommendation is captured here for completeness (it is what the
    // assessor noted), but it is NOT surfaced to the client in remediation
    // advice form. The independence guard keeps it informational only on
    // the assessor side; clients see their own `remediation_actions`.
    recommendation: text('recommendation'),
    status: findingStatusEnum('status').notNull().default('open'),
    reportedBy: uuid('reported_by').references(() => users.id),
    reportedAt: timestamp('reported_at', { withTimezone: true }).notNull().defaultNow(),
    signedOffBy: uuid('signed_off_by').references(() => users.id),
    signedOffAt: timestamp('signed_off_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('findings_engagement_idx').on(t.engagementId),
    index('findings_status_idx').on(t.status),
    index('findings_severity_idx').on(t.severity),
  ],
);

export const findingControls = pgTable(
  'finding_controls',
  {
    findingId: uuid('finding_id')
      .notNull()
      .references(() => findings.id, { onDelete: 'cascade' }),
    ismControlId: uuid('ism_control_id').notNull().references(() => ismControls.id),
  },
  (t) => [primaryKey({ columns: [t.findingId, t.ismControlId] })],
);

export const findingEvidence = pgTable(
  'finding_evidence',
  {
    findingId: uuid('finding_id')
      .notNull()
      .references(() => findings.id, { onDelete: 'cascade' }),
    evidenceItemId: uuid('evidence_item_id')
      .notNull()
      .references(() => evidenceItems.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.findingId, t.evidenceItemId] })],
);

// Remediation actions are owned by the client. Linked one-to-many off a
// finding. Proof-of-fix is an evidence item.
export const remediationActions = pgTable(
  'remediation_actions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    findingId: uuid('finding_id').notNull().references(() => findings.id, { onDelete: 'cascade' }),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => engagements.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    description: text('description').notNull(),
    ownerName: text('owner_name'),
    ownerEmail: text('owner_email'),
    dueDate: timestamp('due_date', { withTimezone: true }),
    status: remediationActionStatusEnum('status').notNull().default('open'),
    proofEvidenceItemId: uuid('proof_evidence_item_id').references(() => evidenceItems.id),
    notes: text('notes'),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
  },
  (t) => [
    index('remediation_actions_finding_idx').on(t.findingId),
    index('remediation_actions_engagement_idx').on(t.engagementId),
  ],
);

export const findingRetests = pgTable(
  'finding_retests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    findingId: uuid('finding_id').notNull().references(() => findings.id, { onDelete: 'cascade' }),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => engagements.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    method: text('method').notNull(),
    result: text('result').notNull(),
    notes: text('notes'),
    evidenceItemIds: jsonb('evidence_item_ids').$type<string[]>(),
    retestedBy: uuid('retested_by').references(() => users.id),
    retestedAt: timestamp('retested_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('finding_retests_finding_idx').on(t.findingId)],
);

export const findingRiskAcceptances = pgTable(
  'finding_risk_acceptances',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    findingId: uuid('finding_id').notNull().references(() => findings.id, { onDelete: 'cascade' }),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => engagements.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    acceptedByName: text('accepted_by_name').notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }).notNull(),
    rationale: text('rationale').notNull(),
    residualRiskId: uuid('residual_risk_id'),
    recordedBy: uuid('recorded_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('finding_risk_acceptances_finding_idx').on(t.findingId)],
);
