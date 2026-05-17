import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  jsonb,
  index,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { interviewStatusEnum } from './enums';
import { engagements } from './engagements';
import { tenants } from './tenants';
import { users } from './auth';
import { ismControls } from './ism';

// Fieldwork: interviews and walkthroughs (§9.8).
export const interviews = pgTable(
  'interviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => engagements.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    title: text('title').notNull(),
    purpose: text('purpose'),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    durationMinutes: integer('duration_minutes'),
    location: text('location'),
    attendees: jsonb('attendees').$type<Array<{ name: string; role?: string; email?: string }>>(),
    notes: text('notes'),
    observations: text('observations'),
    status: interviewStatusEnum('status').notNull().default('scheduled'),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('interviews_engagement_idx').on(t.engagementId)],
);

export const interviewControls = pgTable(
  'interview_controls',
  {
    interviewId: uuid('interview_id')
      .notNull()
      .references(() => interviews.id, { onDelete: 'cascade' }),
    ismControlId: uuid('ism_control_id').notNull().references(() => ismControls.id),
  },
  (t) => [primaryKey({ columns: [t.interviewId, t.ismControlId] })],
);
