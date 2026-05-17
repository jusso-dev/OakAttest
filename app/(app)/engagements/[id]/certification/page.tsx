import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { certificationReports, residualRisks } from '@/db/schema/certification';
import { engagementMembers } from '@/db/schema/tenants';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CertificationDraftForm } from '@/components/engagement/CertificationDraftForm';
import { CertificationRow } from '@/components/engagement/CertificationRow';
import { ResidualRiskForm } from '@/components/engagement/ResidualRiskForm';
import { AuthorisationPackagePanel } from '@/components/engagement/AuthorisationPackagePanel';
import { getSession } from '@/lib/auth/session';

export default async function CertificationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = (await getSession())!;

  const reports = await db
    .select()
    .from(certificationReports)
    .where(eq(certificationReports.engagementId, id))
    .orderBy(desc(certificationReports.version));

  const risks = await db
    .select()
    .from(residualRisks)
    .where(eq(residualRisks.engagementId, id))
    .orderBy(desc(residualRisks.createdAt));

  const roles = await db
    .select({ role: engagementMembers.role })
    .from(engagementMembers)
    .where(eq(engagementMembers.engagementId, id));
  const isLead = roles.some((r) => r.role === 'lead_assessor');
  void session;

  return (
    <div className="space-y-6">
      <AuthorisationPackagePanel />

      <Card>
        <CardHeader>
          <CardTitle>Residual risks</CardTitle>
          <CardDescription>
            Captured at certification time. Each risk is frozen with the signed report.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {risks.length === 0 ? (
            <p className="text-sm text-slate-600">No residual risks recorded.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {risks.map((r) => (
                <li key={r.id} className="rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="font-medium text-slate-900">{r.title}</p>
                    <RiskBadge likelihood={r.likelihood} impact={r.impact} />
                  </div>
                  <p className="mt-1 text-slate-700">{r.description}</p>
                  {(r.likelihood || r.impact) && (
                    <p className="mt-1 text-xs text-slate-600">
                      Likelihood: {r.likelihood ?? 'Not set'} · Impact: {r.impact ?? 'Not set'}
                    </p>
                  )}
                  {r.mitigation && (
                    <p className="mt-1 text-xs text-slate-600">Mitigation: {r.mitigation}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
          {isLead && <ResidualRiskForm engagementId={id} />}
        </CardContent>
      </Card>

      {isLead && (
        <Card>
          <CardHeader>
            <CardTitle>Draft certification report</CardTitle>
            <CardDescription>
              Generates a versioned PDF. After review, sign the report to build the ASD
              submission bundle and open a public verification URL.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CertificationDraftForm engagementId={id} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Versions</CardTitle>
          <CardDescription>{reports.length} version(s).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {reports.map((r) => (
            <CertificationRow key={r.id} engagementId={id} report={r} canSign={isLead} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function RiskBadge({
  likelihood,
  impact,
}: {
  likelihood: string | null;
  impact: string | null;
}) {
  const score = Number(likelihood?.split(' ')[0]) * Number(impact?.split(' ')[0]);
  if (!Number.isFinite(score) || score <= 0) {
    return (
      <span className="rounded-full bg-[var(--oak-mist-strong)] px-2 py-0.5 text-xs font-medium text-slate-700">
        unrated
      </span>
    );
  }
  const rating = score >= 20 ? 'Extreme' : score >= 12 ? 'High' : score >= 6 ? 'Medium' : 'Low';
  const tone =
    rating === 'Extreme'
      ? 'bg-red-100 text-red-900'
      : rating === 'High'
        ? 'bg-orange-100 text-orange-900'
        : rating === 'Medium'
          ? 'bg-amber-100 text-amber-900'
          : 'bg-[var(--oak-mist-strong)] text-[var(--oak-shield)]';
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>
      {score} {rating}
    </span>
  );
}
