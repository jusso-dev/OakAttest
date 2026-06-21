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
import { sql } from 'drizzle-orm';
import {
  classificationEnum,
  engagementControlStatusEnum,
} from './enums';
import { engagements } from './engagements';
import { tenants } from './tenants';
import { users } from './auth';

// Framework registry. One row per compliance framework OakAttest can assess
// against (ISM, NIST 800-53, FedRAMP, SOC 2, ISO 27001). The catalogue tables
// below reference this so a control always knows which framework it belongs to.
// See docs/frameworks/multi-framework-plan.md §3.1.
export const frameworks = pgTable(
  'frameworks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Stable key used by licensing (FRAMEWORK_FEATURE) and engagement creation:
    // 'ism' | 'nist-800-53' | 'fedramp' | 'soc2' | 'iso-27001'.
    key: text('key').notNull(),
    label: text('label').notNull(),
    // How an engagement's initial control set is derived:
    //   'classification'    – cumulative inclusion by min rank (ISM today)
    //   'baseline_profile'  – OSCAL profile selects controls (NIST/FedRAMP)
    //   'selection'         – seed all, assessor marks in/out via SoA (SOC2/ISO)
    scopingMode: text('scoping_mode').notNull().default('classification'),
    // Where the catalogue comes from:
    //   'oscal_github_tags' – tagged releases in a GitHub repo (ISM today)
    //   'oscal_url'         – a single OSCAL catalogue URL
    //   'csv_client_import' – client uploads their own licensed control set
    sourceKind: text('source_kind').notNull().default('oscal_github_tags'),
    // Repo / url / profile refs, or CSV column-mapping config. Shape depends on
    // sourceKind; resolved by lib/frameworks/sources.ts.
    sourceConfig: jsonb('source_config').$type<Record<string, unknown>>(),
    // Overlays layered on the framework, e.g. ['essential-eight'] for ISM.
    overlays: jsonb('overlays').$type<string[]>().notNull().default([]),
    // Rank scheme for 'classification' scoping; null for other modes.
    classificationScheme: jsonb('classification_scheme').$type<
      Record<string, number>
    >(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('frameworks_key_uq').on(t.key)],
);

// The catalogue. One row per (framework, control_id, revision). Older revisions
// are retained so engagements pinned to them keep working (section 8). A
// nullable tenant_id is reserved for client-imported frameworks (SOC2/ISO,
// Phase 4); global frameworks (ISM/NIST/FedRAMP) leave it null.
export const frameworkControls = pgTable(
  'framework_controls',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    frameworkId: uuid('framework_id')
      .notNull()
      .references(() => frameworks.id),
    // NULL = global catalogue shared by all tenants (ISM/NIST/FedRAMP).
    // SET = a client-imported private copy (SOC 2 / ISO 27001, Phase 4),
    // visible only to that tenant so licensed content never crosses tenants.
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    controlId: text('control_id').notNull(),
    revision: text('revision').notNull(),
    topic: text('topic'),
    // Sub-chapter / nested group path when present in OSCAL. Older imports may
    // contain the control class or title here.
    section: text('section'),
    description: text('description').notNull(),
    guidance: text('guidance'),
    // ISM-specific scope columns. Used by the 'classification' scoping mode;
    // other frameworks leave these at the OFFICIAL/rank-1 default.
    minClassification: classificationEnum('min_classification').notNull(),
    minClassificationRank: integer('min_classification_rank').notNull(),
    // Essential Eight mapping pulled from OSCAL props (ISM overlay). Multiple
    // strategies and maturity levels can apply; stored as JSON.
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
    // Global rows (tenant_id NULL): unique per (framework, control, revision).
    uniqueIndex('framework_controls_global_uq')
      .on(t.frameworkId, t.controlId, t.revision)
      .where(sql`${t.tenantId} is null`),
    // Tenant-imported rows: unique per (framework, tenant, control, revision).
    uniqueIndex('framework_controls_tenant_uq')
      .on(t.frameworkId, t.tenantId, t.controlId, t.revision)
      .where(sql`${t.tenantId} is not null`),
    index('framework_controls_min_rank_idx').on(t.minClassificationRank),
    index('framework_controls_revision_idx').on(t.revision),
    index('framework_controls_framework_idx').on(t.frameworkId),
    index('framework_controls_tenant_idx').on(t.tenantId),
  ],
);

// Applicable controls for one engagement. Auto-populated at engagement
// creation by the framework's scoping strategy. For ISM ('classification'):
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
    frameworkId: uuid('framework_id')
      .notNull()
      .references(() => frameworks.id),
    frameworkControlId: uuid('framework_control_id')
      .notNull()
      .references(() => frameworkControls.id),
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
    assessmentMethods: text('assessment_methods'),
    assessmentObjects: text('assessment_objects'),
    evidenceQuality: text('evidence_quality'),
    evidenceLimitations: text('evidence_limitations'),
    lastReviewedAt: timestamp('last_reviewed_at', { withTimezone: true }),
    lastReviewedBy: uuid('last_reviewed_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('engagement_controls_engagement_control_uq').on(
      t.engagementId,
      t.frameworkControlId,
    ),
    index('engagement_controls_engagement_idx').on(t.engagementId),
    index('engagement_controls_status_idx').on(t.status),
  ],
);

// Tracks the catalogue ingestion runs themselves so we can answer "what
// revision is loaded for this framework?" and audit each import.
export const frameworkImports = pgTable(
  'framework_imports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    frameworkId: uuid('framework_id')
      .notNull()
      .references(() => frameworks.id),
    // NULL = global import (ISM/NIST). SET = a client CSV import scoped to a
    // tenant (SOC 2 / ISO 27001).
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    revision: text('revision').notNull(),
    sourceUrl: text('source_url').notNull(),
    sourceSha256: text('source_sha256').notNull(),
    controlCount: integer('control_count').notNull(),
    triggeredBy: uuid('triggered_by').references(() => users.id),
    completedAt: timestamp('completed_at', { withTimezone: true }).notNull().defaultNow(),
    metadata: jsonb('metadata'),
  },
  (t) => [
    uniqueIndex('framework_imports_global_uq')
      .on(t.frameworkId, t.revision, t.sourceSha256)
      .where(sql`${t.tenantId} is null`),
    uniqueIndex('framework_imports_tenant_uq')
      .on(t.frameworkId, t.tenantId, t.revision, t.sourceSha256)
      .where(sql`${t.tenantId} is not null`),
    index('framework_imports_tenant_idx').on(t.tenantId),
  ],
);

export type Framework = typeof frameworks.$inferSelect;
export type FrameworkControl = typeof frameworkControls.$inferSelect;
