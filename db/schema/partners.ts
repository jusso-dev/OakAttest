import {
  pgTable,
  text,
  timestamp,
  uuid,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { partnerRoleEnum } from './enums';
import { users } from './auth';

// A partner is an MSP (managed service provider) that manages many client
// tenants. Partners sit ABOVE tenants: a partner member can access every
// tenant under the partner (the MSP console). Billing for each client tenant
// lives on that tenant's `subscriptions` row; the partner is the commercial
// relationship (e.g. the Pax8 reseller) and the grouping for cross-tenant work.
export const partners = pgTable(
  'partners',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    // Billing / notification contact for the MSP.
    billingEmail: text('billing_email'),
    // How this partner was onboarded. 'manual' for hand-onboarded MSPs; kept
    // generic for future marketplace provisioning ('pax8' | 'azure' | 'aws').
    externalProvider: text('external_provider').notNull().default('manual'),
    // Provider-side reseller/account reference, when applicable.
    externalRef: text('external_ref'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('partners_slug_uq').on(t.slug)],
);

// User membership in a partner (MSP staff). A user may belong to many partners
// (a consultant servicing multiple MSPs). Uniqueness is per (partner, user).
export const partnerMembers = pgTable(
  'partner_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    partnerId: uuid('partner_id')
      .notNull()
      .references(() => partners.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    role: partnerRoleEnum('role').notNull(),
    invitedBy: uuid('invited_by').references(() => users.id),
    invitedAt: timestamp('invited_at', { withTimezone: true }),
    joinedAt: timestamp('joined_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('partner_members_partner_user_uq').on(t.partnerId, t.userId),
    index('partner_members_user_idx').on(t.userId),
  ],
);

export type Partner = typeof partners.$inferSelect;
export type PartnerMember = typeof partnerMembers.$inferSelect;
