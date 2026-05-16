import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  jsonb,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import {
  classificationEnum,
  engagementControlStatusEnum,
} from './enums';
import { engagements } from './engagements';
import { tenants } from './tenants';
import { users } from './auth';

// The catalogue. One row per (control_id, revision). Older revisions are
// retained so engagements pinned to them keep working (section 8).
export const ismControls = pgTable(
  'ism_controls',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    controlId: text('control_id').notNull(),
    revision: text('revision').notNull(),
    topic: text('topic'),
    section: text('section'),
    description: text('description').notNull(),
    guidance: text('guidance'),
    minClassification: classificationEnum('min_classification').notNull(),
    minClassificationRank: integer('min_classification_rank').notNull(),
    // Essential Eight mapping pulled from OSCAL props. Multiple strategies
    // and maturity levels can apply; stored as JSON to keep the OSCAL shape.
    essentialEightMapping: jsonb('essential_eight_mapping').$type<
      Array<{ strategy: string; maturityLevel?: number }>
    >(),
    // Original OSCAL control kept verbatim so the import is lossless and we
    // can re-render guidance, params, and props without re-fetching.
    oscalRaw: jsonb('oscal_raw').notNull(),
    supersededBy: uuid('superseded_by'),
    importedAt: timestamp('imported_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('ism_controls_control_revision_uq').on(t.controlId, t.revision),
    index('ism_controls_min_rank_idx').on(t.minClassificationRank),
    index('ism_controls_revision_idx').on(t.revision),
  ],
);

// Applicable controls for one engagement. Auto-populated at engagement
// creation using the cumulative inclusion rule:
//   min_classification_rank <= engagement.classification_rank.
// Each row tracks the assessor decision and the per-control narrative.
export const engagementControls = pgTable(
  'engagement_controls',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => engagements.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    ismControlId: uuid('ism_control_id').notNull().references(() => ismControls.id),
    // Denormalised so the worksheet table can render without a join.
    controlId: text('control_id').notNull(),
    revision: text('revision').notNull(),
    status: engagementControlStatusEnum('status').notNull().default('not_started'),
    // Assessor applicability decision plus required justification.
    applicable: text('applicable'),
    applicabilityJustification: text('applicability_justification'),
    // Client-authored implementation statement that becomes the SSP body.
    implementationStatement: text('implementation_statement'),
    assessorNotes: text('assessor_notes'),
    lastReviewedAt: timestamp('last_reviewed_at', { withTimezone: true }),
    lastReviewedBy: uuid('last_reviewed_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('engagement_controls_engagement_control_uq').on(
      t.engagementId,
      t.ismControlId,
    ),
    index('engagement_controls_engagement_idx').on(t.engagementId),
    index('engagement_controls_status_idx').on(t.status),
  ],
);

// Tracks the OSCAL ingestion runs themselves so we can answer "what revision
// is loaded?" and audit each import.
export const ismImports = pgTable(
  'ism_imports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    revision: text('revision').notNull(),
    sourceUrl: text('source_url').notNull(),
    sourceSha256: text('source_sha256').notNull(),
    controlCount: integer('control_count').notNull(),
    triggeredBy: uuid('triggered_by').references(() => users.id),
    completedAt: timestamp('completed_at', { withTimezone: true }).notNull().defaultNow(),
    metadata: jsonb('metadata'),
  },
  (t) => [uniqueIndex('ism_imports_revision_sha_uq').on(t.revision, t.sourceSha256)],
);
