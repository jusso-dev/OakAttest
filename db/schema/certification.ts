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
import { certificationStatusEnum } from './enums';
import { engagements } from './engagements';
import { tenants } from './tenants';
import { users } from './auth';

// Certification report version history (§9.11). Each row is one generated
// package. `bundle_hash` is the SHA-256 of the signed zip used for public
// verification; `public_verification_token` is the public URL parameter.
export const certificationReports = pgTable(
  'certification_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => engagements.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    version: integer('version').notNull(),
    status: certificationStatusEnum('status').notNull().default('draft'),
    // Snapshot of every input that fed the report so it can be reproduced.
    snapshot: jsonb('snapshot').notNull(),
    pdfStorageKey: text('pdf_storage_key'),
    pdfStorageBucket: text('pdf_storage_bucket'),
    pdfSha256: text('pdf_sha256'),
    bundleStorageKey: text('bundle_storage_key'),
    bundleStorageBucket: text('bundle_storage_bucket'),
    bundleSha256: text('bundle_sha256'),
    publicVerificationToken: text('public_verification_token'),
    signedBy: uuid('signed_by').references(() => users.id),
    signedAt: timestamp('signed_at', { withTimezone: true }),
    signingKeyId: uuid('signing_key_id'),
    signingKeyFingerprint: text('signing_key_fingerprint'),
    signatureValue: text('signature_value'),
    signatureAlgorithm: text('signature_algorithm'),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedReason: text('revoked_reason'),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('certification_engagement_version_uq').on(t.engagementId, t.version),
    uniqueIndex('certification_public_token_uq').on(t.publicVerificationToken),
    index('certification_engagement_idx').on(t.engagementId),
  ],
);

// Residual risks captured at certification time (§9.11). Frozen with the
// report; new versions of the report copy and amend.
export const residualRisks = pgTable(
  'residual_risks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => engagements.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    certificationReportId: uuid('certification_report_id').references(
      () => certificationReports.id,
      { onDelete: 'set null' },
    ),
    title: text('title').notNull(),
    description: text('description').notNull(),
    likelihood: text('likelihood'),
    impact: text('impact'),
    mitigation: text('mitigation'),
    acceptedBy: text('accepted_by'),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('residual_risks_engagement_idx').on(t.engagementId)],
);

// Per-tenant signing key store (§9.11 "server-side signing key, per-tenant").
// Private keys live in KMS; this table records the public material and the
// KMS key reference.
export const tenantSigningKeys = pgTable(
  'tenant_signing_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    keyType: text('key_type').notNull(),
    publicKey: text('public_key').notNull(),
    kmsKeyArn: text('kms_key_arn'),
    fingerprint: text('fingerprint').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    rotatedAt: timestamp('rotated_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('tenant_signing_keys_fingerprint_uq').on(t.fingerprint),
    index('tenant_signing_keys_tenant_idx').on(t.tenantId),
  ],
);
