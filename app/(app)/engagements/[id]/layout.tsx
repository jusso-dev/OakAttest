import { notFound, redirect } from 'next/navigation';
import { and, asc, eq, isNull, ne } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { engagements } from '@/db/schema/engagements';
import { engagementTasks } from '@/db/schema/tasks';
import { getSession } from '@/lib/auth/session';
import { resolveActiveTenant } from '@/lib/auth/active-tenant';
import { requirePermission, PermissionDeniedError, rolesForUser } from '@/lib/rbac/require';
import { ACTIONS, isPermitted } from '@/lib/rbac/matrix';
import { PhaseStepper, type Phase } from '@/components/engagement/PhaseStepper';
import { UnsavedChangesProvider } from '@/components/engagement/UnsavedChangesGuard';
import { EngagementStateControl } from '@/components/engagement/EngagementStateControl';
import { EngagementTaskStrip } from '@/components/engagement/EngagementTaskStrip';

export default async function EngagementLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/signin');

  const { id } = await params;
  const tenant = await resolveActiveTenant(session.user.id);
  if (!tenant) redirect('/onboarding');

  const [row] = await db
    .select({
      id: engagements.id,
      tenantId: engagements.tenantId,
      name: engagements.name,
      reference: engagements.reference,
      classification: engagements.classification,
      phase: engagements.phase,
      status: engagements.status,
    })
    .from(engagements)
    .where(and(eq(engagements.id, id), isNull(engagements.deletedAt)))
    .limit(1);

  if (!row) notFound();

  // Critical isolation: never trust the URL. The engagement must belong to
  // the user's active tenant and the user must have a role on it.
  if (row.tenantId !== tenant.tenantId) notFound();

  try {
    await requirePermission(ACTIONS.engagementView, {
      userId: session.user.id,
      tenantId: tenant.tenantId,
      engagementId: id,
    });
  } catch (err) {
    if (err instanceof PermissionDeniedError) notFound();
    throw err;
  }

  const roles = await rolesForUser({
    userId: session.user.id,
    tenantId: tenant.tenantId,
    engagementId: id,
  });
  const canUpdateState = roles.some((role) => isPermitted(ACTIONS.engagementUpdate, role));
  const canViewTasks = roles.some((role) => isPermitted(ACTIONS.taskView, role));
  const openTasks = canViewTasks
    ? await db
        .select({
          id: engagementTasks.id,
          title: engagementTasks.title,
          status: engagementTasks.status,
          dueAt: engagementTasks.dueAt,
          ownerUserId: engagementTasks.ownerUserId,
        })
        .from(engagementTasks)
        .where(
          and(
            eq(engagementTasks.engagementId, id),
            ne(engagementTasks.status, 'done'),
            ne(engagementTasks.status, 'cancelled'),
          ),
        )
        .orderBy(asc(engagementTasks.dueAt), asc(engagementTasks.createdAt))
    : [];
  const clientTasks = openTasks.map((task) => ({
    ...task,
    dueAt: task.dueAt?.toISOString() ?? null,
  }));

  return (
    <UnsavedChangesProvider>
      <div className="mx-auto w-full max-w-[96rem] space-y-6">
        <header className="space-y-2">
          <p className="text-xs uppercase text-slate-600">
            {row.reference ?? 'Engagement'} ·{' '}
            <span className="text-slate-700">{row.classification.replace('_', ':')}</span>
          </p>
          <h1 className="text-2xl font-semibold text-slate-900">{row.name}</h1>
        </header>
        <EngagementStateControl
          engagementId={row.id}
          currentPhase={row.phase as Phase}
          currentStatus={row.status}
          canEdit={canUpdateState}
        />
        <PhaseStepper engagementId={row.id} currentPhase={row.phase as Phase} />
        <div>
          <a
            href={`/engagements/${row.id}/coverage`}
            className="inline-flex h-8 items-center rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm font-medium text-slate-900 hover:bg-[var(--oak-mist)]"
          >
            Assessment coverage
          </a>
        </div>
        {canViewTasks ? (
          <EngagementTaskStrip
            engagementId={row.id}
            tasks={clientTasks}
            currentUserId={session.user.id}
          />
        ) : null}
        {children}
      </div>
    </UnsavedChangesProvider>
  );
}
