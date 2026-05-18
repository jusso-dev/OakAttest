import Link from 'next/link';
import { asc, desc, eq, and, isNull } from 'drizzle-orm';
import { ArrowLeft, ClipboardList } from 'lucide-react';
import { db } from '@/lib/db/client';
import { engagementTasks } from '@/db/schema/tasks';
import { engagements } from '@/db/schema/engagements';
import { engagementMembers } from '@/db/schema/tenants';
import { users } from '@/db/schema/auth';
import { requirePageSession } from '@/lib/auth/session';
import { requirePermission, rolesForUser } from '@/lib/rbac/require';
import { ACTIONS, isPermitted } from '@/lib/rbac/matrix';
import { TaskBoard, type EngagementTask, type TaskAssignee } from '@/components/engagement/TaskBoard';

export default async function EngagementTasksPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requirePageSession();

  const [engagement] = await db
    .select({ tenantId: engagements.tenantId })
    .from(engagements)
    .where(
      and(
        eq(engagements.id, id),
        isNull(engagements.deletedAt),
      ),
    )
    .limit(1);

  const tenantId = engagement?.tenantId;
  if (!tenantId) {
    throw new Error('Engagement membership not found');
  }

  await requirePermission(ACTIONS.taskView, {
    userId: session.user.id,
    tenantId,
    engagementId: id,
  });
  const roles = await rolesForUser({
    userId: session.user.id,
    tenantId,
    engagementId: id,
  });
  const canManage = roles.some((role) => isPermitted(ACTIONS.taskManage, role));

  const rows = await db
    .select({
      id: engagementTasks.id,
      title: engagementTasks.title,
      description: engagementTasks.description,
      status: engagementTasks.status,
      priority: engagementTasks.priority,
      dueAt: engagementTasks.dueAt,
      ownerUserId: engagementTasks.ownerUserId,
      ownerName: users.name,
      ownerEmail: users.email,
      createdAt: engagementTasks.createdAt,
    })
    .from(engagementTasks)
    .leftJoin(users, eq(users.id, engagementTasks.ownerUserId))
    .where(eq(engagementTasks.engagementId, id))
    .orderBy(asc(engagementTasks.status), asc(engagementTasks.dueAt), desc(engagementTasks.createdAt));

  const assignees: TaskAssignee[] = await db
    .select({
      userId: engagementMembers.userId,
      name: users.name,
      email: users.email,
      role: engagementMembers.role,
    })
    .from(engagementMembers)
    .innerJoin(users, eq(users.id, engagementMembers.userId))
    .where(and(eq(engagementMembers.engagementId, id), isNull(engagementMembers.deletedAt)))
    .orderBy(users.email);

  const tasks: EngagementTask[] = rows.map((task) => ({
    ...task,
    dueAt: task.dueAt?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-[var(--oak-shield)]">
            <ClipboardList className="h-4 w-4" />
            Engagement tasks
          </div>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">Task board</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-700">
            Assign assessment work to engagement members and move tasks between states as
            scoping, evidence, fieldwork, findings, and certification work progresses.
          </p>
        </div>
        <Link
          href={`/engagements/${id}/scope`}
          className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm font-medium text-slate-800 hover:bg-[var(--oak-mist)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--oak-shield)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Continue scoping
        </Link>
      </header>
      <TaskBoard
        engagementId={id}
        initialTasks={tasks}
        assignees={assignees}
        canManage={canManage}
      />
    </div>
  );
}
