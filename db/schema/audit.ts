import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { auditActorTypeEnum } from './enums';

// Append-only (section 6). DB role separation enforces this: the app role has
// only INSERT and SELECT on this table; UPDATE and DELETE are revoked. A
// separate audit role can SELECT only and is used by the viewer.
//
// Drizzle migrations create the table; a post-migration SQL hook applies the
// grants — see `db/migrations/post/audit_log_grants.sql`.
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    engagementId: uuid('engagement_id'),
    actorType: auditActorTypeEnum('actor_type').notNull().default('user'),
    actorUserId: uuid('actor_user_id'),
    actorIp: text('actor_ip'),
    actorUserAgent: text('actor_user_agent'),
    action: text('action').notNull(),
    resourceType: text('resource_type').notNull(),
    resourceId: text('resource_id'),
    beforeJson: jsonb('before_json'),
    afterJson: jsonb('after_json'),
    // Optional message for free-text narration (e.g. "boundary unlocked for
    // scope change request #123").
    message: text('message'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_log_tenant_idx').on(t.tenantId),
    index('audit_log_engagement_idx').on(t.engagementId),
    index('audit_log_actor_idx').on(t.actorUserId),
    index('audit_log_action_idx').on(t.action),
    index('audit_log_created_idx').on(t.createdAt),
  ],
);
