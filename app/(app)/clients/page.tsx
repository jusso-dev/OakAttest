import { redirect } from 'next/navigation';
import { requirePageSession } from '@/lib/auth/session';
import { resolveActiveTenant } from '@/lib/auth/active-tenant';
import { requirePermission, PermissionDeniedError, rolesForUser } from '@/lib/rbac/require';
import { ACTIONS, isPermitted } from '@/lib/rbac/matrix';
import { listClientsForTenant } from '@/lib/clients';
import { clientMissingFields } from '@/db/schema/clients';
import { ClientsManager } from '@/components/clients/ClientsManager';

export const metadata = { title: 'Clients · OakAttest' };

export default async function ClientsPage({
  searchParams,
}: {
  searchParams?: Promise<{ edit?: string }>;
}) {
  const session = await requirePageSession();
  const tenant = await resolveActiveTenant(session.user.id);
  if (!tenant) redirect('/onboarding');

  try {
    await requirePermission(ACTIONS.clientView, {
      userId: session.user.id,
      tenantId: tenant.tenantId,
    });
  } catch (err) {
    if (err instanceof PermissionDeniedError) redirect('/dashboard');
    throw err;
  }

  const roles = await rolesForUser({ userId: session.user.id, tenantId: tenant.tenantId });
  const canManage = roles.some((r) => isPermitted(ACTIONS.clientManage, r));
  const params = await searchParams;

  const rows = await listClientsForTenant(tenant.tenantId);
  const clients = rows.map((c) => ({
    id: c.id,
    name: c.name,
    businessNumber: c.businessNumber,
    primaryContactName: c.primaryContactName,
    primaryContactEmail: c.primaryContactEmail,
    address: c.address,
    notes: c.notes,
    missing: clientMissingFields(c),
  }));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <p className="text-xs uppercase text-slate-600">Clients</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Client registry</h1>
        <p className="mt-2 text-sm text-slate-600">
          The organisations you assess. Engagements are created against a client selected here.
        </p>
      </header>
      <ClientsManager
        tenantId={tenant.tenantId}
        clients={clients}
        initialEditId={params?.edit}
        canManage={canManage}
      />
    </div>
  );
}
