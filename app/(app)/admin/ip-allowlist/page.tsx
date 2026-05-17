import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db/client';
import { tenantIpAllowlist } from '@/db/schema/auth';
import { getSession } from '@/lib/auth/session';
import { resolveActiveTenant } from '@/lib/auth/active-tenant';
import { requirePermission, PermissionDeniedError } from '@/lib/rbac/require';
import { ACTIONS } from '@/lib/rbac/matrix';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { IpAllowlistManager } from '@/components/admin/IpAllowlistManager';

export const metadata = { title: 'IP allowlist · OakAttest' };

export default async function IpAllowlistPage() {
  const session = (await getSession())!;
  const tenant = await resolveActiveTenant(session.user.id);
  if (!tenant) redirect('/onboarding');

  try {
    await requirePermission(ACTIONS.tenantManageIpAllowlist, {
      userId: session.user.id,
      tenantId: tenant.tenantId,
    });
  } catch (err) {
    if (err instanceof PermissionDeniedError) redirect('/dashboard');
    throw err;
  }

  const entries = await db
    .select()
    .from(tenantIpAllowlist)
    .where(eq(tenantIpAllowlist.tenantId, tenant.tenantId));

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <p className="text-xs uppercase text-slate-600">Tenant admin</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">IP allowlist</h1>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Assessor IP restrictions</CardTitle>
          <CardDescription>
            When populated, assessor-side users may only sign in from one of these CIDRs.
            Empty list means no restriction.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <IpAllowlistManager
            tenantId={tenant.tenantId}
            entries={entries.map((e) => ({
              id: e.id,
              cidr: e.cidr,
              description: e.description,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
