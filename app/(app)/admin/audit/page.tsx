import { and, desc, eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db/client';
import { auditLog } from '@/db/schema/audit';
import { getSession } from '@/lib/auth/session';
import { resolveActiveTenant } from '@/lib/auth/active-tenant';
import { requirePermission, PermissionDeniedError } from '@/lib/rbac/require';
import { ACTIONS } from '@/lib/rbac/matrix';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata = { title: 'Audit log · OakAttest' };

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; actor?: string }>;
}) {
  const session = (await getSession())!;
  const tenant = await resolveActiveTenant(session.user.id);
  if (!tenant) redirect('/onboarding');

  try {
    await requirePermission(ACTIONS.auditView, {
      userId: session.user.id,
      tenantId: tenant.tenantId,
    });
  } catch (err) {
    if (err instanceof PermissionDeniedError) redirect('/dashboard');
    throw err;
  }

  const filters = await searchParams;

  const conditions = [eq(auditLog.tenantId, tenant.tenantId)];
  if (filters.action) conditions.push(eq(auditLog.action, filters.action));
  if (filters.actor) conditions.push(eq(auditLog.actorUserId, filters.actor));

  const rows = await db
    .select({
      id: auditLog.id,
      createdAt: auditLog.createdAt,
      action: auditLog.action,
      resourceType: auditLog.resourceType,
      resourceId: auditLog.resourceId,
      actorUserId: auditLog.actorUserId,
      actorIp: auditLog.actorIp,
      message: auditLog.message,
    })
    .from(auditLog)
    .where(and(...conditions))
    .orderBy(desc(auditLog.createdAt))
    .limit(200);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <header>
        <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Tenant admin</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Audit log</h1>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
          <CardDescription>
            Append-only. The application can only insert into this table; updates and deletes
            are blocked at the database role layer.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wider text-slate-500">
                  <th className="py-2 pr-3">When</th>
                  <th className="py-2 pr-3">Action</th>
                  <th className="py-2 pr-3">Resource</th>
                  <th className="py-2 pr-3">Actor</th>
                  <th className="py-2 pr-3">IP</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100">
                    <td className="py-2 pr-3 whitespace-nowrap text-slate-500">
                      {new Date(r.createdAt).toLocaleString('en-AU')}
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs">{r.action}</td>
                    <td className="py-2 pr-3 text-slate-700">
                      {r.resourceType}
                      {r.resourceId ? ` · ${r.resourceId.slice(0, 8)}` : ''}
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs text-slate-700">
                      {r.actorUserId?.slice(0, 8) ?? 'system'}
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs text-slate-500">
                      {r.actorIp ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && (
              <p className="px-3 py-6 text-sm text-slate-500">No audit entries yet.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
