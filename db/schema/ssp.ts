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
    metadata: jsonb('metadata'),
    lastEditedBy: uuid('last_edited_by').references(() => users.id),
    lastEditedAt: timestamp('last_edited_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('ssp_sections_engagement_section_uq').on(t.engagementId, t.sectionKey)],
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
