import { redirect } from 'next/navigation';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { auditLog } from '@/db/schema/audit';
import { users } from '@/db/schema/auth';
import { requirePageSession } from '@/lib/auth/session';
import { resolveActiveTenant } from '@/lib/auth/active-tenant';
import { requirePermission, PermissionDeniedError } from '@/lib/rbac/require';
import { ACTIONS } from '@/lib/rbac/matrix';
import { resolveEntitlement } from '@/lib/billing/entitlement';
import { resolveEntitlements } from '@/lib/licensing';
import { PlanChangeForm } from '@/components/admin/PlanChangeForm';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export const metadata = { title: 'Subscription · OakAttest' };

const STATE_LABEL: Record<string, string> = {
  allow: 'Active',
  grace: 'Grace window',
  block: 'Blocked',
};

const REASON_LABEL: Record<string, string> = {
  active: 'Subscription is in good standing.',
  pending_provisioning:
    'Marketplace purchase received. Activation completes when the workspace owner finishes the landing page.',
  no_subscription:
    'No Marketplace subscription is bound to this tenant. Self-installed or development deployment.',
  grace_open:
    'Subscription is suspended but the grace window is still open. Writes are permitted until the grace period ends.',
  grace_expired:
    'Grace window has passed. Writes are blocked until the subscription is reinstated.',
  cancelled:
    'Subscription has been cancelled. Reinstating requires a new Marketplace subscription.',
};

export default async function SubscriptionAdminPage() {
  const session = await requirePageSession();
  const tenant = await resolveActiveTenant(session.user.id);
  if (!tenant) redirect('/onboarding');

  try {
    await requirePermission(ACTIONS.tenantManage, {
      userId: session.user.id,
      tenantId: tenant.tenantId,
    });
  } catch (err) {
    if (err instanceof PermissionDeniedError) redirect('/admin');
    throw err;
  }

  const entitlement = await resolveEntitlement(tenant.tenantId);
  const sub = entitlement.subscription;
  const lic = await resolveEntitlements(tenant.tenantId);

  const history = await db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      message: auditLog.message,
      createdAt: auditLog.createdAt,
      actorUserId: auditLog.actorUserId,
      actorEmail: users.email,
      beforeJson: auditLog.beforeJson,
      afterJson: auditLog.afterJson,
    })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorUserId))
    .where(
      and(
        eq(auditLog.tenantId, tenant.tenantId),
        eq(auditLog.resourceType, 'subscription'),
      ),
    )
    .orderBy(desc(auditLog.createdAt))
    .limit(50);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <p className="text-xs uppercase text-slate-600">Tenant admin · Subscription</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Marketplace subscription</h1>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Plan &amp; usage</CardTitle>
          <CardDescription>
            {lic.planName
              ? `Current plan: ${lic.planName}.`
              : 'No subscription — self-installed / unlimited.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="grid gap-3 sm:grid-cols-3">
            <UsageStat label="Users" used={lic.usage.userCount} max={lic.limits.maxUsers} />
            <UsageStat label="Entities" used={lic.usage.entityCount} max={lic.limits.maxEntities} />
            <UsageStat
              label="Storage"
              used={Math.round((lic.usage.storageBytes / 1_000_000_000) * 100) / 100}
              max={lic.limits.maxStorageGb}
              unit=" GB"
            />
          </div>
          {lic.features.size > 0 && (
            <div>
              <p className="text-xs uppercase text-slate-600">Included features</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {[...lic.features].sort().map((f) => (
                  <span
                    key={f}
                    className="rounded bg-[var(--oak-mist)] px-2 py-0.5 text-xs text-[var(--oak-shield)]"
                  >
                    {f}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="text-xs uppercase text-slate-600">Change plan</p>
            <div className="mt-1.5">
              <PlanChangeForm tenantId={tenant.tenantId} current={lic.planCode} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Current state</CardTitle>
          <CardDescription>
            Access state derived from Marketplace status and grace window.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex h-7 items-center rounded-md px-3 text-xs font-medium ${
                entitlement.state === 'allow'
                  ? 'bg-[var(--oak-mist)] text-[var(--oak-shield)]'
                  : entitlement.state === 'grace'
                    ? 'bg-amber-50 text-amber-900'
                    : 'bg-red-50 text-red-900'
              }`}
            >
              {STATE_LABEL[entitlement.state]}
            </span>
            <span className="text-slate-600">{REASON_LABEL[entitlement.reason]}</span>
          </div>
          {entitlement.graceEndsAt && (
            <p className="text-slate-700">
              Grace window ends{' '}
              <strong>
                {new Date(entitlement.graceEndsAt).toLocaleString('en-AU')}
              </strong>
              .
            </p>
          )}
        </CardContent>
      </Card>

      {sub ? (
        <Card>
          <CardHeader>
            <CardTitle>Subscription details</CardTitle>
            <CardDescription>From the last Marketplace webhook.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-slate-600">Marketplace ID</dt>
              <dd className="font-mono text-xs text-slate-900">
                {sub.marketplaceSubscriptionId}
              </dd>
              <dt className="text-slate-600">Plan</dt>
              <dd className="text-slate-900">{sub.planId}</dd>
              <dt className="text-slate-600">Status</dt>
              <dd className="text-slate-900">{sub.status}</dd>
              <dt className="text-slate-600">Quantity</dt>
              <dd className="text-slate-900">{sub.quantity}</dd>
              <dt className="text-slate-600">Effective from</dt>
              <dd className="text-slate-900">
                {sub.effectiveStartAt
                  ? new Date(sub.effectiveStartAt).toLocaleDateString('en-AU')
                  : '—'}
              </dd>
              <dt className="text-slate-600">Effective until</dt>
              <dd className="text-slate-900">
                {sub.effectiveEndAt
                  ? new Date(sub.effectiveEndAt).toLocaleDateString('en-AU')
                  : '—'}
              </dd>
              <dt className="text-slate-600">Last webhook</dt>
              <dd className="text-slate-900">
                {sub.lastWebhookAt
                  ? new Date(sub.lastWebhookAt).toLocaleString('en-AU')
                  : 'never'}
              </dd>
            </dl>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>No Marketplace subscription</CardTitle>
            <CardDescription>
              This tenant has no subscription row. Self-installed and development deployments do
              not require one.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>State change history</CardTitle>
          <CardDescription>
            Append-only audit entries for this subscription. The most recent 50 changes are shown.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-slate-600">No state changes recorded.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--field-border)] text-left text-xs uppercase text-slate-600">
                  <th className="py-2 pr-3">When</th>
                  <th className="py-2 pr-3">Action</th>
                  <th className="py-2 pr-3">Actor</th>
                  <th className="py-2 pr-3">Note</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row.id} className="border-b border-[var(--field-border)]">
                    <td className="py-2 pr-3 text-slate-700">
                      {new Date(row.createdAt).toLocaleString('en-AU')}
                    </td>
                    <td className="py-2 pr-3 text-slate-900">{row.action}</td>
                    <td className="py-2 pr-3 text-slate-700">
                      {row.actorEmail ?? 'system'}
                    </td>
                    <td className="py-2 pr-3 text-slate-600">{row.message ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function UsageStat({
  label,
  used,
  max,
  unit = '',
}: {
  label: string;
  used: number;
  max: number | null;
  unit?: string;
}) {
  return (
    <div className="rounded-md border border-[var(--field-border)] p-3">
      <p className="text-xs uppercase text-slate-600">{label}</p>
      <p className="mt-1 text-slate-900">
        {used}
        {unit}{' '}
        <span className="text-slate-500">/ {max === null ? '∞' : `${max}${unit}`}</span>
      </p>
    </div>
  );
}
