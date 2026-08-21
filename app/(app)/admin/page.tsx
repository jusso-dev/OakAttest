import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { tenantInvitations, tenantMembers, tenants } from '@/db/schema/tenants';
import { tenantSigningKeys } from '@/db/schema/certification';
import { mcpApiTokens } from '@/db/schema/mcp';
import { users } from '@/db/schema/auth';
import { requirePageSession } from '@/lib/auth/session';
import { resolveActiveTenant } from '@/lib/auth/active-tenant';
import { requirePermission, PermissionDeniedError } from '@/lib/rbac/require';
import { ACTIONS } from '@/lib/rbac/matrix';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TenantInviteForm } from '@/components/admin/TenantInviteForm';
import { MemberRowControls } from '@/components/admin/MemberRowControls';
import { RoleAccessGuide } from '@/components/admin/RoleAccessGuide';
import { SecurityPolicyForm } from '@/components/admin/SecurityPolicyForm';
import { SigningKeysPanel } from '@/components/admin/SigningKeysPanel';
import { McpApiTokensPanel } from '@/components/admin/McpApiTokensPanel';

export const metadata = { title: 'Tenant admin · OakAttest' };

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: Promise<{ invite?: string }>;
}) {
  const session = await requirePageSession();
  const params = await searchParams;
  const tenant = await resolveActiveTenant(session.user.id);
  if (!tenant) redirect('/onboarding');

  let roles: Awaited<ReturnType<typeof requirePermission>> = [];
  try {
    roles = await requirePermission(ACTIONS.tenantViewMembers, {
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
    .select({ name: tenants.name, slug: tenants.slug, securityPolicy: tenants.securityPolicy })
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

  const signingKeys = await db
    .select({
      id: tenantSigningKeys.id,
      keyType: tenantSigningKeys.keyType,
      kmsKeyArn: tenantSigningKeys.kmsKeyArn,
      fingerprint: tenantSigningKeys.fingerprint,
      createdAt: tenantSigningKeys.createdAt,
      rotatedAt: tenantSigningKeys.rotatedAt,
      revokedAt: tenantSigningKeys.revokedAt,
    })
    .from(tenantSigningKeys)
    .where(eq(tenantSigningKeys.tenantId, tenant.tenantId))
    .orderBy(tenantSigningKeys.createdAt);

  const mcpTokens = await db
    .select({
      id: mcpApiTokens.id,
      name: mcpApiTokens.name,
      tokenPrefix: mcpApiTokens.tokenPrefix,
      scopes: mcpApiTokens.scopes,
      expiresAt: mcpApiTokens.expiresAt,
      lastUsedAt: mcpApiTokens.lastUsedAt,
      revokedAt: mcpApiTokens.revokedAt,
      createdAt: mcpApiTokens.createdAt,
    })
    .from(mcpApiTokens)
    .where(eq(mcpApiTokens.tenantId, tenant.tenantId))
    .orderBy(mcpApiTokens.createdAt);

  const inviteMode = params?.invite === '1';
  const canManageTenant = roles.includes('tenant_owner');

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
            Configure whether MFA is optional, required for assessor-side roles, or required for
            every user in this workspace.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <SecurityPolicyForm
            tenantId={tenant.tenantId}
            initialMode={tenantRow.securityPolicy?.mfaMode ?? 'optional'}
            initialGraceDays={tenantRow.securityPolicy?.mfaGracePeriodDays ?? 0}
          />
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
          <CardTitle>Certification signing</CardTitle>
          <CardDescription>
            Optionally register an AWS KMS asymmetric RSA signing key for certification bundles.
            Without a tenant key, OakAttest uses the deployment-managed signing secret.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SigningKeysPanel
            tenantId={tenant.tenantId}
            keys={signingKeys}
            canManage={canManageTenant}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Agent automation (MCP)</CardTitle>
          <CardDescription>
            Connect another AI agent over authenticated Streamable HTTP to manage assessments,
            evidence, findings, audit readiness, assessor access, and timestamped packages.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <McpApiTokensPanel
            tenantId={tenant.tenantId}
            tokens={mcpTokens}
            canManage={canManageTenant}
            endpoint={`${process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'}/api/mcp`}
          />
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
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-[var(--field-border)] text-left text-xs uppercase text-slate-600">
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Email</th>
                <th className="py-2 pr-3">Role</th>
                <th className="py-2 pr-3">Joined</th>
                {canManageTenant && <th className="py-2 pr-3 text-right">Manage</th>}
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
                  {canManageTenant && (
                    <td className="py-2 pr-3">
                      <MemberRowControls
                        tenantId={tenant.tenantId}
                        userId={m.userId}
                        role={m.role as 'tenant_owner' | 'assessor_admin'}
                        memberLabel={m.name ?? m.email}
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Subscription</CardTitle>
          <CardDescription>
            View Marketplace subscription state, grace window, and audit history.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <a
            href="/admin/subscription"
            className="inline-flex h-9 items-center justify-center rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-4 text-sm font-medium text-slate-900 hover:bg-[var(--oak-mist)]"
          >
            Open subscription panel
          </a>
        </CardContent>
      </Card>
    </div>
  );
}
