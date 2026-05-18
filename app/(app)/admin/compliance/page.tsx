import { and, eq, isNull } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db/client';
import { engagements } from '@/db/schema/engagements';
import { certificationReports } from '@/db/schema/certification';
import { tenants } from '@/db/schema/tenants';
import { requirePageSession } from '@/lib/auth/session';
import { resolveActiveTenant } from '@/lib/auth/active-tenant';
import { requirePermission } from '@/lib/rbac/require';
import { ACTIONS } from '@/lib/rbac/matrix';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ReassessmentTaskButton } from '@/components/admin/ReassessmentTaskButton';
import { addCalendarMonths, daysUntil, dueSoonDays, reassessmentMonthsFor } from '@/lib/compliance/policy';
import type { Classification } from '@/db/schema/enums';

export const metadata = { title: 'Ongoing compliance · OakAttest' };

// §9.12 — engagements that have been certified move into Maintenance state.
// This page lists them with a re-assessment countdown. PROTECTED engagements
// have a 2-year recertification cycle; SECRET and TOP_SECRET have shorter
// intervals defined by the assessor firm's policy.
export default async function CompliancePage() {
  const session = await requirePageSession();
  const tenant = await resolveActiveTenant(session.user.id);
  if (!tenant) redirect('/onboarding');
  await requirePermission(ACTIONS.complianceView, {
    userId: session.user.id,
    tenantId: tenant.tenantId,
  });

  const [tenantSettings] = await db
    .select({ compliancePolicy: tenants.compliancePolicy })
    .from(tenants)
    .where(eq(tenants.id, tenant.tenantId))
    .limit(1);
  const compliancePolicy = tenantSettings?.compliancePolicy ?? null;

  const certified = await db
    .select({
      id: engagements.id,
      name: engagements.name,
      classification: engagements.classification,
      certifiedAt: engagements.certifiedAt,
    })
    .from(engagements)
    .where(
      and(
        eq(engagements.tenantId, tenant.tenantId),
        eq(engagements.status, 'completed'),
        isNull(engagements.deletedAt),
      ),
    );

  const reports = await db
    .select()
    .from(certificationReports)
    .where(eq(certificationReports.tenantId, tenant.tenantId));

  const today = new Date();
  const rows = certified.map((e) => {
    const months = reassessmentMonthsFor(e.classification as Classification, compliancePolicy);
    const due = e.certifiedAt ? addCalendarMonths(new Date(e.certifiedAt), months) : null;
    const days = due ? daysUntil(due, today) : null;
    const latestReport = reports
      .filter((r) => r.engagementId === e.id && r.status === 'signed')
      .sort((a, b) => b.version - a.version)[0];
    return { ...e, due, days, latestReport };
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <p className="text-xs uppercase text-slate-600">Tenant admin</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Ongoing compliance</h1>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Re-assessment schedule</CardTitle>
          <CardDescription>
            Reassessment timing is derived from the tenant policy and classification. Due-soon
            threshold is {dueSoonDays(compliancePolicy)} days.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-slate-600">No certified engagements yet.</p>
          ) : (
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--field-border)] text-left text-xs uppercase text-slate-600">
                  <th className="py-2 pr-3">Engagement</th>
                  <th className="py-2 pr-3">Classification</th>
                  <th className="py-2 pr-3">Certified</th>
                  <th className="py-2 pr-3">Re-assess by</th>
                  <th className="py-2 pr-3">In</th>
                  <th className="py-2 pr-3"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-[var(--field-border)]">
                    <td className="py-2 pr-3">
                      <a href={`/engagements/${r.id}/overview`} className="text-[var(--oak-shield)] underline">
                        {r.name}
                      </a>
                    </td>
                    <td className="py-2 pr-3">{r.classification.replace('_', ':')}</td>
                    <td className="py-2 pr-3 text-slate-600">
                      {r.certifiedAt ? new Date(r.certifiedAt).toLocaleDateString('en-AU') : '—'}
                    </td>
                    <td className="py-2 pr-3 text-slate-600">
                      {r.due ? r.due.toLocaleDateString('en-AU') : '—'}
                    </td>
                    <td className="py-2 pr-3">
                      {r.days === null ? (
                        '—'
                      ) : r.days < 0 ? (
                        <span className="font-medium text-red-700">{Math.abs(r.days)} days overdue</span>
                      ) : r.days < dueSoonDays(compliancePolicy) ? (
                        <span className="font-medium text-amber-700">{r.days} days</span>
                      ) : (
                        <span className="text-slate-600">{r.days} days</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      {r.due ? (
                        <ReassessmentTaskButton
                          engagementId={r.id}
                          dueDate={r.due.toISOString().slice(0, 10)}
                        />
                      ) : null}
                    </td>
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
