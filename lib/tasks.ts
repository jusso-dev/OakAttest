import { DEFAULT_TIME_ZONE, formatDate, formatDateInput } from '@/lib/timezone';

export const TASK_BOARD_STATUSES = ['todo', 'in_progress', 'blocked', 'done'] as const;
export const TASK_STATUSES = [...TASK_BOARD_STATUSES, 'cancelled'] as const;
export const TASK_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export function taskStatusLabel(status: TaskStatus) {
  switch (status) {
    case 'todo':
      return 'To do';
    case 'in_progress':
      return 'In progress';
    case 'blocked':
      return 'Blocked';
    case 'done':
      return 'Done';
    case 'cancelled':
      return 'Cancelled';
  }
}

export function taskPriorityLabel(priority: TaskPriority) {
  switch (priority) {
    case 'low':
      return 'Low';
    case 'medium':
      return 'Medium';
    case 'high':
      return 'High';
    case 'critical':
      return 'Critical';
  }
}

function localDateKey(value: Date | string, timeZone: string) {
  try {
    return formatDateInput(value, timeZone);
  } catch {
    return null;
  }
}

export function isTaskDueToday(
  task: { status: TaskStatus; dueAt: Date | string | null },
  now = new Date(),
  timeZone = DEFAULT_TIME_ZONE,
) {
  if (task.status === 'done' || task.status === 'cancelled' || !task.dueAt) return false;
  return localDateKey(task.dueAt, timeZone) === localDateKey(now, timeZone);
}

export function isTaskOverdue(
  task: { status: TaskStatus; dueAt: Date | string | null },
  now = new Date(),
  timeZone = DEFAULT_TIME_ZONE,
) {
  if (task.status === 'done' || task.status === 'cancelled' || !task.dueAt) return false;
  const dueDate = localDateKey(task.dueAt, timeZone);
  const today = localDateKey(now, timeZone);
  return dueDate !== null && today !== null && dueDate < today;
}

export function formatTaskDueDate(value: Date | string | null, timeZone = DEFAULT_TIME_ZONE) {
  if (!value) return 'No due date';
  return formatDate(value, timeZone);
}

export function emptyTaskSummary() {
  return {
    overdue: 0,
    dueToday: 0,
    byStatus: {
      todo: 0,
      in_progress: 0,
      blocked: 0,
      done: 0,
      cancelled: 0,
    } satisfies Record<TaskStatus, number>,
    byPriority: {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    } satisfies Record<TaskPriority, number>,
  };
}

export function summarizeTasks<T extends { status: TaskStatus; priority: TaskPriority; dueAt: Date | string | null }>(
  tasks: readonly T[],
  now = new Date(),
  timeZone = DEFAULT_TIME_ZONE,
) {
  return tasks.reduce((summary, task) => {
    summary.byStatus[task.status] += 1;
    summary.byPriority[task.priority] += 1;
    if (isTaskOverdue(task, now, timeZone)) summary.overdue += 1;
    if (isTaskDueToday(task, now, timeZone)) summary.dueToday += 1;
    return summary;
  }, emptyTaskSummary());
}
