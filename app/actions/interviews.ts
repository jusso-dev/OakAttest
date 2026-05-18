'use server';

import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import crypto from 'node:crypto';
import { db } from '@/lib/db/client';
import { interviews, interviewControls } from '@/db/schema/interviews';
import { engagements } from '@/db/schema/engagements';
import { auditLog } from '@/db/schema/audit';
import { requireSession } from '@/lib/auth/session';
import { requirePermission } from '@/lib/rbac/require';
import { ACTIONS } from '@/lib/rbac/matrix';

async function tenantForEngagement(engagementId: string): Promise<string> {
  const [row] = await db
    .select({ tenantId: engagements.tenantId })
    .from(engagements)
    .where(eq(engagements.id, engagementId))
    .limit(1);
  if (!row) throw new Error('Engagement not found');
  return row.tenantId;
}

const createSchema = z.object({
  engagementId: z.string().uuid(),
  title: z.string().min(2).max(200),
  purpose: z.string().max(2000).optional(),
  scheduledAt: z.string().datetime().optional(),
  durationMinutes: z.number().int().min(5).max(480).optional(),
  location: z.string().max(200).optional(),
  attendees: z
    .array(
      z.object({
        name: z.string().min(1),
        role: z.string().optional(),
        email: z.string().email().optional(),
      }),
    )
    .optional(),
  ismControlIds: z.array(z.string().uuid()).optional(),
});

export async function createInterview(input: z.infer<typeof createSchema>) {
  const session = await requireSession();
  const data = createSchema.parse(input);
  const tenantId = await tenantForEngagement(data.engagementId);

  await requirePermission(ACTIONS.findingCreate, {
    userId: session.user.id,
    tenantId,
    engagementId: data.engagementId,
  });

  const id = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(interviews).values({
      id,
      engagementId: data.engagementId,
      tenantId,
      title: data.title,
      purpose: data.purpose ?? null,
      scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
      durationMinutes: data.durationMinutes ?? null,
      location: data.location ?? null,
      attendees: data.attendees ?? null,
      createdBy: session.user.id,
    });
    if (data.ismControlIds?.length) {
      await tx.insert(interviewControls).values(
        data.ismControlIds.map((cid) => ({ interviewId: id, ismControlId: cid })),
      );
    }
    await tx.insert(auditLog).values({
      tenantId,
      engagementId: data.engagementId,
      actorUserId: session.user.id,
      action: 'interview.create',
      resourceType: 'interview',
      resourceId: id,
      afterJson: { title: data.title } as never,
    });
  });

  revalidatePath(`/engagements/${data.engagementId}/fieldwork`);
  return { id };
}

const recordSchema = z.object({
  engagementId: z.string().uuid(),
  interviewId: z.string().uuid(),
  notes: z.string().max(20000).optional(),
  observations: z.string().max(20000).optional(),
  status: z.enum(['scheduled', 'completed', 'cancelled']).optional(),
});

export async function recordInterview(input: z.infer<typeof recordSchema>) {
  const session = await requireSession();
  const data = recordSchema.parse(input);
  const tenantId = await tenantForEngagement(data.engagementId);

  await requirePermission(ACTIONS.findingUpdate, {
    userId: session.user.id,
    tenantId,
    engagementId: data.engagementId,
  });

  await db.transaction(async (tx) => {
    await tx
      .update(interviews)
      .set({
        notes: data.notes ?? null,
        observations: data.observations ?? null,
        status: data.status ?? 'completed',
        updatedAt: new Date(),
      })
      .where(
        and(eq(interviews.id, data.interviewId), eq(interviews.engagementId, data.engagementId)),
      );
    await tx.insert(auditLog).values({
      tenantId,
      engagementId: data.engagementId,
      actorUserId: session.user.id,
      action: 'interview.record',
      resourceType: 'interview',
      resourceId: data.interviewId,
    });
  });

  revalidatePath(`/engagements/${data.engagementId}/fieldwork`);
  return { ok: true };
}

// Calendar export for an interview as ICS text. Pure function returning the
// payload — the route renders it with the appropriate Content-Type.
export async function generateInterviewIcs(opts: {
  engagementId: string;
  interviewId: string;
}): Promise<string> {
  const session = await requireSession();
  const tenantId = await tenantForEngagement(opts.engagementId);
  await requirePermission(ACTIONS.engagementView, {
    userId: session.user.id,
    tenantId,
    engagementId: opts.engagementId,
  });

  const [i] = await db
    .select()
    .from(interviews)
    .where(and(eq(interviews.id, opts.interviewId), eq(interviews.engagementId, opts.engagementId)))
    .limit(1);
  if (!i || i.engagementId !== opts.engagementId) throw new Error('Interview not found');

  const dt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const start = i.scheduledAt ?? new Date();
  const end = new Date(start.getTime() + (i.durationMinutes ?? 60) * 60000);

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//OakAttest//EN',
    'BEGIN:VEVENT',
    `UID:${i.id}@oakattest`,
    `DTSTAMP:${dt(new Date())}`,
    `DTSTART:${dt(start)}`,
    `DTEND:${dt(end)}`,
    `SUMMARY:${i.title.replace(/\n/g, ' ')}`,
    `DESCRIPTION:${(i.purpose ?? '').replace(/\n/g, '\\n')}`,
    i.location ? `LOCATION:${i.location}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n');
}
