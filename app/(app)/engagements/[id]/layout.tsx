import { notFound, redirect } from 'next/navigation';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { engagements } from '@/db/schema/engagements';
import { getSession } from '@/lib/auth/session';
import { resolveActiveTenant } from '@/lib/auth/active-tenant';
import { requirePermission, PermissionDeniedError, rolesForUser } from '@/lib/rbac/require';
import { ACTIONS, isPermitted } from '@/lib/rbac/matrix';
import { PhaseStepper, type Phase } from '@/components/engagement/PhaseStepper';
import { UnsavedChangesProvider } from '@/components/engagement/UnsavedChangesGuard';
import { EngagementStateControl } from '@/components/engagement/EngagementStateControl';

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

  return (
    <UnsavedChangesProvider>
      <div className="mx-auto max-w-6xl space-y-6">
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
        {children}
      </div>
    </UnsavedChangesProvider>
  );
}
