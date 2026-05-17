import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  jsonb,
  decimal,
  index,
} from 'drizzle-orm/pg-core';
import {
  cveScanSourceEnum,
  cveScanStatusEnum,
  cveSeverityEnum,
} from './enums';
import { engagements } from './engagements';
import { tenants } from './tenants';
import { users } from './auth';
import { evidenceItems } from './evidence';

// CVE scans as evidence (§9.9). One row per scan. Outputs are signed and
// stored as immutable evidence; the pair (before/after) becomes proof of
// remediation.
export const cveScans = pgTable(
  'cve_scans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => engagements.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    source: cveScanSourceEnum('source').notNull(),
    sourceFilename: text('source_filename'),
    sourceArtifactHash: text('source_artifact_hash').notNull(),
    status: cveScanStatusEnum('status').notNull().default('pending'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    failureReason: text('failure_reason'),
    requestedBy: uuid('requested_by').references(() => users.id),
    signedHash: text('signed_hash'),
    signedAt: timestamp('signed_at', { withTimezone: true }),
    // Roll-up counts populated when the scan finishes.
    findingCount: integer('finding_count').notNull().default(0),
    criticalCount: integer('critical_count').notNull().default(0),
    highCount: integer('high_count').notNull().default(0),
    mediumCount: integer('medium_count').notNull().default(0),
    lowCount: integer('low_count').notNull().default(0),
    // When the scan output is exported as an evidence item, this points at it.
    evidenceItemId: uuid('evidence_item_id').references(() => evidenceItems.id, {
      onDelete: 'set null',
    }),
    // For follow-up scans showing closed CVEs.
    previousScanId: uuid('previous_scan_id'),
  },
  (t) => [
    index('cve_scans_engagement_idx').on(t.engagementId),
    index('cve_scans_status_idx').on(t.status),
  ],
);

export const cveScanFindings = pgTable(
  'cve_scan_findings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scanId: uuid('scan_id').notNull().references(() => cveScans.id, { onDelete: 'cascade' }),
    packageEcosystem: text('package_ecosystem').notNull(),
    packageName: text('package_name').notNull(),
    version: text('version').notNull(),
    advisoryId: text('advisory_id').notNull(),
    severity: cveSeverityEnum('severity').notNull(),
    cvssScore: decimal('cvss_score', { precision: 4, scale: 1 }),
    summary: text('summary'),
    fixedVersions: jsonb('fixed_versions').$type<string[]>(),
    references: jsonb('references').$type<string[]>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('cve_scan_findings_scan_idx').on(t.scanId),
    index('cve_scan_findings_severity_idx').on(t.severity),
  ],
);
