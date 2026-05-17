import { redirect } from 'next/navigation';
import { and, eq, isNull } from 'drizzle-orm';
import { getSession } from '@/lib/auth/session';
import { resolveActiveTenant } from '@/lib/auth/active-tenant';
import { AppShell } from '@/components/AppShell';
import { CommandPalette } from '@/components/CommandPalette';
import { db } from '@/lib/db/client';
import { engagements } from '@/db/schema/engagements';
import { users } from '@/db/schema/auth';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/sign-in');

  const [profile] = await db
    .select({ accepted: users.dataHandlingAcceptedAt })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  if (!profile?.accepted) redirect('/terms');

  const tenant = await resolveActiveTenant(session.user.id);
  if (!tenant) redirect('/onboarding');

  const engagementList = await db
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
    .limit(100);

  const paletteItems = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      description: 'All engagements',
      href: '/dashboard',
    },
    {
      id: 'audit',
      label: 'Audit log',
      description: 'Append-only tenant activity',
      href: '/admin/audit',
    },
    {
      id: 'admin',
      label: 'Tenant admin',
      description: 'Members, branding, residency',
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
    ...engagementList.map((e) => ({
      id: e.id,
      label: e.name,
      description: `${e.reference ?? 'engagement'} · ${e.classification.replace('_', ':')}`,
      href: `/engagements/${e.id}/overview`,
    })),
  ];

  return (
    <AppShell tenantName={tenant.tenantName} userName={session.user.name ?? session.user.email}>
      {children}
      <CommandPalette items={paletteItems} />
    </AppShell>
  );
}
