import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { tenantInvitations, tenantMembers, tenants } from '@/db/schema/tenants';
import { users } from '@/db/schema/auth';
import { getSession } from '@/lib/auth/session';
import { resolveActiveTenant } from '@/lib/auth/active-tenant';
import { requirePermission, PermissionDeniedError } from '@/lib/rbac/require';
import { ACTIONS } from '@/lib/rbac/matrix';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TenantInviteForm } from '@/components/admin/TenantInviteForm';
import { RoleAccessGuide } from '@/components/admin/RoleAccessGuide';

export const metadata = { title: 'Tenant admin · OakAttest' };

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: Promise<{ invite?: string }>;
}) {
  const session = (await getSession())!;
  const params = await searchParams;
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
    .select({ name: tenants.name, slug: tenants.slug })
    .from(tenants)
    .where(eq(tenants.id, tenant.tenantId))
    .limit(1);

  const pendingInvitations = await db
    .select({
      id: tenantInvitations.id,
      email: tenantInvitations.email,
      role: tenantInvitations.role,
      expiresAt: tenantInvitations.expiresAt,
      createdAt: tenantInvitations.createdAt,
    })
    .from(tenantInvitations)
    .where(
      and(
        eq(tenantInvitations.tenantId, tenant.tenantId),
        isNull(tenantInvitations.acceptedAt),
        isNull(tenantInvitations.revokedAt),
      ),
    );

  const inviteMode = params?.invite === '1';

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <p className="text-xs uppercase text-slate-600">Tenant admin</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">{tenantRow.name}</h1>
      </header>

      <Card className={inviteMode ? 'border-[var(--oak-border)] bg-[var(--oak-mist)]' : undefined}>
        <CardHeader>
          <CardTitle>Invite teammates</CardTitle>
          <CardDescription>
            Add assessor-side colleagues to this organisation before creating engagements.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <TenantInviteForm tenantId={tenant.tenantId} />
          {pendingInvitations.length > 0 && (
            <div>
              <p className="text-xs font-medium uppercase text-slate-600">
                Pending invitations
              </p>
              <div className="mt-2 divide-y divide-slate-100 rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)]">
                {pendingInvitations.map((invite) => (
                  <div
                    key={invite.id}
                    className="grid gap-2 px-3 py-2 text-sm sm:grid-cols-[1fr_150px_180px]"
                  >
                    <span className="truncate text-slate-900">{invite.email}</span>
                    <span className="text-slate-600">{invite.role}</span>
                    <span className="text-slate-600">
                      Expires {new Date(invite.expiresAt).toLocaleDateString('en-AU')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account security</CardTitle>
          <CardDescription>
            Multi-factor authentication is optional for now, but strongly recommended for
            assessor-side accounts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <a
            href="/mfa?next=/admin"
            className="inline-flex h-9 items-center justify-center rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-4 text-sm font-medium text-slate-900 hover:bg-[var(--oak-mist)]"
          >
            Set up MFA
          </a>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Roles and access</CardTitle>
          <CardDescription>
            Use tenant roles for assessor organisation administration. Use engagement roles when
            access should be limited to one assessment.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RoleAccessGuide />
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
              <tr className="border-b border-[var(--field-border)] text-left text-xs uppercase text-slate-600">
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Email</th>
                <th className="py-2 pr-3">Role</th>
                <th className="py-2 pr-3">Joined</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.userId} className="border-b border-[var(--field-border)]">
                  <td className="py-2 pr-3 text-slate-900">{m.name ?? '—'}</td>
                  <td className="py-2 pr-3 text-slate-700">{m.email}</td>
                  <td className="py-2 pr-3">{m.role}</td>
                  <td className="py-2 pr-3 text-slate-600">
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
        <CardContent className="text-sm text-slate-600">
          Coming soon.
        </CardContent>
      </Card>
    </div>
  );
}
