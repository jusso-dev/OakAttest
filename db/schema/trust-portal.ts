import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { certificationReports } from './certification';
import { engagements } from './engagements';
import { tenants } from './tenants';
import { users } from './auth';
import type { TrustPortalSnapshot } from '@/lib/trust-portal';

export const trustPortals = pgTable(
  'trust_portals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    engagementId: uuid('engagement_id').notNull().references(() => engagements.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    slug: text('slug').notNull(),
    status: text('status').notNull().default('draft'),
    title: text('title').notNull(),
    organisationName: text('organisation_name').notNull(),
    overview: text('overview').notNull(),
    commitments: jsonb('commitments').$type<string[]>().notNull().default([]),
    securityContactEmail: text('security_contact_email').notNull(),
    currentPublicationId: uuid('current_publication_id'),
    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('trust_portals_engagement_uq').on(table.engagementId),
    uniqueIndex('trust_portals_slug_uq').on(table.slug),
    index('trust_portals_tenant_idx').on(table.tenantId),
    index('trust_portals_status_idx').on(table.status),
  ],
);

export const trustPortalPublications = pgTable(
  'trust_portal_publications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    portalId: uuid('portal_id').notNull().references(() => trustPortals.id, { onDelete: 'cascade' }),
    engagementId: uuid('engagement_id').notNull().references(() => engagements.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    certificationReportId: uuid('certification_report_id').notNull().references(() => certificationReports.id),
    version: integer('version').notNull(),
    snapshot: jsonb('snapshot').$type<TrustPortalSnapshot>().notNull(),
    snapshotSha256: text('snapshot_sha256').notNull(),
    releaseClassification: text('release_classification').notNull().default('PUBLIC'),
    approvalStatement: text('approval_statement').notNull(),
    approvedBy: uuid('approved_by').notNull().references(() => users.id),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedBy: uuid('revoked_by').references(() => users.id),
    revokedReason: text('revoked_reason'),
  },
  (table) => [
    uniqueIndex('trust_portal_publications_version_uq').on(table.portalId, table.version),
    index('trust_portal_publications_portal_idx').on(table.portalId, table.publishedAt),
    index('trust_portal_publications_report_idx').on(table.certificationReportId),
  ],
);

export const trustPortalAccessRequests = pgTable(
  'trust_portal_access_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    portalId: uuid('portal_id').notNull().references(() => trustPortals.id, { onDelete: 'cascade' }),
    publicationId: uuid('publication_id').notNull().references(() => trustPortalPublications.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    requesterEmail: text('requester_email').notNull(),
    requesterOrganisation: text('requester_organisation').notNull(),
    purpose: text('purpose').notNull(),
    status: text('status').notNull().default('pending'),
    decisionNotes: text('decision_notes'),
    decidedBy: uuid('decided_by').references(() => users.id),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('trust_portal_access_requests_portal_idx').on(table.portalId, table.requestedAt),
    index('trust_portal_access_requests_status_idx').on(table.status),
    uniqueIndex('trust_portal_access_requests_pending_uq')
      .on(table.publicationId, table.requesterEmail)
      .where(sql`${table.status} = 'pending'`),
  ],
);

export const trustPortalAccessGrants = pgTable(
  'trust_portal_access_grants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requestId: uuid('request_id').notNull().references(() => trustPortalAccessRequests.id, { onDelete: 'cascade' }),
    portalId: uuid('portal_id').notNull().references(() => trustPortals.id, { onDelete: 'cascade' }),
    publicationId: uuid('publication_id').notNull().references(() => trustPortalPublications.id, { onDelete: 'cascade' }),
    certificationReportId: uuid('certification_report_id').notNull().references(() => certificationReports.id),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    tokenSha256: text('token_sha256').notNull(),
    requesterEmail: text('requester_email').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    maxDownloads: integer('max_downloads').notNull().default(3),
    downloadCount: integer('download_count').notNull().default(0),
    lastDownloadedAt: timestamp('last_downloaded_at', { withTimezone: true }),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedBy: uuid('revoked_by').references(() => users.id),
  },
  (table) => [
    uniqueIndex('trust_portal_access_grants_request_uq').on(table.requestId),
    uniqueIndex('trust_portal_access_grants_token_uq').on(table.tokenSha256),
    index('trust_portal_access_grants_portal_idx').on(table.portalId, table.createdAt),
  ],
);
