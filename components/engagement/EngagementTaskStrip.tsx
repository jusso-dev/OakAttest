'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, ClipboardList } from 'lucide-react';
import {
  formatTaskDueDate,
  isTaskDueToday,
  isTaskOverdue,
  taskStatusLabel,
  type TaskStatus,
} from '@/lib/tasks';

type EngagementTaskStripTask = {
  id: string;
  title: string;
  status: TaskStatus;
  dueAt: string | null;
  ownerUserId: string | null;
};

export function EngagementTaskStrip({
  engagementId,
  tasks,
  currentUserId,
}: {
  engagementId: string;
  currentUserId: string;
  tasks: EngagementTaskStripTask[];
}) {
  const [collapsed, setCollapsed] = useState(false);
  const storageKey = `oakattest:engagement-task-strip:${engagementId}`;

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setCollapsed(window.localStorage.getItem(storageKey) === 'collapsed');
    });
    return () => window.cancelAnimationFrame(frame);
  }, [storageKey]);

  const stats = useMemo(() => {
    const overdue = tasks.filter((task) => isTaskOverdue(task)).length;
    const dueToday = tasks.filter((task) => isTaskDueToday(task)).length;
    const mine = tasks.filter((task) => task.ownerUserId === currentUserId).length;
    const blocked = tasks.filter((task) => task.status === 'blocked').length;
    const leadTask =
      tasks.find((task) => isTaskOverdue(task)) ??
      tasks.find((task) => isTaskDueToday(task)) ??
      tasks.find((task) => task.ownerUserId === currentUserId) ??
      tasks[0];

    return { overdue, dueToday, mine, blocked, leadTask };
  }, [currentUserId, tasks]);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(storageKey, next ? 'collapsed' : 'expanded');
      return next;
    });
  }

  if (collapsed) {
    return (
      <section className="rounded-lg border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 py-2 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <ClipboardList className="h-4 w-4 shrink-0 text-[var(--oak-shield)]" />
            <p className="truncate text-sm font-medium text-slate-900">
              Tasks: {tasks.length} open, {stats.mine} mine, {stats.dueToday} due today, {stats.overdue} overdue
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href={`/engagements/${engagementId}/tasks`}
              className="inline-flex h-8 items-center justify-center rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-xs font-medium text-slate-800 hover:bg-[var(--oak-mist)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--oak-shield)]"
            >
              Board
            </Link>
            <button
              type="button"
              onClick={toggleCollapsed}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-700 hover:bg-[var(--oak-mist)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--oak-shield)]"
              aria-label="Expand task summary"
              title="Expand task summary"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-[var(--field-border)] bg-[var(--panel-surface)] px-4 py-3 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--oak-mist)] text-[var(--oak-shield)]">
            <ClipboardList className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-950">Tasks</h2>
              <TaskPill label="Open" value={tasks.length} />
              <TaskPill label="Mine" value={stats.mine} />
              <TaskPill label="Due today" value={stats.dueToday} intent={stats.dueToday > 0 ? 'warning' : 'default'} />
              <TaskPill label="Overdue" value={stats.overdue} intent={stats.overdue > 0 ? 'danger' : 'default'} />
              <TaskPill label="Blocked" value={stats.blocked} intent={stats.blocked > 0 ? 'warning' : 'default'} />
            </div>
            {stats.leadTask ? (
              <p className="mt-1 truncate text-sm text-slate-700">
                Next: {stats.leadTask.title} ({taskStatusLabel(stats.leadTask.status)}
                {stats.leadTask.dueAt ? `, due ${formatTaskDueDate(stats.leadTask.dueAt)}` : ''})
              </p>
            ) : (
              <p className="mt-1 text-sm text-slate-600">No open engagement tasks.</p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href={`/engagements/${engagementId}/tasks`}
            className="inline-flex h-9 items-center justify-center rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm font-medium text-slate-800 hover:bg-[var(--oak-mist)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--oak-shield)]"
          >
            Open board
          </Link>
          <button
            type="button"
            onClick={toggleCollapsed}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-700 hover:bg-[var(--oak-mist)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--oak-shield)]"
            aria-label="Collapse task summary"
            title="Collapse task summary"
          >
            <ChevronUp className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  );
}

function TaskPill({
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
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${tone}`}>
      {label} {value}
    </span>
  );
}
