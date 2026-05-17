import { desc } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db/client';
import { ismImports } from '@/db/schema/ism';
import { getSession } from '@/lib/auth/session';
import { resolveActiveTenant } from '@/lib/auth/active-tenant';
import { requirePermission, PermissionDeniedError } from '@/lib/rbac/require';
import { ACTIONS } from '@/lib/rbac/matrix';
import { NewEngagementForm } from './NewEngagementForm';

export const metadata = { title: 'New engagement · OakAttest' };

export default async function NewEngagementPage() {
  const session = (await getSession())!;
  const tenant = (await resolveActiveTenant(session.user.id))!;

  try {
    await requirePermission(ACTIONS.engagementCreate, {
      userId: session.user.id,
      tenantId: tenant.tenantId,
    });
  } catch (err) {
    if (err instanceof PermissionDeniedError) redirect('/dashboard');
    throw err;
  }

  const revisions = await db
    .select({ revision: ismImports.revision, controlCount: ismImports.controlCount })
    .from(ismImports)
    .orderBy(desc(ismImports.completedAt))
    .limit(10);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <p className="text-xs uppercase text-slate-600">New engagement</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Scope a new IRAP assessment</h1>
      </header>
      {revisions.length === 0 ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          No ISM catalogue revisions have been imported. Open{' '}
          <a className="font-medium underline" href="/admin/ism">
            ISM imports
          </a>{' '}
          to import the current ACSC release, pin a specific release, or seed the bundled
          sample for local testing.
        </div>
      ) : (
        <NewEngagementForm tenantId={tenant.tenantId} revisions={revisions} />
      )}
    </div>
  );
}
