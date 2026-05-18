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
import { sspSectionKeyEnum } from './enums';
import { engagements } from './engagements';
import { tenants } from './tenants';
import { users } from './auth';

// SSP body content per section (§9.5). The eight sections from the spec.
// Most sections are auto-generated and the user can override content;
// `auto_summary` retains the generator output so we can detect divergence
// when a regeneration would replace user-authored prose.
export const sspSections = pgTable(
  'ssp_sections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => engagements.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    sectionKey: sspSectionKeyEnum('section_key').notNull(),
    content: text('content').notNull().default(''),
    autoSummary: text('auto_summary'),
    reviewStatus: text('review_status').notNull().default('draft'),
    metadata: jsonb('metadata'),
    lastEditedBy: uuid('last_edited_by').references(() => users.id),
    lastEditedAt: timestamp('last_edited_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('ssp_sections_engagement_section_uq').on(t.engagementId, t.sectionKey)],
);

export const sspSectionComments = pgTable(
  'ssp_section_comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sectionId: uuid('section_id')
      .notNull()
      .references(() => sspSections.id, { onDelete: 'cascade' }),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => engagements.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    parentCommentId: uuid('parent_comment_id'),
    body: text('body').notNull(),
    status: text('status').notNull().default('open'),
    createdBy: uuid('created_by').references(() => users.id),
    resolvedBy: uuid('resolved_by').references(() => users.id),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('ssp_section_comments_section_idx').on(t.sectionId),
    index('ssp_section_comments_engagement_idx').on(t.engagementId),
  ],
);

export const sspSectionVersions = pgTable(
  'ssp_section_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sectionId: uuid('section_id')
      .notNull()
      .references(() => sspSections.id, { onDelete: 'cascade' }),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => engagements.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    version: integer('version').notNull(),
    content: text('content').notNull(),
    reviewStatus: text('review_status').notNull(),
    editedBy: uuid('edited_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('ssp_section_versions_section_version_uq').on(t.sectionId, t.version)],
);

// Each PDF export is versioned and recorded for the evidence chain (§9.5).
export const sspExports = pgTable(
  'ssp_exports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => engagements.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    version: integer('version').notNull(),
    format: text('format').notNull(),
    storageKey: text('storage_key').notNull(),
    storageBucket: text('storage_bucket').notNull(),
    sha256: text('sha256').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    generatedBy: uuid('generated_by').references(() => users.id),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('ssp_exports_engagement_version_format_uq').on(
      t.engagementId,
      t.version,
      t.format,
    ),
    index('ssp_exports_engagement_idx').on(t.engagementId),
  ],
);
