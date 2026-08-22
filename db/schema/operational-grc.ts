import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { engagements } from './engagements';
import { tenants } from './tenants';
import { users } from './auth';

export const governancePolicies = pgTable(
  'governance_policies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    policyGroupId: uuid('policy_group_id').notNull(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    engagementId: uuid('engagement_id').notNull().references(() => engagements.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    category: text('category').notNull(),
    version: integer('version').notNull().default(1),
    content: text('content').notNull(),
    status: text('status').notNull().default('draft'),
    ownerUserId: uuid('owner_user_id').references(() => users.id),
    reviewDueAt: timestamp('review_due_at', { withTimezone: true }).notNull(),
    approvedBy: uuid('approved_by').references(() => users.id),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    publishedBy: uuid('published_by').references(() => users.id),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    retiredAt: timestamp('retired_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('governance_policies_group_version_uq').on(table.policyGroupId, table.version),
    index('governance_policies_engagement_idx').on(table.engagementId, table.status),
    index('governance_policies_review_due_idx').on(table.reviewDueAt),
  ],
);

export const policyAttestations = pgTable(
  'policy_attestations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    policyId: uuid('policy_id').notNull().references(() => governancePolicies.id, { onDelete: 'cascade' }),
    policyVersion: integer('policy_version').notNull(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    engagementId: uuid('engagement_id').notNull().references(() => engagements.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id),
    status: text('status').notNull().default('pending'),
    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    acceptanceSha256: text('acceptance_sha256'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('policy_attestations_policy_user_uq').on(table.policyId, table.userId),
    index('policy_attestations_user_status_idx').on(table.userId, table.status),
    index('policy_attestations_engagement_due_idx').on(table.engagementId, table.dueAt),
  ],
);

export const personnelAssuranceRecords = pgTable(
  'personnel_assurance_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    engagementId: uuid('engagement_id').notNull().references(() => engagements.id, { onDelete: 'cascade' }),
    personName: text('person_name').notNull(),
    personEmail: text('person_email').notNull(),
    roleTitle: text('role_title'),
    employmentStatus: text('employment_status').notNull().default('onboarding'),
    screeningStatus: text('screening_status').notNull().default('pending'),
    screeningExpiresAt: timestamp('screening_expires_at', { withTimezone: true }),
    trainingDueAt: timestamp('training_due_at', { withTimezone: true }),
    trainingCompletedAt: timestamp('training_completed_at', { withTimezone: true }),
    offboardingDueAt: timestamp('offboarding_due_at', { withTimezone: true }),
    offboardingCompletedAt: timestamp('offboarding_completed_at', { withTimezone: true }),
    ownerUserId: uuid('owner_user_id').references(() => users.id),
    notes: text('notes'),
    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('personnel_assurance_engagement_email_uq').on(table.engagementId, table.personEmail),
    index('personnel_assurance_status_idx').on(table.engagementId, table.employmentStatus),
    index('personnel_assurance_training_due_idx').on(table.trainingDueAt),
  ],
);

export const accessReviewCampaigns = pgTable(
  'access_review_campaigns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    engagementId: uuid('engagement_id').notNull().references(() => engagements.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    scope: text('scope').notNull(),
    status: text('status').notNull().default('draft'),
    ownerUserId: uuid('owner_user_id').references(() => users.id),
    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('access_review_campaigns_engagement_idx').on(table.engagementId, table.status),
    index('access_review_campaigns_due_idx').on(table.dueAt),
  ],
);

export const accessReviewItems = pgTable(
  'access_review_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id').notNull().references(() => accessReviewCampaigns.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    engagementId: uuid('engagement_id').notNull().references(() => engagements.id, { onDelete: 'cascade' }),
    subjectName: text('subject_name').notNull(),
    subjectEmail: text('subject_email'),
    systemName: text('system_name').notNull(),
    accessLevel: text('access_level').notNull(),
    reviewerUserId: uuid('reviewer_user_id').references(() => users.id),
    decision: text('decision').notNull().default('pending'),
    rationale: text('rationale'),
    remediationStatus: text('remediation_status').notNull().default('none'),
    decidedBy: uuid('decided_by').references(() => users.id),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('access_review_items_campaign_idx').on(table.campaignId, table.decision),
    index('access_review_items_reviewer_idx').on(table.reviewerUserId),
  ],
);

export const vendorRiskRecords = pgTable(
  'vendor_risk_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    engagementId: uuid('engagement_id').notNull().references(() => engagements.id, { onDelete: 'cascade' }),
    vendorName: text('vendor_name').notNull(),
    serviceDescription: text('service_description').notNull(),
    criticality: text('criticality').notNull(),
    status: text('status').notNull().default('intake'),
    inherentRisk: text('inherent_risk').notNull().default('medium'),
    residualRisk: text('residual_risk'),
    dataHandled: text('data_handled'),
    dueDiligenceSummary: text('due_diligence_summary'),
    ownerUserId: uuid('owner_user_id').references(() => users.id),
    contractExpiresAt: timestamp('contract_expires_at', { withTimezone: true }),
    nextReviewAt: timestamp('next_review_at', { withTimezone: true }),
    lastAssessedAt: timestamp('last_assessed_at', { withTimezone: true }),
    riskAcceptanceStatement: text('risk_acceptance_statement'),
    riskAcceptedBy: uuid('risk_accepted_by').references(() => users.id),
    riskAcceptedAt: timestamp('risk_accepted_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('vendor_risk_records_engagement_name_uq').on(table.engagementId, table.vendorName),
    index('vendor_risk_records_engagement_status_idx').on(table.engagementId, table.status),
    index('vendor_risk_records_review_due_idx').on(table.nextReviewAt),
  ],
);

export type GovernancePolicy = typeof governancePolicies.$inferSelect;
export type PersonnelAssuranceRecord = typeof personnelAssuranceRecords.$inferSelect;
export type AccessReviewCampaign = typeof accessReviewCampaigns.$inferSelect;
export type AccessReviewItem = typeof accessReviewItems.$inferSelect;
export type VendorRiskRecord = typeof vendorRiskRecords.$inferSelect;
