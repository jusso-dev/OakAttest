import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  jsonb,
  uniqueIndex,
  index,
  boolean,
} from 'drizzle-orm/pg-core';
import { engagements } from './engagements';
import { tenants } from './tenants';
import { users } from './auth';

// Versioned system boundary graph (§9.3). One row per boundary version per
// engagement. The active boundary is the latest non-superseded row; the
// engagement's `boundary_locked_at` records when the assessor froze a
// version for the assessment.
export const systemBoundaries = pgTable(
  'system_boundaries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => engagements.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    version: integer('version').notNull(),
    // React Flow graph: { nodes: [...], edges: [...] }. Schema validated at
    // the application boundary via Zod (lib/boundary/schema.ts).
    graph: jsonb('graph').notNull().$type<{
      nodes: Array<{
        id: string;
        type: string;
        position: { x: number; y: number };
        data: {
          label: string;
          componentType: string;
          width?: number;
          height?: number;
          environment?: string;
          classification?: string;
          owner?: string;
          notes?: string;
        };
      }>;
      edges: Array<{
        id: string;
        source: string;
        target: string;
        sourceHandle?: string;
        targetHandle?: string;
        type?: string;
        label?: string;
        data?: { protocol?: string; encrypted?: boolean };
      }>;
    }>(),
    note: text('note'),
    locked: boolean('locked').notNull().default(false),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    lockedBy: uuid('locked_by').references(() => users.id),
    supersededAt: timestamp('superseded_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('system_boundaries_engagement_version_uq').on(t.engagementId, t.version),
    index('system_boundaries_engagement_idx').on(t.engagementId),
  ],
);

// Change requests after lock. Reviewer sign-off flips status to approved.
export const boundaryChangeRequests = pgTable(
  'boundary_change_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => engagements.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    baseBoundaryId: uuid('base_boundary_id')
      .notNull()
      .references(() => systemBoundaries.id),
    proposedGraph: jsonb('proposed_graph').notNull(),
    rationale: text('rationale').notNull(),
    impactAnalysis: text('impact_analysis'),
    status: text('status').notNull().default('pending'),
    raisedBy: uuid('raised_by').references(() => users.id),
    raisedAt: timestamp('raised_at', { withTimezone: true }).notNull().defaultNow(),
    reviewedBy: uuid('reviewed_by').references(() => users.id),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewNotes: text('review_notes'),
  },
  (t) => [index('boundary_change_requests_engagement_idx').on(t.engagementId)],
);
