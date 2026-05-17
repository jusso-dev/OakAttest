import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db/client';
import { tenants } from '@/db/schema/tenants';
import { getSession } from '@/lib/auth/session';
import { resolveActiveTenant } from '@/lib/auth/active-tenant';
import { requirePermission, PermissionDeniedError } from '@/lib/rbac/require';
import { ACTIONS } from '@/lib/rbac/matrix';
import { resolveBranding } from '@/lib/branding';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BrandingForm } from '@/components/admin/BrandingForm';

export const metadata = { title: 'Branding · OakAttest' };

export default async function BrandingPage() {
  const session = (await getSession())!;
  const tenant = await resolveActiveTenant(session.user.id);
  if (!tenant) redirect('/onboarding');

  try {
    await requirePermission(ACTIONS.tenantManageBranding, {
      userId: session.user.id,
      tenantId: tenant.tenantId,
    });
  } catch (err) {
    if (err instanceof PermissionDeniedError) redirect('/dashboard');
    throw err;
  }

  const [tenantRow] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, tenant.tenantId))
    .limit(1);
  const branding = resolveBranding(tenantRow.branding ?? null);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <p className="text-xs uppercase text-slate-600">Tenant admin</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Branding</h1>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Customise the tenant brand</CardTitle>
          <CardDescription>
            Used in emails, PDF exports, and the navigation chrome.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BrandingForm
            tenantId={tenant.tenantId}
            initial={{
              productName: branding.productName,
              primaryColour: branding.primaryColour,
              accentColour: branding.accentColour,
              logoUrl: branding.logoUrl ?? '',
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
