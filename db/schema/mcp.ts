import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { users } from './auth';

export const MCP_SCOPES = [
  'assessment:read',
  'assessment:write',
  'evidence:read',
  'evidence:write',
  'audit:read',
  'audit:write',
] as const;

export type McpScope = (typeof MCP_SCOPES)[number];

// Long-lived machine credentials for the Streamable HTTP MCP endpoint.
// Only a prefix and SHA-256 digest are stored; the plaintext secret is shown
// once when created. Tokens execute as their creator so normal tenant and
// engagement RBAC, including assessor/client independence, still applies.
export const mcpApiTokens = pgTable(
  'mcp_api_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    actorUserId: uuid('actor_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    tokenPrefix: text('token_prefix').notNull(),
    tokenHash: text('token_hash').notNull(),
    scopes: jsonb('scopes').$type<McpScope[]>().notNull().default([]),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('mcp_api_tokens_hash_uq').on(t.tokenHash),
    index('mcp_api_tokens_tenant_idx').on(t.tenantId),
    index('mcp_api_tokens_actor_idx').on(t.actorUserId),
    index('mcp_api_tokens_expiry_idx').on(t.expiresAt),
  ],
);

export type McpApiToken = typeof mcpApiTokens.$inferSelect;
