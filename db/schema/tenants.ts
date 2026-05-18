import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { tenantRoleEnum, engagementRoleEnum } from './enums';
import { users } from './auth';

// A tenant is an assessor firm. Maps 1:1 to BetterAuth's organization concept;
// we keep our own table so application code does not have to thread BetterAuth
// types into the domain layer.
export const tenants = pgTable(
  'tenants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    abn: text('abn'),
    // Per-tenant branding (section 12). UI reads via `lib/branding.ts` which
    // falls back to the OakAttest defaults when fields are null.
    branding: jsonb('branding').$type<{
      logoUrl?: string;
      primaryColour?: string;
      accentColour?: string;
      productName?: string;
    }>(),
    securityPolicy: jsonb('security_policy').$type<{
      mfaMode?: 'optional' | 'assessor_required' | 'all_users_required';
      mfaGracePeriodDays?: number;
    }>(),
    compliancePolicy: jsonb('compliance_policy').$type<{
      reassessmentMonths?: Partial<Record<string, number>>;
      dueSoonDays?: number;
    }>(),
    // Billing reference (section 13 mentions a billing stub). Held as text so
    // we can swap providers later without a migration.
    billingCustomerId: text('billing_customer_id'),
    // Hosting region declaration shown on the data residency page.
    dataRegion: text('data_region').notNull().default('ap-southeast-2'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('tenants_slug_uq').on(t.slug)],
);

// User membership in an assessor firm. A user may belong to many tenants
// (section 3: consultants who work across firms).
export const tenantMembers = pgTable(
  'tenant_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    role: tenantRoleEnum('role').notNull(),
    invitedBy: uuid('invited_by').references(() => users.id),
    invitedAt: timestamp('invited_at', { withTimezone: true }),
    joinedAt: timestamp('joined_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('tenant_members_tenant_user_uq').on(t.tenantId, t.userId),
    index('tenant_members_user_idx').on(t.userId),
  ],
);

// Tenant-level invitations (assessor firm inviting a new colleague). Client
// invites use `verification_tokens` with purpose='client_invite' and reference
// the engagement, not the tenant.
export const tenantInvitations = pgTable(
  'tenant_invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: tenantRoleEnum('role').notNull(),
    token: text('token').notNull(),
    invitedBy: uuid('invited_by').references(() => users.id),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('tenant_invitations_token_uq').on(t.token),
    index('tenant_invitations_tenant_email_idx').on(t.tenantId, t.email),
  ],
);

// Forward-declared because `engagements` lives in the engagements schema file
// and depends on `tenants`. Engagement membership is in this file because
// permissions live with the membership model.
export const engagementMembers = pgTable(
  'engagement_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    engagementId: uuid('engagement_id').notNull(),
    tenantId: uuid('tenant_id').notNull(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    role: engagementRoleEnum('role').notNull(),
    invitedBy: uuid('invited_by').references(() => users.id),
    invitedAt: timestamp('invited_at', { withTimezone: true }),
    joinedAt: timestamp('joined_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('engagement_members_engagement_user_uq').on(t.engagementId, t.userId),
    index('engagement_members_user_idx').on(t.userId),
    index('engagement_members_tenant_idx').on(t.tenantId),
  ],
);
