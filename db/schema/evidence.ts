import {
  pgTable,
  text,
  timestamp,
  uuid,
  bigint,
  integer,
  index,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/pg-core';
import {
  evidenceRequestStatusEnum,
  evidenceReviewStatusEnum,
} from './enums';
import { engagements } from './engagements';
import { tenants } from './tenants';
import { users } from './auth';
import { ismControls } from './ism';

// Evidence Requests (§9.7). The assessor asks the client for an artifact
// covering one or more controls.
export const evidenceRequests = pgTable(
  'evidence_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => engagements.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    title: text('title').notNull(),
    description: text('description'),
    artifactType: text('artifact_type'),
    dueAt: timestamp('due_at', { withTimezone: true }),
    status: evidenceRequestStatusEnum('status').notNull().default('open'),
    requestedBy: uuid('requested_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  },
  (t) => [
    index('evidence_requests_engagement_idx').on(t.engagementId),
    index('evidence_requests_status_idx').on(t.status),
  ],
);

export const evidenceRequestControls = pgTable(
  'evidence_request_controls',
  {
    evidenceRequestId: uuid('evidence_request_id')
      .notNull()
      .references(() => evidenceRequests.id, { onDelete: 'cascade' }),
    ismControlId: uuid('ism_control_id').notNull().references(() => ismControls.id),
  },
  (t) => [primaryKey({ columns: [t.evidenceRequestId, t.ismControlId] })],
);

// Uploaded files. Versioned: replacing a file creates a new row with
// `supersedes_id` pointing at the previous version; nothing is deleted.
// Storage is S3 with SSE-KMS; the storage key follows
// `tenants/{tenantId}/engagements/{engagementId}/evidence/{uuid}`.
export const evidenceItems = pgTable(
  'evidence_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => engagements.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    evidenceRequestId: uuid('evidence_request_id').references(() => evidenceRequests.id, {
      onDelete: 'set null',
    }),
    filename: text('filename').notNull(),
    mimeType: text('mime_type'),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    sha256: text('sha256').notNull(),
    storageKey: text('storage_key').notNull(),
    storageBucket: text('storage_bucket').notNull(),
    version: integer('version').notNull().default(1),
    supersedesId: uuid('supersedes_id'),
    description: text('description'),
    uploadedBy: uuid('uploaded_by').references(() => users.id),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
    storageVerifiedAt: timestamp('storage_verified_at', { withTimezone: true }),
    storageVerification: text('storage_verification'),
    quarantinedAt: timestamp('quarantined_at', { withTimezone: true }),
    quarantineReason: text('quarantine_reason'),
    reviewStatus: evidenceReviewStatusEnum('review_status').notNull().default('pending'),
    reviewedBy: uuid('reviewed_by').references(() => users.id),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewNotes: text('review_notes'),
  },
  (t) => [
    index('evidence_items_engagement_idx').on(t.engagementId),
    index('evidence_items_request_idx').on(t.evidenceRequestId),
    uniqueIndex('evidence_items_sha_engagement_uq').on(t.engagementId, t.sha256, t.version),
  ],
);

export const evidenceItemControls = pgTable(
  'evidence_item_controls',
  {
    evidenceItemId: uuid('evidence_item_id')
      .notNull()
      .references(() => evidenceItems.id, { onDelete: 'cascade' }),
    ismControlId: uuid('ism_control_id').notNull().references(() => ismControls.id),
  },
  (t) => [primaryKey({ columns: [t.evidenceItemId, t.ismControlId] })],
);
