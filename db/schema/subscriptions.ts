import {
  pgTable,
  pgEnum,
  text,
  integer,
  timestamp,
  uuid,
  jsonb,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { users } from './auth';

// Microsoft Marketplace SaaS lifecycle, normalised to OakAttest names.
// Mapping:
//   pending    ← PendingFulfillmentStart (purchased, not yet activated)
//   active     ← Subscribed
//   suspended  ← Suspended (non-payment, immediate write block unless grace open)
//   grace      ← Suspended + grace window open (writes still allowed, banner shown)
//   cancelled  ← Unsubscribed (terminal — new subscription required)
//
// Reinstatement (suspended/grace → active) is a transition, not a state.
export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'pending',
  'active',
  'suspended',
  'grace',
  'cancelled',
]);

export type SubscriptionStatus =
  (typeof subscriptionStatusEnum.enumValues)[number];

// One row per tenant. The 1:1 constraint is the system-of-record rule from
// `docs/saas/oakattest-tenancy-model.md` §8: one Marketplace subscription per
// tenant, never many-to-one. Enforced by the unique index on `tenantId`.
//
// Self-installed deployments have no row. `lib/billing/entitlement.ts` treats
// the missing-row case as "allow" so self-installed instances are not gated.
export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    // Microsoft Marketplace subscription ID (UUID from Partner Center). Stored
    // as text so we can swap or shim providers without a migration.
    marketplaceSubscriptionId: text('marketplace_subscription_id').notNull(),
    // The user who completed the Marketplace landing page (issue #41). Becomes
    // the first `tenant_owner`. Nullable for cases where the purchase predates
    // the user account (rare, but Microsoft permits delegated-admin purchases).
    purchaserUserId: uuid('purchaser_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    // Marketplace plan ID (e.g. "starter", "team", "firm"). Plan entitlements
    // are resolved by name in `lib/billing/plans.ts`.
    planId: text('plan_id').notNull(),
    status: subscriptionStatusEnum('status').notNull().default('pending'),
    // Per-seat or per-assessment quantity. Defaults to 1 for flat-plan
    // subscriptions. Per-unit billing lands with private-offer work (#60).
    quantity: integer('quantity').notNull().default(1),
    effectiveStartAt: timestamp('effective_start_at', { withTimezone: true }),
    effectiveEndAt: timestamp('effective_end_at', { withTimezone: true }),
    // Set when the subscription enters `suspended`. While `now() <
    // graceEndsAt`, the status is reported as `grace` and writes remain
    // permitted with a banner. After this, writes are blocked.
    graceEndsAt: timestamp('grace_ends_at', { withTimezone: true }),
    // Last time the SaaS webhook (#44) updated this row. Used by the admin
    // view to surface drift between Marketplace and OakAttest.
    lastWebhookAt: timestamp('last_webhook_at', { withTimezone: true }),
    // Raw Microsoft fulfillment payload (last successful resolve/get). Kept
    // verbatim for support and audit cross-referencing.
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // One subscription per tenant. Reject re-binding at the webhook layer.
    uniqueIndex('subscriptions_tenant_uq').on(t.tenantId),
    uniqueIndex('subscriptions_marketplace_id_uq').on(
      t.marketplaceSubscriptionId,
    ),
    index('subscriptions_status_idx').on(t.status),
  ],
);

export type Subscription = typeof subscriptions.$inferSelect;
