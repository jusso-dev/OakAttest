import { redirect } from 'next/navigation';
import { and, eq, isNull } from 'drizzle-orm';
import { getSession } from '@/lib/auth/session';
import { resolveActiveTenant } from '@/lib/auth/active-tenant';
import { AppShell } from '@/components/AppShell';
import { CommandPalette } from '@/components/CommandPalette';
import { db } from '@/lib/db/client';
import { engagements } from '@/db/schema/engagements';
import { engagementMembers } from '@/db/schema/tenants';
import { users } from '@/db/schema/auth';
import { rolesForUser } from '@/lib/rbac/require';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/signin');

  const [profile] = await db
    .select({ accepted: users.dataHandlingAcceptedAt })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  if (!profile?.accepted) redirect('/terms');

  const tenant = await resolveActiveTenant(session.user.id);
  if (!tenant) redirect('/onboarding');

  const engagementList =
    tenant.access === 'tenant'
      ? await db
          .select({
            id: engagements.id,
            name: engagements.name,
            reference: engagements.reference,
            classification: engagements.classification,
          })
          .from(engagements)
          .where(
            and(eq(engagements.tenantId, tenant.tenantId), isNull(engagements.deletedAt)),
          )
          .limit(100)
      : await db
          .select({
            id: engagements.id,
            name: engagements.name,
            reference: engagements.reference,
            classification: engagements.classification,
          })
          .from(engagementMembers)
          .innerJoin(engagements, eq(engagements.id, engagementMembers.engagementId))
          .where(
            and(
              eq(engagementMembers.tenantId, tenant.tenantId),
              eq(engagementMembers.userId, session.user.id),
              isNull(engagementMembers.deletedAt),
              isNull(engagements.deletedAt),
            ),
          )
          .limit(100);

  const paletteItems = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      description: 'All engagements',
      href: '/dashboard',
    },
    ...(tenant.access === 'tenant'
      ? [
          {
            id: 'audit',
            label: 'Audit log',
            description: 'Append-only tenant activity',
            href: '/admin/audit',
          },
          {
            id: 'admin',
            label: 'Tenant admin',
            description: 'Members, branding, deployment settings',
            href: '/admin',
          },
          {
            id: 'admin-branding',
            label: 'Branding',
            description: 'Tenant brand customisation',
            href: '/admin/branding',
          },
          {
            id: 'admin-ip',
            label: 'IP allowlist',
            description: 'Restrict assessor access to known IPs',
            href: '/admin/ip-allowlist',
          },
          {
            id: 'new-engagement',
            label: 'New engagement',
            description: 'Start a new IRAP assessment',
            href: '/engagements/new',
          },
        ]
      : []),
    ...engagementList.map((e) => ({
      id: e.id,
      label: e.name,
      description: `${e.reference ?? 'engagement'} · ${e.classification.replace('_', ':')}`,
      href: `/engagements/${e.id}/overview`,
    })),
  ];

  const roles = await rolesForUser({
    userId: session.user.id,
    tenantId: tenant.tenantId,
    engagementId: tenant.access === 'engagement' ? engagementList[0]?.id : undefined,
  });
  const userRole = formatRole(roles[0] ?? 'read_only_observer');

  return (
    <AppShell
      tenantName={tenant.tenantName}
      userName={session.user.name ?? session.user.email}
      userRole={userRole}
      canUseTenantAdmin={tenant.access === 'tenant'}
    >
      {children}
      <CommandPalette items={paletteItems} />
    </AppShell>
  );
}

function formatRole(role: string) {
  return role
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
