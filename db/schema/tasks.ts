import {
  pgTable,
  text,
  timestamp,
  uuid,
  index,
} from 'drizzle-orm/pg-core';
import { taskPriorityEnum, taskStatusEnum } from './enums';
import { engagements } from './engagements';
import { tenants } from './tenants';
import { users } from './auth';

// Engagement-scoped operational task board. Used for assessor and client work
// that needs an owner, due date, and visible status across the engagement.
export const engagementTasks = pgTable(
  'engagement_tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => engagements.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    status: taskStatusEnum('status').notNull().default('todo'),
    priority: taskPriorityEnum('priority').notNull().default('medium'),
    ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
    dueAt: timestamp('due_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    completedBy: uuid('completed_by').references(() => users.id, { onDelete: 'set null' }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  },
  (t) => [
    index('engagement_tasks_engagement_status_idx').on(t.engagementId, t.status),
    index('engagement_tasks_owner_status_idx').on(t.ownerUserId, t.status),
    index('engagement_tasks_due_idx').on(t.dueAt),
  ],
);
