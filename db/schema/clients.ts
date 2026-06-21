import { pgTable, text, timestamp, uuid, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';

// Reusable client registry per tenant. Engagements are created against a client
// selected from here (not entered freeform), so the same client can run many
// engagements and their details stay consistent.
export const clients = pgTable(
  'clients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    // Generic business identifier (ABN / EIN / company number).
    businessNumber: text('business_number'),
    primaryContactName: text('primary_contact_name'),
    primaryContactEmail: text('primary_contact_email'),
    address: text('address'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [index('clients_tenant_idx').on(t.tenantId)],
);

export type Client = typeof clients.$inferSelect;

// Required fields a client must have before an engagement can be started.
export function clientMissingFields(client: {
  name: string | null;
  primaryContactName: string | null;
  primaryContactEmail: string | null;
}): string[] {
  const missing: string[] = [];
  if (!client.name?.trim()) missing.push('name');
  if (!client.primaryContactName?.trim()) missing.push('primary contact name');
  if (!client.primaryContactEmail?.trim()) missing.push('primary contact email');
  return missing;
}
