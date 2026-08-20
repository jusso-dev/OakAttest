import {
  index,
  bigint,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { engagements } from './engagements';
import { tenants } from './tenants';
import { users } from './auth';
import { evidenceItems } from './evidence';

export const auditReadinessProfiles = pgTable(
  'audit_readiness_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => engagements.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    auditType: text('audit_type').notNull(),
    status: text('status').notNull().default('planning'),
    auditFirm: text('audit_firm'),
    leadAuditor: text('lead_auditor'),
    scopeStatement: text('scope_statement').notNull(),
    trustServiceCategories: jsonb('trust_service_categories')
      .$type<string[]>()
      .notNull()
      .default([]),
    periodStart: timestamp('period_start', { withTimezone: true }),
    periodEnd: timestamp('period_end', { withTimezone: true }),
    targetAuditAt: timestamp('target_audit_at', { withTimezone: true }).notNull(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('audit_readiness_profiles_engagement_uq').on(t.engagementId),
    index('audit_readiness_profiles_tenant_idx').on(t.tenantId),
  ],
);

export const auditReadinessRequirements = pgTable(
  'audit_readiness_requirements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => auditReadinessProfiles.id, { onDelete: 'cascade' }),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => engagements.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    auditType: text('audit_type').notNull(),
    requirementKey: text('requirement_key').notNull(),
    category: text('category').notNull(),
    title: text('title').notNull(),
    guidance: text('guidance').notNull(),
    status: text('status').notNull().default('not_started'),
    notes: text('notes'),
    ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
    dueAt: timestamp('due_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('audit_readiness_requirements_profile_key_uq').on(
      t.profileId,
      t.auditType,
      t.requirementKey,
    ),
    index('audit_readiness_requirements_engagement_idx').on(t.engagementId, t.auditType),
    index('audit_readiness_requirements_owner_idx').on(t.ownerUserId),
  ],
);

export const auditEvidencePackages = pgTable(
  'audit_evidence_packages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => auditReadinessProfiles.id, { onDelete: 'restrict' }),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => engagements.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    auditType: text('audit_type').notNull(),
    storageKey: text('storage_key').notNull(),
    storageBucket: text('storage_bucket').notNull(),
    bundleSha256: text('bundle_sha256').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    manifest: jsonb('manifest').notNull(),
    generatedBy: uuid('generated_by').references(() => users.id, { onDelete: 'set null' }),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('audit_evidence_packages_engagement_version_uq').on(
      t.engagementId,
      t.version,
    ),
    index('audit_evidence_packages_tenant_idx').on(t.tenantId),
  ],
);

export const auditReadinessRequirementEvidence = pgTable(
  'audit_readiness_requirement_evidence',
  {
    requirementId: uuid('requirement_id')
      .notNull()
      .references(() => auditReadinessRequirements.id, { onDelete: 'cascade' }),
    evidenceItemId: uuid('evidence_item_id')
      .notNull()
      .references(() => evidenceItems.id, { onDelete: 'cascade' }),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => engagements.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    linkedBy: uuid('linked_by').references(() => users.id, { onDelete: 'set null' }),
    linkedAt: timestamp('linked_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.requirementId, t.evidenceItemId] }),
    index('audit_readiness_requirement_evidence_engagement_idx').on(t.engagementId),
  ],
);

export type AuditReadinessProfile = typeof auditReadinessProfiles.$inferSelect;
export type AuditReadinessRequirement = typeof auditReadinessRequirements.$inferSelect;
export type AuditEvidencePackage = typeof auditEvidencePackages.$inferSelect;
