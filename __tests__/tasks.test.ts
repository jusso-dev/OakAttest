import { describe, expect, it } from 'vitest';
import { isTaskDueToday, isTaskOverdue, summarizeTasks } from '@/lib/tasks';

describe('task helpers', () => {
  it('summarises task states, priorities, and overdue items', () => {
    const now = new Date(2026, 4, 17, 20, 0, 0);
    const tasks = [
      { status: 'todo', priority: 'high', dueAt: new Date(2026, 4, 16, 9, 0, 0) },
      { status: 'in_progress', priority: 'medium', dueAt: new Date(2026, 4, 17, 9, 0, 0) },
      { status: 'done', priority: 'low', dueAt: new Date(2026, 4, 15, 9, 0, 0) },
      { status: 'blocked', priority: 'critical', dueAt: null },
    ] as const;

    expect(isTaskOverdue(tasks[0], now)).toBe(true);
    expect(isTaskOverdue(tasks[1], now)).toBe(false);
    expect(isTaskDueToday(tasks[1], now)).toBe(true);
    expect(isTaskOverdue(tasks[2], now)).toBe(false);

    const summary = summarizeTasks(tasks, now);
    expect(summary.overdue).toBe(1);
    expect(summary.dueToday).toBe(1);
    expect(summary.byStatus.todo).toBe(1);
    expect(summary.byStatus.in_progress).toBe(1);
    expect(summary.byStatus.done).toBe(1);
    expect(summary.byPriority.critical).toBe(1);
  });
});
