import { describe, expect, it } from 'vitest';
import { isTaskDueToday, isTaskOverdue, summarizeTasks } from '@/lib/tasks';

describe('task helpers', () => {
  it('summarises task states, priorities, and overdue items', () => {
    const timeZone = 'Australia/Sydney';
    const now = new Date('2026-05-17T10:00:00.000Z');
    const tasks = [
      { status: 'todo', priority: 'high', dueAt: new Date('2026-05-15T23:00:00.000Z') },
      { status: 'in_progress', priority: 'medium', dueAt: new Date('2026-05-16T23:00:00.000Z') },
      { status: 'done', priority: 'low', dueAt: new Date('2026-05-14T23:00:00.000Z') },
      { status: 'blocked', priority: 'critical', dueAt: null },
    ] as const;

    expect(isTaskOverdue(tasks[0], now, timeZone)).toBe(true);
    expect(isTaskOverdue(tasks[1], now, timeZone)).toBe(false);
    expect(isTaskDueToday(tasks[1], now, timeZone)).toBe(true);
    expect(isTaskOverdue(tasks[2], now, timeZone)).toBe(false);

    const summary = summarizeTasks(tasks, now, timeZone);
    expect(summary.overdue).toBe(1);
    expect(summary.dueToday).toBe(1);
    expect(summary.byStatus.todo).toBe(1);
    expect(summary.byStatus.in_progress).toBe(1);
    expect(summary.byStatus.done).toBe(1);
    expect(summary.byPriority.critical).toBe(1);
  });

  it('evaluates deadline dates in the selected user timezone', () => {
    const task = { status: 'todo' as const, priority: 'high' as const, dueAt: '2026-05-17T23:30:00.000Z' };
    const now = new Date('2026-05-18T10:00:00.000Z');

    expect(isTaskDueToday(task, now, 'Australia/Sydney')).toBe(true);
    expect(isTaskOverdue(task, now, 'America/Los_Angeles')).toBe(true);
  });
});
