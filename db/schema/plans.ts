import {
  pgTable,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  uuid,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// The SaaS plan catalogue. `code` is the stable identifier referenced by
// `subscriptions.planId` (text-by-value, not FK, so a subscription survives
// catalogue edits). Seeded by `db/seed/plans.ts`.
export const plans = pgTable(
  'plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(), // ESSENTIAL | PROFESSIONAL | ENTERPRISE
    name: text('name').notNull(),
    description: text('description'),
    priceMonthly: numeric('price_monthly', { precision: 10, scale: 2 }),
    currency: text('currency').notNull().default('AUD'),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('plans_code_uq').on(t.code)],
);

// Feature catalogue. `code` is referenced by `plan_features`, by
// `licensing.requireFeature(code)`, and by `<FeatureGate feature={code}>`.
export const features = pgTable(
  'features',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(), // e.g. ISO27001, SSO, API_ACCESS
    name: text('name').notNull(),
    description: text('description'),
    // Grouping for the subscription screen (framework | collaboration | platform | reporting).
    category: text('category'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('features_code_uq').on(t.code)],
);

// Which features each plan unlocks. A row with enabled=true grants the feature.
export const planFeatures = pgTable(
  'plan_features',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    planId: uuid('plan_id').notNull().references(() => plans.id, { onDelete: 'cascade' }),
    featureId: uuid('feature_id')
      .notNull()
      .references(() => features.id, { onDelete: 'cascade' }),
    enabled: boolean('enabled').notNull().default(true),
  },
  (t) => [uniqueIndex('plan_features_plan_feature_uq').on(t.planId, t.featureId)],
);

// Usage caps per plan. NULL on any column = unlimited for that dimension.
// One row per plan (planId is the primary key).
export const planLimits = pgTable('plan_limits', {
  planId: uuid('plan_id')
    .primaryKey()
    .references(() => plans.id, { onDelete: 'cascade' }),
  maxUsers: integer('max_users'),
  maxFrameworks: integer('max_frameworks'),
  maxEntities: integer('max_entities'),
  maxStorageGb: integer('max_storage_gb'),
});

export type Plan = typeof plans.$inferSelect;
export type Feature = typeof features.$inferSelect;
export type PlanFeature = typeof planFeatures.$inferSelect;
export type PlanLimit = typeof planLimits.$inferSelect;
