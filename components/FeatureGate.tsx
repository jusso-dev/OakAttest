import type { ReactNode } from 'react';
import { getSession } from '@/lib/auth/session';
import { resolveActiveTenant } from '@/lib/auth/active-tenant';
import { hasFeature, requiredPlanForFeature } from '@/lib/licensing';

// Server component. Cosmetic gate only — the server actions/route handlers are
// the source of truth (lib/licensing). Renders children when the active tenant's
// plan unlocks `feature`, otherwise a fallback or an upgrade prompt.
export async function FeatureGate({
  feature,
  children,
  fallback,
}: {
  feature: string;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const session = await getSession();
  if (!session) return fallback ?? null;
  const tenant = await resolveActiveTenant(session.user.id);
  if (!tenant) return fallback ?? null;

  if (await hasFeature(tenant.tenantId, feature)) return <>{children}</>;
  if (fallback !== undefined) return <>{fallback}</>;

  const required = await requiredPlanForFeature(feature);
  return (
    <div className="rounded-md border border-[var(--field-border)] bg-[var(--oak-mist)] p-4 text-sm">
      <p className="font-medium text-slate-900">Not included in your plan</p>
      <p className="mt-1 text-slate-600">
        {required
          ? `Upgrade to ${required.name} to unlock this.`
          : 'This feature is not available on your current plan.'}
      </p>
      <a
        href="/admin/subscription"
        className="mt-2 inline-block text-[var(--oak-shield)] underline"
      >
        View subscription
      </a>
    </div>
  );
}
