'use client';

import { useMemo, useState, useTransition, type FormEvent } from 'react';
import { CheckCircle2, GripVertical, Pencil, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  createEngagementTask,
  updateEngagementTask,
} from '@/app/actions/tasks';
import {
  TASK_BOARD_STATUSES,
  TASK_PRIORITIES,
  TASK_STATUSES,
  formatTaskDueDate,
  isTaskDueToday,
  isTaskOverdue,
  summarizeTasks,
  taskPriorityLabel,
  taskStatusLabel,
  type TaskPriority,
  type TaskStatus,
} from '@/lib/tasks';
import { cn } from '@/lib/utils';

export type EngagementTask = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt: string | null;
  ownerUserId: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  createdAt: string;
};

export type TaskAssignee = {
  userId: string;
  name: string | null;
  email: string;
  role: string;
};

type TaskForm = {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  ownerUserId: string;
  dueDate: string;
};

const emptyForm: TaskForm = {
  title: '',
  description: '',
  status: 'todo',
  priority: 'medium',
  ownerUserId: '',
  dueDate: '',
};

function dueDateInput(value: string | null) {
  return value ? new Date(value).toISOString().slice(0, 10) : '';
}

function formatDate(value: string | null) {
  return formatTaskDueDate(value);
}

function priorityClasses(priority: TaskPriority) {
  switch (priority) {
    case 'critical':
      return 'border-red-200 bg-red-50 text-red-800';
    case 'high':
      return 'border-amber-200 bg-amber-50 text-amber-900';
    case 'medium':
      return 'border-slate-200 bg-slate-100 text-slate-800';
    case 'low':
      return 'border-slate-200 bg-white text-slate-700';
  }
}

function assigneeLabel(assignee: TaskAssignee) {
  return assignee.name?.trim() ? `${assignee.name} (${assignee.email})` : assignee.email;
}

function TaskColumn({
  status,
  tasks,
  canManage,
  movingTaskId,
  editingTaskId,
  editForm,
  assignees,
  onDropTask,
  onBeginEdit,
  onCancelEdit,
  onEditFormChange,
  onSaveEdit,
  onMoveTask,
  onCompleteTask,
}: {
  status: TaskStatus;
  tasks: EngagementTask[];
  canManage: boolean;
  movingTaskId: string | null;
  editingTaskId: string | null;
  editForm: TaskForm | null;
  assignees: TaskAssignee[];
  onDropTask: (taskId: string, status: TaskStatus) => void;
  onBeginEdit: (task: EngagementTask) => void;
  onCancelEdit: () => void;
  onEditFormChange: (form: TaskForm) => void;
  onSaveEdit: (event: FormEvent<HTMLFormElement>) => void;
  onMoveTask: (taskId: string, status: TaskStatus) => void;
  onCompleteTask: (taskId: string) => void;
}) {
  const [isOver, setIsOver] = useState(false);

  return (
    <section
      className={cn(
        'flex max-h-[calc(100dvh-260px)] min-h-[520px] w-[21rem] shrink-0 flex-col overflow-hidden rounded-lg border border-[var(--field-border)] bg-[var(--oak-mist)] shadow-sm transition-colors',
        isOver && 'border-[var(--oak-shield)] bg-[var(--oak-mist-strong)] ring-2 ring-[var(--oak-border)]',
      )}
      onDragOver={(event) => {
        if (!canManage) return;
        event.preventDefault();
        setIsOver(true);
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={(event) => {
        setIsOver(false);
        if (!canManage) return;
        const taskId = event.dataTransfer.getData('text/task-id');
        if (taskId) onDropTask(taskId, status);
      }}
    >
      <header className="border-b border-[var(--field-border)] bg-[var(--panel-surface)] px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-950">{taskStatusLabel(status)}</h3>
          <span className="rounded-full border border-[var(--field-border)] bg-[var(--oak-mist)] px-2 py-0.5 text-xs font-medium text-slate-700">
            {tasks.length}
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-600">{tasks.length === 1 ? '1 task' : `${tasks.length} tasks`}</p>
      </header>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {tasks.length === 0 ? (
          <div className="flex min-h-40 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-[var(--panel-surface)] px-4 py-8 text-center text-xs text-slate-600">
            <p>Drop tasks here</p>
          </div>
        ) : null}
        {tasks.map((task) => {
          if (editingTaskId === task.id && editForm) {
            return (
              <form
                key={task.id}
                className="space-y-3 rounded-lg border border-[var(--oak-border)] bg-[var(--panel-surface)] p-4 shadow-sm"
                onSubmit={onSaveEdit}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-700">Edit task</p>
                  <Button type="button" size="sm" variant="ghost" onClick={onCancelEdit}>
                    <X className="h-3 w-3" />
                    <span className="sr-only">Cancel edit</span>
                  </Button>
                </div>
                <Input
                  value={editForm.title}
                  onChange={(event) => onEditFormChange({ ...editForm, title: event.target.value })}
                  required
                />
                <textarea
                  className="min-h-24 w-full rounded-md border border-slate-300 bg-[var(--panel-surface)] px-3 py-2 text-sm text-slate-950 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--oak-shield)]"
                  value={editForm.description}
                  onChange={(event) =>
                    onEditFormChange({ ...editForm, description: event.target.value })
                  }
                  placeholder="Description"
                />
                <div className="grid gap-2 sm:grid-cols-2">
                  <Select
                    value={editForm.status}
                    onChange={(value) => onEditFormChange({ ...editForm, status: value as TaskStatus })}
                    label="Status"
                  >
                    {TASK_STATUSES.map((option) => (
                      <option key={option} value={option}>
                        {taskStatusLabel(option)}
                      </option>
                    ))}
                  </Select>
                  <Select
                    value={editForm.priority}
                    onChange={(value) =>
                      onEditFormChange({ ...editForm, priority: value as TaskPriority })
                    }
                    label="Priority"
                  >
                    {TASK_PRIORITIES.map((option) => (
                      <option key={option} value={option}>
                        {taskPriorityLabel(option)}
                      </option>
                    ))}
                  </Select>
                </div>
                <Select
                  value={editForm.ownerUserId}
                  onChange={(value) => onEditFormChange({ ...editForm, ownerUserId: value })}
                  label="Assignee"
                >
                  <option value="">Unassigned</option>
                  {assignees.map((assignee) => (
                    <option key={assignee.userId} value={assignee.userId}>
                      {assigneeLabel(assignee)}
                    </option>
                  ))}
                </Select>
                <Input
                  type="date"
                  value={editForm.dueDate}
                  onChange={(event) => onEditFormChange({ ...editForm, dueDate: event.target.value })}
                  aria-label="Due date"
                />
                <Button type="submit" size="sm" variant="primary" className="w-full">
                  Save task
                </Button>
              </form>
            );
          }

          const overdue = isTaskOverdue(task);
          const dueToday = isTaskDueToday(task);
          return (
            <article
              key={task.id}
              draggable={canManage}
              onDragStart={(event) => {
                event.dataTransfer.setData('text/task-id', task.id);
                event.dataTransfer.effectAllowed = 'move';
              }}
              className={cn(
                'rounded-lg border border-[var(--field-border)] bg-[var(--panel-surface)] p-4 shadow-sm transition-shadow hover:shadow-md',
                movingTaskId === task.id && 'opacity-60',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="break-words text-sm font-semibold leading-snug text-slate-950">
                    {task.title}
                  </h3>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        'rounded-full border px-2 py-0.5 text-xs font-medium',
                        priorityClasses(task.priority),
                      )}
                    >
                      {taskPriorityLabel(task.priority)}
                    </span>
                    {overdue ? (
                      <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-800">
                        Overdue
                      </span>
                    ) : null}
                    {dueToday ? (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900">
                        Due today
                      </span>
                    ) : null}
                  </div>
                </div>
                {canManage ? (
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => onBeginEdit(task)}
                      aria-label={`Edit ${task.title}`}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <span
                      className="inline-flex h-8 w-8 cursor-grab items-center justify-center rounded-md text-slate-500 hover:bg-[var(--oak-mist)]"
                      title="Drag to move"
                    >
                      <GripVertical className="h-4 w-4" />
                    </span>
                  </div>
                ) : null}
              </div>
              <p className="mt-3 line-clamp-4 break-words text-sm leading-5 text-slate-700">
                {task.description || 'No description'}
              </p>
              <dl className="mt-4 space-y-1.5 text-xs text-slate-600">
                <div className="flex justify-between gap-3">
                  <dt>Due</dt>
                  <dd className={overdue ? 'font-medium text-red-700' : 'text-slate-700'}>
                    {formatDate(task.dueAt)}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Owner</dt>
                  <dd className="truncate text-slate-700">
                    {task.ownerName || task.ownerEmail || 'Unassigned'}
                  </dd>
                </div>
              </dl>
              {canManage ? (
                <div className="mt-4 grid gap-2">
                  <Select
                    value={task.status}
                    onChange={(value) => onMoveTask(task.id, value as TaskStatus)}
                    label={`Move ${task.title}`}
                  >
                    {TASK_STATUSES.map((option) => (
                      <option key={option} value={option}>
                        {taskStatusLabel(option)}
                      </option>
                    ))}
                  </Select>
                  {task.status !== 'done' ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => onCompleteTask(task.id)}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Complete
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function Select({
  value,
  onChange,
  label,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1 text-xs font-medium text-slate-700">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 rounded-md border border-slate-300 bg-[var(--panel-surface)] px-3 text-sm text-slate-950 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--oak-shield)]"
      >
        {children}
      </select>
    </label>
  );
}

export function TaskBoard({
  engagementId,
  initialTasks,
  assignees,
  canManage,
}: {
  engagementId: string;
  initialTasks: EngagementTask[];
  assignees: TaskAssignee[];
  canManage: boolean;
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [form, setForm] = useState<TaskForm>(emptyForm);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<TaskForm | null>(null);
  const [movingTaskId, setMovingTaskId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const summary = useMemo(() => summarizeTasks(tasks), [tasks]);
  const tasksByStatus = useMemo(
    () =>
      TASK_BOARD_STATUSES.reduce(
        (grouped, status) => {
          grouped[status] = tasks.filter((task) => task.status === status);
          return grouped;
        },
        {} as Record<(typeof TASK_BOARD_STATUSES)[number], EngagementTask[]>,
      ),
    [tasks],
  );

  function optimisticPatch(taskId: string, patch: Partial<EngagementTask>) {
    const previous = tasks;
    setTasks((current) =>
      current.map((task) => (task.id === taskId ? { ...task, ...patch } : task)),
    );
    return previous;
  }

  function moveTask(taskId: string, status: TaskStatus) {
    const task = tasks.find((item) => item.id === taskId);
    if (!task || task.status === status || movingTaskId) return;

    const previous = optimisticPatch(taskId, { status });
    setMovingTaskId(taskId);
    setMessage(null);
    startTransition(async () => {
      try {
        await updateEngagementTask({ engagementId, taskId, status });
        setMessage(`${task.title} moved to ${taskStatusLabel(status)}.`);
      } catch (error) {
        setTasks(previous);
        setMessage(error instanceof Error ? error.message : 'Failed to move task.');
      } finally {
        setMovingTaskId(null);
      }
    });
  }

  function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      try {
        await createEngagementTask({
          engagementId,
          title: form.title,
          description: form.description || null,
          status: form.status,
          priority: form.priority,
          ownerUserId: form.ownerUserId || null,
          dueDate: form.dueDate || null,
        });
        setForm(emptyForm);
        setMessage('Task created. Refreshing the board will show server ordering.');
        window.location.reload();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Failed to create task.');
      }
    });
  }

  function beginEdit(task: EngagementTask) {
    setEditingTaskId(task.id);
    setEditForm({
      title: task.title,
      description: task.description ?? '',
      status: task.status,
      priority: task.priority,
      ownerUserId: task.ownerUserId ?? '',
      dueDate: dueDateInput(task.dueAt),
    });
  }

  function cancelEdit() {
    setEditingTaskId(null);
    setEditForm(null);
  }

  function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingTaskId || !editForm) return;
    setMessage(null);
    startTransition(async () => {
      try {
        await updateEngagementTask({
          engagementId,
          taskId: editingTaskId,
          title: editForm.title,
          description: editForm.description || null,
          status: editForm.status,
          priority: editForm.priority,
          ownerUserId: editForm.ownerUserId || null,
          dueDate: editForm.dueDate || null,
        });
        window.location.reload();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Failed to update task.');
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        {TASK_BOARD_STATUSES.map((status) => (
          <Card key={status}>
            <CardContent className="p-5">
              <p className="text-sm text-slate-600">{taskStatusLabel(status)}</p>
              <p className="mt-2 text-3xl font-semibold text-slate-950">
                {summary.byStatus[status]}
              </p>
            </CardContent>
          </Card>
        ))}
        <Card className={summary.overdue > 0 ? 'border-amber-200 bg-amber-50' : ''}>
          <CardContent className="p-5">
            <p className="text-sm text-slate-600">Overdue</p>
            <p className="mt-2 text-3xl font-semibold text-slate-950">{summary.overdue}</p>
          </CardContent>
        </Card>
        <Card className={summary.dueToday > 0 ? 'border-amber-200 bg-amber-50' : ''}>
          <CardContent className="p-5">
            <p className="text-sm text-slate-600">Due today</p>
            <p className="mt-2 text-3xl font-semibold text-slate-950">{summary.dueToday}</p>
          </CardContent>
        </Card>
      </div>

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>Add task</CardTitle>
            <CardDescription>
              Capture assessment work, assign it to an engagement member, and track the due date.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_180px] lg:items-end" onSubmit={createTask}>
              <div className="space-y-3 lg:col-span-3">
                <Input
                  placeholder="Task title"
                  value={form.title}
                  onChange={(event) => setForm({ ...form, title: event.target.value })}
                  required
                />
                <textarea
                  className="min-h-24 w-full rounded-md border border-slate-300 bg-[var(--panel-surface)] px-3 py-2 text-sm text-slate-950 shadow-sm placeholder:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--oak-shield)]"
                  placeholder="Description"
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                />
              </div>
              <Select
                value={form.ownerUserId}
                onChange={(value) => setForm({ ...form, ownerUserId: value })}
                label="Assignee"
              >
                <option value="">Unassigned</option>
                {assignees.map((assignee) => (
                  <option key={assignee.userId} value={assignee.userId}>
                    {assigneeLabel(assignee)}
                  </option>
                ))}
              </Select>
              <Select
                value={form.priority}
                onChange={(value) => setForm({ ...form, priority: value as TaskPriority })}
                label="Priority"
              >
                {TASK_PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {taskPriorityLabel(priority)}
                  </option>
                ))}
              </Select>
              <Input
                type="date"
                value={form.dueDate}
                onChange={(event) => setForm({ ...form, dueDate: event.target.value })}
                aria-label="Due date"
              />
              <div className="lg:col-span-3">
                <Button type="submit" variant="primary" disabled={isPending}>
                  <Plus className="h-4 w-4" />
                  Add task
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {message ? (
        <p className="rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 py-2 text-sm text-slate-700">
          {message}
        </p>
      ) : null}

      <div className="rounded-lg border border-[var(--field-border)] bg-[var(--panel-surface)] p-3 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3 px-1">
          <div>
            <h3 className="text-sm font-semibold text-slate-950">Board view</h3>
            <p className="text-xs text-slate-600">Drag tasks between lanes or use the status menu on each card.</p>
          </div>
          <span className="hidden rounded-full bg-[var(--oak-mist)] px-2.5 py-1 text-xs font-medium text-slate-700 sm:inline-flex">
            {tasks.length} total
          </span>
        </div>
        <div className="overflow-x-auto pb-2">
          <div className="flex min-w-max gap-4">
            {TASK_BOARD_STATUSES.map((status) => (
              <TaskColumn
                key={status}
                status={status}
                tasks={tasksByStatus[status]}
                canManage={canManage}
                movingTaskId={movingTaskId}
                editingTaskId={editingTaskId}
                editForm={editForm}
                assignees={assignees}
                onDropTask={moveTask}
                onBeginEdit={beginEdit}
                onCancelEdit={cancelEdit}
                onEditFormChange={setEditForm}
                onSaveEdit={saveEdit}
                onMoveTask={moveTask}
                onCompleteTask={(taskId) => moveTask(taskId, 'done')}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
