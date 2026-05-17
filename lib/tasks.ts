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

function localDateKey(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function isTaskDueToday(task: { status: TaskStatus; dueAt: Date | string | null }, now = new Date()) {
  if (task.status === 'done' || task.status === 'cancelled' || !task.dueAt) return false;
  return localDateKey(task.dueAt) === localDateKey(now);
}

export function isTaskOverdue(task: { status: TaskStatus; dueAt: Date | string | null }, now = new Date()) {
  if (task.status === 'done' || task.status === 'cancelled' || !task.dueAt) return false;
  const dueDate = localDateKey(task.dueAt);
  const today = localDateKey(now);
  return dueDate !== null && today !== null && dueDate < today;
}

export function formatTaskDueDate(value: Date | string | null) {
  if (!value) return 'No due date';
  return new Intl.DateTimeFormat('en-AU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value));
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
) {
  return tasks.reduce((summary, task) => {
    summary.byStatus[task.status] += 1;
    summary.byPriority[task.priority] += 1;
    if (isTaskOverdue(task, now)) summary.overdue += 1;
    if (isTaskDueToday(task, now)) summary.dueToday += 1;
    return summary;
  }, emptyTaskSummary());
}
