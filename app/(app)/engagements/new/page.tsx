import { desc, eq, isNull, or } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db/client';
import { frameworkImports } from '@/db/schema/frameworks';
import { listFrameworks } from '@/lib/frameworks/registry';
import { listClientsForTenant } from '@/app/actions/clients';
import { clientMissingFields } from '@/db/schema/clients';
import { requirePageSession } from '@/lib/auth/session';
import { resolveActiveTenant } from '@/lib/auth/active-tenant';
import { requirePermission, PermissionDeniedError } from '@/lib/rbac/require';
import { ACTIONS } from '@/lib/rbac/matrix';
import { NewEngagementForm } from './NewEngagementForm';

export const metadata = { title: 'New engagement · OakAttest' };

export default async function NewEngagementPage() {
  const session = await requirePageSession();
  const tenant = await resolveActiveTenant(session.user.id);
  if (!tenant) redirect('/onboarding');

  try {
    await requirePermission(ACTIONS.engagementCreate, {
      userId: session.user.id,
      tenantId: tenant.tenantId,
    });
  } catch (err) {
    if (err instanceof PermissionDeniedError) redirect('/dashboard');
    throw err;
  }

  const [frameworkRows, importRows, clientRows] = await Promise.all([
    listFrameworks(),
    db
      .select({
        revision: frameworkImports.revision,
        controlCount: frameworkImports.controlCount,
        frameworkId: frameworkImports.frameworkId,
      })
      .from(frameworkImports)
      // Global imports (tenant_id NULL) plus this tenant's own client CSV imports.
      .where(
        or(
          isNull(frameworkImports.tenantId),
          eq(frameworkImports.tenantId, tenant.tenantId),
        ),
      )
      .orderBy(desc(frameworkImports.completedAt))
      .limit(50),
    listClientsForTenant(tenant.tenantId),
  ]);

  const clients = clientRows.map((c) => ({
    id: c.id,
    name: c.name,
    missing: clientMissingFields(c),
  }));

  const keyById = new Map(frameworkRows.map((f) => [f.id, f.key]));
  const frameworks = frameworkRows.map((f) => ({
    key: f.key,
    label: f.label,
    scopingMode: f.scopingMode,
  }));
  const revisions = importRows.map((r) => ({
    revision: r.revision,
    controlCount: r.controlCount,
    frameworkKey: keyById.get(r.frameworkId) ?? 'ism',
  }));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <p className="text-xs uppercase text-slate-600">New engagement</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Scope a new assessment</h1>
      </header>
      {revisions.length === 0 ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          No catalogue revisions have been imported. Open{' '}
          <a className="font-medium underline" href="/admin/frameworks">
            Framework imports
          </a>{' '}
          to import a framework release, pin a specific release, or seed the bundled
          sample for local testing.
        </div>
      ) : (
        <NewEngagementForm
          tenantId={tenant.tenantId}
          frameworks={frameworks}
          revisions={revisions}
          clients={clients}
        />
      )}
    </div>
  );
}
