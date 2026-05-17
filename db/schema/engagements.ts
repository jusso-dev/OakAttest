import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import {
  classificationEnum,
  engagementPhaseEnum,
  engagementStatusEnum,
} from './enums';
import { tenants } from './tenants';
import { users } from './auth';

// One client organisation being assessed against one system. Engagements are
// the unit of work; almost every other domain row carries `engagement_id`.
export const engagements = pgTable(
  'engagements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    reference: text('reference'),
    classification: classificationEnum('classification').notNull(),
    classificationRank: integer('classification_rank').notNull(),
    status: engagementStatusEnum('status').notNull().default('draft'),
    phase: engagementPhaseEnum('phase').notNull().default('scoping'),
    assessmentType: text('assessment_type').notNull().default('standard'),
    cloudProvider: text('cloud_provider').notNull().default('none'),
    // ISM revision the engagement is pinned to. New revisions surface a
    // banner with a compare/migrate action (section 8).
    ismRevision: text('ism_revision').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    targetCertificationAt: timestamp('target_certification_at', { withTimezone: true }),
    certifiedAt: timestamp('certified_at', { withTimezone: true }),
    boundaryLockedAt: timestamp('boundary_locked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('engagements_tenant_idx').on(t.tenantId),
    index('engagements_status_idx').on(t.status),
  ],
);

// The client organisation. One per engagement (section 7). Held separately so
// we keep it out of `tenants` (tenant = assessor firm, not client).
export const clientOrganisations = pgTable(
  'client_organisations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => engagements.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    name: text('name').notNull(),
    abn: text('abn'),
    primaryContactName: text('primary_contact_name'),
    primaryContactEmail: text('primary_contact_email'),
    address: text('address'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('client_org_engagement_uq').on(t.engagementId)],
);

// The system under assessment. One per engagement. Boundary nodes live in
// `system_boundaries` which is milestone-2 work.
export const systems = pgTable(
  'systems',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => engagements.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    name: text('name').notNull(),
    description: text('description'),
    environment: text('environment'),
    classification: classificationEnum('classification').notNull(),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('systems_engagement_uq').on(t.engagementId)],
);

// Lightweight log of the boundary lock history. Full boundary builder
// (section 9.3) lands in milestone 2; this table tracks the audit-relevant
// lock/unlock events.
export const boundaryLockEvents = pgTable(
  'boundary_lock_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => engagements.id, { onDelete: 'cascade' }),
    actorUserId: uuid('actor_user_id').references(() => users.id),
    action: text('action').notNull(),
    reason: text('reason'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('boundary_lock_events_engagement_idx').on(t.engagementId)],
);
