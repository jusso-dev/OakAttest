import { pgTable, integer, bigint, timestamp, uuid } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';

// Per-tenant usage counters, maintained as side effects of the actions that
// create users/entities/frameworks and upload evidence. Read by `lib/licensing`
// to enforce plan limits. One row per tenant (lazily created on first write).
export const tenantUsage = pgTable('tenant_usage', {
  tenantId: uuid('tenant_id')
    .primaryKey()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  storageBytes: bigint('storage_bytes', { mode: 'number' }).notNull().default(0),
  userCount: integer('user_count').notNull().default(0),
  entityCount: integer('entity_count').notNull().default(0),
  frameworkCount: integer('framework_count').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type TenantUsage = typeof tenantUsage.$inferSelect;
