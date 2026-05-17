import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { resolveActiveTenant } from '@/lib/auth/active-tenant';
import { AppShell } from '@/components/AppShell';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/sign-in');

  const tenant = await resolveActiveTenant(session.user.id);

  // Brand-new users with no tenant membership land here right after sign-up.
  // We funnel them into the onboarding flow to found a tenant.
  if (!tenant) redirect('/onboarding');

  return (
    <AppShell tenantName={tenant.tenantName} userName={session.user.name ?? session.user.email}>
      {children}
    </AppShell>
  );
}
