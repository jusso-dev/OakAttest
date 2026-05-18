import Link from 'next/link';
import { redirect } from 'next/navigation';
import { and, asc, desc, eq, inArray, isNull, ne } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { engagements } from '@/db/schema/engagements';
import { engagementTasks } from '@/db/schema/tasks';
import { users } from '@/db/schema/auth';
import { requirePageSession } from '@/lib/auth/session';
import { resolveActiveTenant } from '@/lib/auth/active-tenant';
import { engagementMembers } from '@/db/schema/tenants';
import {
  isTaskDueToday,
  isTaskOverdue,
  formatTaskDueDate,
  taskPriorityLabel,
  taskStatusLabel,
  type TaskPriority,
  type TaskStatus,
} from '@/lib/tasks';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata = { title: 'Dashboard · OakAttest' };

export default async function DashboardPage() {
  const session = await requirePageSession();
  const tenant = await resolveActiveTenant(session.user.id);
  if (!tenant) redirect('/onboarding');

  const rows =
    tenant.access === 'tenant'
      ? await db
          .select({
            id: engagements.id,
            name: engagements.name,
            classification: engagements.classification,
            phase: engagements.phase,
            status: engagements.status,
            reference: engagements.reference,
          })
          .from(engagements)
          .where(
            and(eq(engagements.tenantId, tenant.tenantId), isNull(engagements.deletedAt)),
          )
          .orderBy(engagements.createdAt)
      : await db
          .select({
            id: engagements.id,
            name: engagements.name,
            classification: engagements.classification,
            phase: engagements.phase,
            status: engagements.status,
            reference: engagements.reference,
          })
          .from(engagementMembers)
          .innerJoin(engagements, eq(engagements.id, engagementMembers.engagementId))
          .where(
            and(
              eq(engagementMembers.tenantId, tenant.tenantId),
              eq(engagementMembers.userId, session.user.id),
              isNull(engagementMembers.deletedAt),
              isNull(engagements.deletedAt),
            ),
          )
          .orderBy(engagements.createdAt);

  const total = rows.length;
  const active = rows.filter((row) => row.status === 'active').length;
  const draft = rows.filter((row) => row.status === 'draft').length;
  const onHold = rows.filter((row) => row.status === 'on_hold').length;
  const completed = rows.filter((row) => row.status === 'completed' || row.status === 'archived').length;
  const phases = [
    'scoping',
    'evidence',
    'fieldwork',
    'findings',
    'certification',
    'maintenance',
  ] as const;
  const phaseCounts = phases.map((phase) => ({
    phase,
    count: rows.filter((row) => row.phase === phase).length,
  }));
  const classificationCounts = Array.from(
    rows.reduce((map, row) => {
      map.set(row.classification, (map.get(row.classification) ?? 0) + 1);
      return map;
    }, new Map<string, number>()),
  ).sort((a, b) => b[1] - a[1]);
  const recentRows = rows.slice(-5).reverse();
  const engagementIds = rows.map((row) => row.id);
  const taskRows =
    engagementIds.length > 0
      ? await db
          .select({
            id: engagementTasks.id,
            engagementId: engagementTasks.engagementId,
            title: engagementTasks.title,
            status: engagementTasks.status,
            priority: engagementTasks.priority,
            dueAt: engagementTasks.dueAt,
            ownerUserId: engagementTasks.ownerUserId,
            ownerName: users.name,
            ownerEmail: users.email,
            engagementName: engagements.name,
            engagementReference: engagements.reference,
          })
          .from(engagementTasks)
          .innerJoin(engagements, eq(engagements.id, engagementTasks.engagementId))
          .leftJoin(users, eq(users.id, engagementTasks.ownerUserId))
          .where(
            and(
              eq(engagementTasks.tenantId, tenant.tenantId),
              inArray(engagementTasks.engagementId, engagementIds),
              isNull(engagements.deletedAt),
              ne(engagementTasks.status, 'done'),
              ne(engagementTasks.status, 'cancelled'),
            ),
          )
          .orderBy(asc(engagementTasks.dueAt), desc(engagementTasks.updatedAt))
      : [];
  const overdueTasks = taskRows.filter((task) => isTaskOverdue(task));
  const dueTodayTasks = taskRows.filter((task) => isTaskDueToday(task));
  const myTasks = taskRows.filter((task) => task.ownerUserId === session.user.id);
  const blockedTasks = taskRows.filter((task) => task.status === 'blocked');
  const taskAttention = Array.from(
    new Map(
      [...overdueTasks, ...dueTodayTasks, ...blockedTasks, ...myTasks, ...taskRows].map((task) => [
        task.id,
        task,
      ]),
    ).values(),
  ).slice(0, 6);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase text-slate-600">{tenant.tenantName}</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Engagements</h1>
        </div>
        {tenant.access === 'tenant' && (
          <Link
            href="/engagements/new"
            className="inline-flex h-9 items-center justify-center rounded-md bg-[var(--oak-shield)] px-4 text-sm font-medium text-white transition-colors hover:bg-[var(--oak-shield-hover)]"
          >
            New engagement
          </Link>
        )}
      </header>

      {rows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No engagements yet</CardTitle>
            <CardDescription>
              {tenant.access === 'tenant'
                ? 'An engagement scopes one client system at a single classification. Create your first one to begin the five-phase IRAP lifecycle.'
                : 'You do not have access to any engagements yet. Ask the assessor team for an engagement invitation.'}
            </CardDescription>
          </CardHeader>
          {tenant.access === 'tenant' && (
            <CardContent>
              <Link
                href="/engagements/new"
                className="inline-flex h-9 items-center justify-center rounded-md bg-[var(--oak-shield)] px-4 text-sm font-medium text-white transition-colors hover:bg-[var(--oak-shield-hover)]"
              >
                Start an engagement
              </Link>
            </CardContent>
          )}
        </Card>
      ) : (
        <div className="space-y-6">
          <section className="grid gap-3 md:grid-cols-4">
            <Metric label="Total engagements" value={total} />
            <Metric label="Active" value={active} />
            <Metric label="Draft" value={draft} />
            <Metric label="On hold" value={onHold} />
          </section>

          <Card>
            <CardHeader>
              <CardTitle>Task notifications</CardTitle>
              <CardDescription>
                Open work across the engagements you can access.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <TaskSignal label="My open" value={myTasks.length} />
                <TaskSignal label="Due today" value={dueTodayTasks.length} intent={dueTodayTasks.length > 0 ? 'warning' : 'default'} />
                <TaskSignal label="Overdue" value={overdueTasks.length} intent={overdueTasks.length > 0 ? 'danger' : 'default'} />
                <TaskSignal label="Blocked" value={blockedTasks.length} intent={blockedTasks.length > 0 ? 'warning' : 'default'} />
              </div>
              <div className="space-y-2">
                {taskAttention.map((task) => (
                  <TaskNotificationLink key={task.id} task={task} />
                ))}
                {taskAttention.length === 0 ? (
                  <p className="text-sm text-slate-600">No open tasks need attention.</p>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
            <Card>
              <CardHeader>
                <CardTitle>Engagement workload</CardTitle>
                <CardDescription>
                  Current stage distribution across the engagements you can access.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {phaseCounts.map(({ phase, count }) => (
                  <div key={phase} className="grid grid-cols-[120px_1fr_44px] items-center gap-3 text-sm">
                    <span className="capitalize text-slate-700">{phase.replace('_', ' ')}</span>
                    <div className="h-2 overflow-hidden rounded-full bg-[var(--oak-mist-strong)]">
                      <div
                        className="h-full rounded-full bg-[var(--oak-shield)]"
                        style={{ width: `${total > 0 ? Math.max((count / total) * 100, count > 0 ? 6 : 0) : 0}%` }}
                      />
                    </div>
                    <span className="text-right font-medium text-slate-950">{count}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Portfolio snapshot</CardTitle>
                <CardDescription>
                  Status and classification mix for this workspace.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <StatusCell label="Completed or archived" value={completed} />
                  <StatusCell label="Needs attention" value={onHold + draft} />
                </div>
                <div>
                  <p className="text-xs font-medium uppercase text-slate-600">Classifications</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {classificationCounts.map(([classification, count]) => (
                      <span
                        key={classification}
                        className="rounded-full bg-[var(--oak-mist-strong)] px-2 py-1 text-xs font-medium text-slate-800"
                      >
                        {classification.replace('_', ':')} · {count}
                      </span>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
            <Card>
              <CardHeader>
                <CardTitle>Next attention</CardTitle>
                <CardDescription>Draft and paused engagements to move forward.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {rows
                  .filter((row) => row.status === 'draft' || row.status === 'on_hold')
                  .slice(0, 5)
                  .map((row) => (
                    <EngagementLink key={row.id} row={row} />
                  ))}
                {draft + onHold === 0 && (
                  <p className="text-sm text-slate-600">No draft or paused engagements.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent engagements</CardTitle>
                <CardDescription>Open a workspace and continue the assessment.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {recentRows.map((row) => (
                  <EngagementLink key={row.id} row={row} />
                ))}
              </CardContent>
            </Card>
          </section>
        </div>
      )}
    </div>
  );
}

function TaskSignal({
  label,
  value,
  intent = 'default',
}: {
  label: string;
  value: number;
  intent?: 'default' | 'warning' | 'danger';
}) {
  const tone =
    intent === 'danger'
      ? 'border-red-200 bg-red-50 text-red-800'
      : intent === 'warning'
        ? 'border-amber-200 bg-amber-50 text-amber-900'
        : 'border-[var(--field-border)] bg-[var(--oak-mist)] text-slate-700';

  return (
    <div className={`rounded-md border p-3 ${tone}`}>
      <p className="text-xl font-semibold">{value}</p>
      <p className="mt-1 text-xs font-medium">{label}</p>
    </div>
  );
}

function TaskNotificationLink({
  task,
}: {
  task: {
    id: string;
    engagementId: string;
    title: string;
    status: TaskStatus;
    priority: TaskPriority;
    dueAt: Date | null;
    ownerUserId: string | null;
    ownerName: string | null;
    ownerEmail: string | null;
    engagementName: string;
    engagementReference: string | null;
  };
}) {
  const overdue = isTaskOverdue(task);
  const dueToday = isTaskDueToday(task);

  return (
    <Link
      href={`/engagements/${task.engagementId}/tasks`}
      className="block rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-3 transition-colors hover:border-slate-300 hover:bg-[var(--oak-mist)]"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-900">{task.title}</p>
          <p className="text-xs text-slate-600">
            {task.engagementReference ? `${task.engagementReference} · ` : ''}
            {task.engagementName}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Owner: {task.ownerName || task.ownerEmail || 'Unassigned'}
            {task.dueAt ? ` · Due ${formatTaskDueDate(task.dueAt)}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <span className="rounded-full border border-[var(--field-border)] bg-[var(--oak-mist)] px-2 py-0.5 text-xs font-medium text-slate-700">
            {taskStatusLabel(task.status)}
          </span>
          <span className="rounded-full border border-[var(--field-border)] bg-[var(--panel-surface)] px-2 py-0.5 text-xs font-medium text-slate-700">
            {taskPriorityLabel(task.priority)}
          </span>
          {dueToday ? (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900">
              Due today
            </span>
          ) : null}
          {overdue ? (
            <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-800">
              Overdue
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-4 shadow-sm">
      <p className="text-xs font-medium uppercase text-slate-600">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function StatusCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-[var(--field-border)] bg-[var(--oak-mist)] p-3">
      <p className="text-xl font-semibold text-slate-950">{value}</p>
      <p className="mt-1 text-xs text-slate-600">{label}</p>
    </div>
  );
}

function EngagementLink({
  row,
}: {
  row: {
    id: string;
    name: string;
    classification: string;
    phase: string;
    status: string;
    reference: string | null;
  };
}) {
  return (
    <Link
      href={`/engagements/${row.id}/overview`}
      className="block rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-3 transition-colors hover:border-slate-300 hover:bg-[var(--oak-mist)]"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-900">{row.name}</p>
          <p className="text-xs text-slate-600">
            {row.reference ? `${row.reference} · ` : ''}
            {row.classification.replace('_', ':')} · {row.phase.replace('_', ' ')}
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--oak-mist-strong)]">
            <div
              className="h-full rounded-full bg-[var(--oak-shield)]"
              style={{ width: `${phaseProgress(row.phase)}%` }}
            />
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-[var(--oak-mist-strong)] px-3 py-1 text-xs font-medium text-slate-700">
          {row.status.replace('_', ' ')}
        </span>
      </div>
    </Link>
  );
}

function phaseProgress(phase: string) {
  const order = ['scoping', 'evidence', 'fieldwork', 'findings', 'certification', 'maintenance'];
  const index = order.indexOf(phase);
  return index >= 0 ? ((index + 1) / order.length) * 100 : 0;
}
