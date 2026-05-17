import {
  pgTable,
  text,
  timestamp,
  uuid,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { engagementRoleEnum } from './enums';
import { engagements } from './engagements';
import { tenants } from './tenants';
import { users } from './auth';

// Engagement-scope invitations (§9.2). Client-side invites go through the
// magic-link flow but we keep our own table so we can attach a role and a
// human-readable acceptance state. The actual token is delivered via email
// using BetterAuth's magicLink plugin and verified via the verification_tokens
// table; this row tracks the lifecycle.
export const engagementInvitations = pgTable(
  'engagement_invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => engagements.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    email: text('email').notNull(),
    role: engagementRoleEnum('role').notNull(),
    token: text('token').notNull(),
    invitedBy: uuid('invited_by').references(() => users.id),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    acceptedBy: uuid('accepted_by').references(() => users.id),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('engagement_invitations_token_uq').on(t.token),
    index('engagement_invitations_engagement_email_idx').on(t.engagementId, t.email),
  ],
);
