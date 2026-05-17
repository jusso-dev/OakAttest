import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { findings, remediationActions } from '@/db/schema/findings';
import { engagementControls, ismControls } from '@/db/schema/ism';
import { engagementMembers } from '@/db/schema/tenants';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FindingCreateForm } from '@/components/findings/FindingCreateForm';
import { FindingRow } from '@/components/findings/FindingRow';
import { getSession } from '@/lib/auth/session';

export default async function FindingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = (await getSession())!;

  const list = await db
    .select()
    .from(findings)
    .where(eq(findings.engagementId, id))
    .orderBy(desc(findings.reportedAt));

  const remediations = await db
    .select()
    .from(remediationActions)
    .where(eq(remediationActions.engagementId, id))
    .orderBy(desc(remediationActions.createdAt));

  const controls = await db
    .select({
      id: engagementControls.ismControlId,
      controlId: engagementControls.controlId,
      description: ismControls.description,
    })
    .from(engagementControls)
    .innerJoin(ismControls, eq(ismControls.id, engagementControls.ismControlId))
    .where(eq(engagementControls.engagementId, id))
    .orderBy(engagementControls.controlId);

  const myRoleRows = await db
    .select({ role: engagementMembers.role })
    .from(engagementMembers)
    .where(eq(engagementMembers.engagementId, id));
  const roles = myRoleRows.map((r) => r.role);
  const isAssessor = roles.includes('lead_assessor') || roles.includes('assessor');
  const isLead = roles.includes('lead_assessor');
  const isClient = roles.includes('client_admin') || roles.includes('client_contributor');

  void session;
  const counts = {
    total: list.length,
    nonConformance: list.filter((f) => f.type === 'non_conformance').length,
    observation: list.filter((f) => f.type === 'observation').length,
    open: list.filter((f) => f.status !== 'closed').length,
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>Findings register</CardTitle>
              <CardDescription>
                {counts.total} total · {counts.nonConformance} non-conformance ·{' '}
                {counts.observation} observation · {counts.open} open.
              </CardDescription>
            </div>
            <a
              href={`/api/engagements/${id}/findings/csv`}
              className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-900 hover:bg-slate-50"
            >
              Export CSV
            </a>
          </div>
        </CardHeader>
      </Card>

      {isAssessor && (
        <Card>
          <CardHeader>
            <CardTitle>Log a finding</CardTitle>
            <CardDescription>
              Assessor only. Clients respond via remediation actions on the right of each finding.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FindingCreateForm
              engagementId={id}
              controls={controls.map((c) => ({ id: c.id, controlId: c.controlId }))}
            />
          </CardContent>
        </Card>
      )}

      {list.length === 0 ? (
        <p className="text-sm text-slate-500">No findings recorded yet.</p>
      ) : (
        list.map((f) => (
          <FindingRow
            key={f.id}
            engagementId={id}
            finding={f}
            remediations={remediations.filter((r) => r.findingId === f.id)}
            canSignOff={isLead}
            canUpdate={isAssessor}
            canRemediate={isClient}
          />
        ))
      )}
    </div>
  );
}
