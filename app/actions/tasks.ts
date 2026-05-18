'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { and, eq, isNull, ne } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { engagementTasks } from '@/db/schema/tasks';
import { engagements } from '@/db/schema/engagements';
import { engagementMembers } from '@/db/schema/tenants';
import { auditLog } from '@/db/schema/audit';
import { requireSession } from '@/lib/auth/session';
import { requirePermission } from '@/lib/rbac/require';
import { ACTIONS } from '@/lib/rbac/matrix';
import { TASK_PRIORITIES, TASK_STATUSES } from '@/lib/tasks';

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .nullable();

const createTaskSchema = z.object({
  engagementId: z.string().uuid(),
  title: z.string().trim().min(2).max(220),
  description: z.string().trim().max(4000).optional().nullable(),
  status: z.enum(TASK_STATUSES).default('todo'),
  priority: z.enum(TASK_PRIORITIES).default('medium'),
  ownerUserId: z.string().uuid().optional().nullable(),
  dueDate: dateString,
});

const updateTaskSchema = z.object({
  taskId: z.string().uuid(),
  engagementId: z.string().uuid(),
  title: z.string().trim().min(2).max(220).optional(),
  description: z.string().trim().max(4000).optional().nullable(),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  ownerUserId: z.string().uuid().optional().nullable(),
  dueDate: dateString,
});

async function engagementTenant(engagementId: string) {
  const [row] = await db
    .select({ tenantId: engagements.tenantId })
    .from(engagements)
    .where(and(eq(engagements.id, engagementId), isNull(engagements.deletedAt)))
    .limit(1);
  if (!row) throw new Error('Engagement not found');
  return row.tenantId;
}

function parseDueDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(`${value}T09:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) throw new Error('Invalid due date');
  return parsed;
}

async function assertAssignableUser(input: {
  tenantId: string;
  engagementId: string;
  ownerUserId?: string | null;
}) {
  if (!input.ownerUserId) return;
  const [member] = await db
    .select({ id: engagementMembers.id })
    .from(engagementMembers)
    .where(
      and(
        eq(engagementMembers.tenantId, input.tenantId),
        eq(engagementMembers.engagementId, input.engagementId),
        eq(engagementMembers.userId, input.ownerUserId),
        isNull(engagementMembers.deletedAt),
      ),
    )
    .limit(1);
  if (!member) throw new Error('Assignee must be a member of this engagement');
}

export async function createEngagementTask(input: z.infer<typeof createTaskSchema>) {
  const session = await requireSession();
  const data = createTaskSchema.parse(input);
  const tenantId = await engagementTenant(data.engagementId);

  await requirePermission(ACTIONS.taskManage, {
    userId: session.user.id,
    tenantId,
    engagementId: data.engagementId,
  });
  await assertAssignableUser({
    tenantId,
    engagementId: data.engagementId,
    ownerUserId: data.ownerUserId,
  });

  const dueAt = parseDueDate(data.dueDate);
  const [task] = await db
    .insert(engagementTasks)
    .values({
      engagementId: data.engagementId,
      tenantId,
      title: data.title,
      description: data.description || null,
      status: data.status,
      priority: data.priority,
      ownerUserId: data.ownerUserId || null,
      dueAt,
      createdBy: session.user.id,
      completedBy: data.status === 'done' ? session.user.id : null,
      completedAt: data.status === 'done' ? new Date() : null,
      cancelledAt: data.status === 'cancelled' ? new Date() : null,
    })
    .returning();

  await db.insert(auditLog).values({
    tenantId,
    engagementId: data.engagementId,
    actorUserId: session.user.id,
    action: 'task.create',
    resourceType: 'engagement_task',
    resourceId: task.id,
    afterJson: {
      title: task.title,
      status: task.status,
      priority: task.priority,
      ownerUserId: task.ownerUserId,
    } as never,
  });

  revalidateTaskSurfaces(data.engagementId);
  return { taskId: task.id };
}

export async function updateEngagementTask(input: z.infer<typeof updateTaskSchema>) {
  const session = await requireSession();
  const data = updateTaskSchema.parse(input);
  const tenantId = await engagementTenant(data.engagementId);

  await requirePermission(ACTIONS.taskManage, {
    userId: session.user.id,
    tenantId,
    engagementId: data.engagementId,
  });
  await assertAssignableUser({
    tenantId,
    engagementId: data.engagementId,
    ownerUserId: data.ownerUserId,
  });

  const [existing] = await db
    .select()
    .from(engagementTasks)
    .where(
      and(
        eq(engagementTasks.id, data.taskId),
        eq(engagementTasks.engagementId, data.engagementId),
        eq(engagementTasks.tenantId, tenantId),
      ),
    )
    .limit(1);
  if (!existing) throw new Error('Task not found');

  const nextStatus = data.status ?? existing.status;
  const update: Partial<typeof engagementTasks.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (data.title !== undefined) update.title = data.title;
  if (data.description !== undefined) update.description = data.description || null;
  if (data.status !== undefined) {
    update.status = data.status;
    update.completedAt = nextStatus === 'done' ? (existing.completedAt ?? new Date()) : null;
    update.completedBy = nextStatus === 'done' ? (existing.completedBy ?? session.user.id) : null;
    update.cancelledAt = nextStatus === 'cancelled' ? (existing.cancelledAt ?? new Date()) : null;
  }
  if (data.priority !== undefined) update.priority = data.priority;
  if (data.ownerUserId !== undefined) update.ownerUserId = data.ownerUserId || null;
  if (data.dueDate !== undefined) update.dueAt = parseDueDate(data.dueDate);

  const [task] = await db
    .update(engagementTasks)
    .set(update)
    .where(
      and(
        eq(engagementTasks.id, data.taskId),
        eq(engagementTasks.tenantId, tenantId),
        eq(engagementTasks.engagementId, data.engagementId),
      ),
    )
    .returning();

  await db.insert(auditLog).values({
    tenantId,
    engagementId: data.engagementId,
    actorUserId: session.user.id,
    action: 'task.update',
    resourceType: 'engagement_task',
    resourceId: data.taskId,
    beforeJson: {
      title: existing.title,
      status: existing.status,
      priority: existing.priority,
      ownerUserId: existing.ownerUserId,
      dueAt: existing.dueAt?.toISOString() ?? null,
    } as never,
    afterJson: {
      title: task.title,
      status: task.status,
      priority: task.priority,
      ownerUserId: task.ownerUserId,
      dueAt: task.dueAt?.toISOString() ?? null,
    } as never,
  });

  revalidateTaskSurfaces(data.engagementId);
  return { taskId: task.id };
}

const reassessmentTaskSchema = z.object({
  engagementId: z.string().uuid(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function createReassessmentTask(input: z.infer<typeof reassessmentTaskSchema>) {
  const session = await requireSession();
  const data = reassessmentTaskSchema.parse(input);
  const tenantId = await engagementTenant(data.engagementId);

  await requirePermission(ACTIONS.taskManage, {
    userId: session.user.id,
    tenantId,
    engagementId: data.engagementId,
  });

  const dueAt = parseDueDate(data.dueDate);
  const [existing] = await db
    .select({ id: engagementTasks.id })
    .from(engagementTasks)
    .where(
      and(
        eq(engagementTasks.tenantId, tenantId),
        eq(engagementTasks.engagementId, data.engagementId),
        eq(engagementTasks.title, 'Plan reassessment'),
        ne(engagementTasks.status, 'done'),
        ne(engagementTasks.status, 'cancelled'),
      ),
    )
    .limit(1);
  if (existing) return { taskId: existing.id };

  const [lead] = await db
    .select({ userId: engagementMembers.userId })
    .from(engagementMembers)
    .where(
      and(
        eq(engagementMembers.tenantId, tenantId),
        eq(engagementMembers.engagementId, data.engagementId),
        eq(engagementMembers.role, 'lead_assessor'),
        isNull(engagementMembers.deletedAt),
      ),
    )
    .limit(1);

  return createEngagementTask({
    engagementId: data.engagementId,
    title: 'Plan reassessment',
    description: 'Review assessment scope, latest ISM release, evidence freshness, material system changes, and open findings before reassessment.',
    priority: 'high',
    status: 'todo',
    ownerUserId: lead?.userId ?? null,
    dueDate: dueAt?.toISOString().slice(0, 10) ?? data.dueDate,
  });
}

function revalidateTaskSurfaces(engagementId: string) {
  revalidatePath('/dashboard');
  revalidatePath(`/engagements/${engagementId}/tasks`);
  revalidatePath(`/engagements/${engagementId}/overview`);
}

export type CreateEngagementTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateEngagementTaskInput = z.infer<typeof updateTaskSchema>;
