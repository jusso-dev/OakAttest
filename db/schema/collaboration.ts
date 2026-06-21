import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { engagements } from './engagements';
import { tenants } from './tenants';
import { users } from './auth';

// Internal discussion threads on an engagement. `audience` separates the
// assessor-side team thread from the client-side thread so each group can talk
// amongst themselves without the other seeing it (independence + privacy).
//   audience = 'assessor' → visible to assessor-side + tenant admins
//   audience = 'client'   → visible to client-side participants
export const engagementNotes = pgTable(
  'engagement_notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => engagements.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    authorId: uuid('author_id').notNull().references(() => users.id),
    audience: text('audience').notNull(), // 'assessor' | 'client'
    body: text('body').notNull(),
    // User ids @mentioned in the body; validated against engagement membership.
    mentionedUserIds: jsonb('mentioned_user_ids').$type<string[]>().notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('engagement_notes_engagement_audience_idx').on(t.engagementId, t.audience),
    index('engagement_notes_created_idx').on(t.createdAt),
  ],
);

// In-app notifications. One row per (user, event). `readAt` null = unread.
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    engagementId: uuid('engagement_id').references(() => engagements.id, { onDelete: 'cascade' }),
    // 'mention' | 'note' | 'evidence_uploaded' | 'engagement_updated' | ...
    type: text('type').notNull(),
    title: text('title').notNull(),
    body: text('body'),
    link: text('link'),
    actorUserId: uuid('actor_user_id').references(() => users.id),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('notifications_user_unread_idx').on(t.userId, t.readAt),
    index('notifications_user_created_idx').on(t.userId, t.createdAt),
  ],
);

// Assessors watching an engagement get notified of new evidence + field changes.
export const engagementWatchers = pgTable(
  'engagement_watchers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => engagements.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('engagement_watchers_engagement_user_uq').on(t.engagementId, t.userId),
    index('engagement_watchers_engagement_idx').on(t.engagementId),
  ],
);

export type EngagementNote = typeof engagementNotes.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
