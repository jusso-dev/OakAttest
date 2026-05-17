import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { tenantMembers, tenants } from '@/db/schema/tenants';
import { users } from '@/db/schema/auth';
import { getSession } from '@/lib/auth/session';
import { resolveActiveTenant } from '@/lib/auth/active-tenant';
import { requirePermission, PermissionDeniedError } from '@/lib/rbac/require';
import { ACTIONS } from '@/lib/rbac/matrix';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata = { title: 'Tenant admin · OakAttest' };

export default async function AdminPage() {
  const session = (await getSession())!;
  const tenant = await resolveActiveTenant(session.user.id);
  if (!tenant) redirect('/onboarding');

  try {
    await requirePermission(ACTIONS.tenantViewMembers, {
      userId: session.user.id,
      tenantId: tenant.tenantId,
    });
  } catch (err) {
    if (err instanceof PermissionDeniedError) redirect('/dashboard');
    throw err;
  }

  const members = await db
    .select({
      userId: tenantMembers.userId,
      role: tenantMembers.role,
      email: users.email,
      name: users.name,
      joinedAt: tenantMembers.joinedAt,
    })
    .from(tenantMembers)
    .innerJoin(users, eq(users.id, tenantMembers.userId))
    .where(
      and(
        eq(tenantMembers.tenantId, tenant.tenantId),
        isNull(tenantMembers.deletedAt),
      ),
    );

  const [tenantRow] = await db
    .select({ name: tenants.name, slug: tenants.slug, dataRegion: tenants.dataRegion })
    .from(tenants)
    .where(eq(tenants.id, tenant.tenantId))
    .limit(1);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Tenant admin</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">{tenantRow.name}</h1>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Data residency</CardTitle>
          <CardDescription>
            Where this tenant&rsquo;s data is stored and replicated.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-slate-700">
          Primary region: <strong>{tenantRow.dataRegion}</strong> (Sydney). Replicated to
          ap-southeast-4 (Melbourne). All persistent data, backups, and logs remain onshore.
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>{members.length} active member(s).</CardDescription>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wider text-slate-500">
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Email</th>
                <th className="py-2 pr-3">Role</th>
                <th className="py-2 pr-3">Joined</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.userId} className="border-b border-slate-100">
                  <td className="py-2 pr-3 text-slate-900">{m.name ?? '—'}</td>
                  <td className="py-2 pr-3 text-slate-700">{m.email}</td>
                  <td className="py-2 pr-3">{m.role}</td>
                  <td className="py-2 pr-3 text-slate-500">
                    {m.joinedAt ? new Date(m.joinedAt).toLocaleDateString('en-AU') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Billing</CardTitle>
          <CardDescription>Billing integration is stubbed for milestone 1.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-slate-500">
          Coming soon.
        </CardContent>
      </Card>
    </div>
  );
}
