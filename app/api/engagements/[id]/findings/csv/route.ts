import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import {
  findings,
  findingRetests,
  findingRiskAcceptances,
  remediationActions,
} from '@/db/schema/findings';
import { auditLog } from '@/db/schema/audit';
import { engagements } from '@/db/schema/engagements';
import { requireSession } from '@/lib/auth/session';
import { requirePermission } from '@/lib/rbac/require';
import { ACTIONS } from '@/lib/rbac/matrix';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession();
  const { id } = await params;
  const [eng] = await db
    .select({ tenantId: engagements.tenantId, name: engagements.name })
    .from(engagements)
    .where(eq(engagements.id, id))
    .limit(1);
  if (!eng) return new NextResponse('Not found', { status: 404 });

  await requirePermission(ACTIONS.findingView, {
    userId: session.user.id,
    tenantId: eng.tenantId,
    engagementId: id,
  });

  const list = await db
    .select()
    .from(findings)
    .where(and(eq(findings.tenantId, eng.tenantId), eq(findings.engagementId, id)))
    .orderBy(findings.sequence);

  const remediations = await db
    .select()
    .from(remediationActions)
    .where(and(eq(remediationActions.tenantId, eng.tenantId), eq(remediationActions.engagementId, id)));

  const retests = await db
    .select()
    .from(findingRetests)
    .where(and(eq(findingRetests.tenantId, eng.tenantId), eq(findingRetests.engagementId, id)));

  const acceptances = await db
    .select()
    .from(findingRiskAcceptances)
    .where(and(eq(findingRiskAcceptances.tenantId, eng.tenantId), eq(findingRiskAcceptances.engagementId, id)));

  const headers = [
    'code',
    'type',
    'severity',
    'status',
    'title',
    'description',
    'recommendation',
    'reportedAt',
    'signedOffAt',
    'closedAt',
    'remediationCount',
    'latestRetestResult',
    'latestRetestAt',
    'latestRetestEvidenceCount',
    'riskAcceptedBy',
    'riskAcceptedAt',
    'residualRiskId',
  ];
  const rows = list.map((f) => {
    const latestRetest = retests
      .filter((r) => r.findingId === f.id)
      .sort((a, b) => b.retestedAt.getTime() - a.retestedAt.getTime())[0];
    const latestAcceptance = acceptances
      .filter((r) => r.findingId === f.id)
      .sort((a, b) => b.acceptedAt.getTime() - a.acceptedAt.getTime())[0];
    return {
      code: f.code,
      type: f.type,
      severity: f.severity,
      status: f.status,
      title: f.title,
      description: f.description,
      recommendation: f.recommendation ?? '',
      reportedAt: f.reportedAt.toISOString(),
      signedOffAt: f.signedOffAt?.toISOString() ?? '',
      closedAt: f.closedAt?.toISOString() ?? '',
      remediationCount: String(remediations.filter((r) => r.findingId === f.id).length),
      latestRetestResult: latestRetest?.result ?? '',
      latestRetestAt: latestRetest?.retestedAt.toISOString() ?? '',
      latestRetestEvidenceCount: String(latestRetest?.evidenceItemIds?.length ?? 0),
      riskAcceptedBy: latestAcceptance?.acceptedByName ?? '',
      riskAcceptedAt: latestAcceptance?.acceptedAt.toISOString() ?? '',
      residualRiskId: latestAcceptance?.residualRiskId ?? '',
    };
  });
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const csv = [
    headers.join(','),
    ...rows.map((r) => headers.map((h) => esc(r[h as keyof typeof r] ?? '')).join(',')),
  ].join('\n');

  await db.insert(auditLog).values({
    tenantId: eng.tenantId,
    engagementId: id,
    actorUserId: session.user.id,
    action: 'findings.export.csv',
    resourceType: 'findings',
  });

  const filename = `findings-${eng.name.replace(/[^a-z0-9]+/gi, '_')}.csv`;
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
