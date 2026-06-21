import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { tenants } from '@/db/schema/tenants';
import { subscriptions } from '@/db/schema/subscriptions';
import { tenantUsage } from '@/db/schema/usage';
import { requirePageSession } from '@/lib/auth/session';
import { partnersForUser } from '@/lib/auth/partner';
import { isPlatformAdmin } from '@/lib/auth/platform';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { CreatePartnerForm } from '@/components/partner/CreatePartnerForm';
import { CreateClientTenantForm } from '@/components/partner/CreateClientTenantForm';
import { InvitePartnerMemberForm } from '@/components/partner/InvitePartnerMemberForm';
import { DropIntoButton } from '@/components/partner/DropIntoButton';
import { PlanChangeForm } from '@/components/admin/PlanChangeForm';

export const metadata = { title: 'MSP console · OakAttest' };

const PLAN_CODES = ['ESSENTIAL', 'PROFESSIONAL', 'ENTERPRISE'] as const;

function gb(bytes: number | null): number {
  return Math.round(((bytes ?? 0) / 1_000_000_000) * 100) / 100;
}

export default async function PartnerConsolePage({
  searchParams,
}: {
  searchParams?: Promise<{ plan?: string }>;
}) {
  const session = await requirePageSession();
  const params = await searchParams;
  const planFilter = params?.plan;
  const [myPartners, platformAdmin] = await Promise.all([
    partnersForUser(session.user.id),
    isPlatformAdmin(session.user.id),
  ]);

  if (myPartners.length === 0) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <header>
          <p className="text-xs uppercase text-slate-600">MSP console</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">No MSP workspace yet</h1>
          <p className="mt-2 text-sm text-slate-600">
            An MSP partner manages many client tenants, each an isolated workspace with its own
            plan and usage limits.
          </p>
        </header>
        <Card>
          <CardHeader>
            <CardTitle>{platformAdmin ? 'Create a partner workspace' : 'Awaiting an invitation'}</CardTitle>
            <CardDescription>
              {platformAdmin
                ? 'You become the partner owner. To onboard an external MSP owner instead, use the Owner console to provision and invite them.'
                : 'MSP workspaces are provisioned by the platform owner. Ask them to invite you as an MSP admin.'}
            </CardDescription>
          </CardHeader>
          {platformAdmin && (
            <CardContent>
              <CreatePartnerForm />
            </CardContent>
          )}
        </Card>
      </div>
    );
  }

  const sections = await Promise.all(
    myPartners.map(async (p) => {
      const rows = await db
        .select({
          id: tenants.id,
          name: tenants.name,
          planId: subscriptions.planId,
          status: subscriptions.status,
          userCount: tenantUsage.userCount,
          entityCount: tenantUsage.entityCount,
          storageBytes: tenantUsage.storageBytes,
        })
        .from(tenants)
        .leftJoin(subscriptions, eq(subscriptions.tenantId, tenants.id))
        .leftJoin(tenantUsage, eq(tenantUsage.tenantId, tenants.id))
        .where(and(eq(tenants.partnerId, p.partnerId), isNull(tenants.deletedAt)));
      const filtered = planFilter ? rows.filter((r) => (r.planId ?? '') === planFilter) : rows;
      return { partner: p, rows: filtered };
    }),
  );

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header>
        <p className="text-xs uppercase text-slate-600">MSP console</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Client tenants</h1>
        <p className="mt-2 text-sm text-slate-600">
          Tenants you manage across your partner workspaces, with plan and usage.
        </p>
        <div className="mt-3 flex gap-3 text-xs">
          <a href="/partner" className={!planFilter ? 'font-medium text-[var(--oak-shield)]' : 'text-slate-600'}>
            All
          </a>
          {PLAN_CODES.map((c) => (
            <a
              key={c}
              href={`/partner?plan=${c}`}
              className={planFilter === c ? 'font-medium text-[var(--oak-shield)]' : 'text-slate-600'}
            >
              {c}
            </a>
          ))}
        </div>
      </header>

      {sections.map(({ partner, rows }) => (
        <section key={partner.partnerId} className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">{partner.name}</h2>
            <span className="text-xs uppercase text-slate-500">{partner.role.replace('_', ' ')}</span>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Tenants</CardTitle>
              <CardDescription>{rows.length} client tenant(s).</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {rows.length === 0 ? (
                <p className="text-sm text-slate-600">No tenants{planFilter ? ' on this plan' : ''} yet.</p>
              ) : (
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="border-b border-[var(--field-border)] text-left text-xs uppercase text-slate-600">
                      <th className="py-2 pr-3">Tenant</th>
                      <th className="py-2 pr-3">Plan</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2 pr-3">Users</th>
                      <th className="py-2 pr-3">Entities</th>
                      <th className="py-2 pr-3">Storage</th>
                      <th className="py-2 pr-3">Change plan</th>
                      <th className="py-2 pr-3">Manage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-b border-[var(--field-border)]">
                        <td className="py-2 pr-3 text-slate-900">{r.name}</td>
                        <td className="py-2 pr-3 text-slate-700">{r.planId ?? '—'}</td>
                        <td className="py-2 pr-3 text-slate-700">{r.status ?? '—'}</td>
                        <td className="py-2 pr-3 text-slate-700">{r.userCount ?? 0}</td>
                        <td className="py-2 pr-3 text-slate-700">{r.entityCount ?? 0}</td>
                        <td className="py-2 pr-3 text-slate-700">{gb(r.storageBytes)} GB</td>
                        <td className="py-2 pr-3">
                          <PlanChangeForm tenantId={r.id} current={r.planId} />
                        </td>
                        <td className="py-2 pr-3">
                          <DropIntoButton tenantId={r.id} label="Drop in" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Add client tenant</CardTitle>
              <CardDescription>Provision a new isolated workspace under {partner.name}.</CardDescription>
            </CardHeader>
            <CardContent>
              <CreateClientTenantForm partnerId={partner.partnerId} />
            </CardContent>
          </Card>

          {partner.role === 'partner_owner' && (
            <Card>
              <CardHeader>
                <CardTitle>Invite MSP staff</CardTitle>
                <CardDescription>Add colleagues to {partner.name} as partner admins or owners.</CardDescription>
              </CardHeader>
              <CardContent>
                <InvitePartnerMemberForm partnerId={partner.partnerId} />
              </CardContent>
            </Card>
          )}
        </section>
      ))}
    </div>
  );
}
