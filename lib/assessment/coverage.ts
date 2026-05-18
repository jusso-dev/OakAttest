import { and, count, eq, isNull, ne, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { engagementControls } from '@/db/schema/ism';
import { evidenceItems, evidenceRequests } from '@/db/schema/evidence';
import { findings } from '@/db/schema/findings';
import { residualRisks } from '@/db/schema/certification';
import { essentialEightAssessments } from '@/db/schema/essential-eight';
import { sspSections } from '@/db/schema/ssp';

export type CoverageBlocker = {
  key: string;
  label: string;
  count: number;
  href: string;
  severity: 'info' | 'warning' | 'danger';
};

export type EngagementCoverage = {
  controlCount: number;
  blockers: CoverageBlocker[];
  hardFailureCount: number;
  warningCount: number;
};

export async function getEngagementCoverage(engagementId: string): Promise<EngagementCoverage> {
  const [
    [{ value: controlCount }],
    [{ value: undecidedControls }],
    [{ value: missingStatements }],
    [{ value: poorEvidenceControls }],
    [{ value: openEvidenceRequests }],
    [{ value: pendingEvidence }],
    [{ value: rejectedEvidence }],
    [{ value: unlinkedFindings }],
    [{ value: openHighFindings }],
    [{ value: residualRisksMissingAcceptance }],
    [{ value: incompleteE8 }],
    [{ value: unapprovedSspSections }],
  ] = await Promise.all([
    countRows(engagementControls, eq(engagementControls.engagementId, engagementId)),
    countRows(
      engagementControls,
      and(eq(engagementControls.engagementId, engagementId), isNull(engagementControls.applicable)),
    ),
    countRows(
      engagementControls,
      and(
        eq(engagementControls.engagementId, engagementId),
        or(eq(engagementControls.applicable, 'applicable'), eq(engagementControls.applicable, 'compensating')),
        or(isNull(engagementControls.implementationStatement), eq(engagementControls.implementationStatement, '')),
      ),
    ),
    countRows(
      engagementControls,
      and(
        eq(engagementControls.engagementId, engagementId),
        or(eq(engagementControls.evidenceQuality, 'poor'), eq(engagementControls.evidenceQuality, 'insufficient')),
      ),
    ),
    countRows(
      evidenceRequests,
      and(eq(evidenceRequests.engagementId, engagementId), eq(evidenceRequests.status, 'open')),
    ),
    countRows(
      evidenceItems,
      and(
        eq(evidenceItems.engagementId, engagementId),
        eq(evidenceItems.reviewStatus, 'pending'),
        isNull(evidenceItems.quarantinedAt),
      ),
    ),
    countRows(
      evidenceItems,
      and(eq(evidenceItems.engagementId, engagementId), eq(evidenceItems.reviewStatus, 'rejected')),
    ),
    db.execute<{ value: number }>(sql`
      select count(*)::int as value
      from findings f
      where f.engagement_id = ${engagementId}
        and not exists (select 1 from finding_controls fc where fc.finding_id = f.id)
    `),
    countRows(
      findings,
      and(
        eq(findings.engagementId, engagementId),
        eq(findings.type, 'non_conformance'),
        or(eq(findings.severity, 'critical'), eq(findings.severity, 'high')),
        ne(findings.status, 'closed'),
        ne(findings.status, 'accepted_risk'),
      ),
    ),
    countRows(
      residualRisks,
      and(eq(residualRisks.engagementId, engagementId), isNull(residualRisks.acceptedAt)),
    ),
    countRows(
      essentialEightAssessments,
      and(
        eq(essentialEightAssessments.engagementId, engagementId),
        or(isNull(essentialEightAssessments.assessorConclusion), isNull(essentialEightAssessments.evidenceQuality)),
      ),
    ),
    countRows(
      sspSections,
      and(eq(sspSections.engagementId, engagementId), ne(sspSections.reviewStatus, 'approved')),
    ),
  ]);

  const href = (path: string) => `/engagements/${engagementId}/${path}`;
  const blockers: CoverageBlocker[] = [
    blocker('undecided-controls', 'Controls missing applicability decisions', undecidedControls, href('scope'), 'danger'),
    blocker('missing-statements', 'Applicable controls missing implementation statements', missingStatements, href('scope'), 'warning'),
    blocker('poor-evidence', 'Controls with poor or insufficient evidence quality', poorEvidenceControls, href('scope'), 'warning'),
    blocker('open-evidence-requests', 'Open evidence requests', openEvidenceRequests, href('evidence'), 'warning'),
    blocker('pending-evidence', 'Evidence pending review', pendingEvidence, href('evidence'), 'warning'),
    blocker('rejected-evidence', 'Rejected evidence items', rejectedEvidence, href('evidence'), 'danger'),
    blocker('unlinked-findings', 'Findings without linked controls', unlinkedFindings, href('findings'), 'warning'),
    blocker('open-high-findings', 'Open critical/high non-conformances', openHighFindings, href('findings'), 'danger'),
    blocker('unaccepted-risks', 'Residual risks missing acceptance', residualRisksMissingAcceptance, href('certification'), 'danger'),
    blocker('incomplete-e8', 'Essential Eight strategies missing conclusion or evidence quality', incompleteE8, href('essential-eight'), 'warning'),
    blocker('unapproved-ssp', 'SSP sections not approved', unapprovedSspSections, href('overview'), 'warning'),
  ].filter((item) => item.count > 0);

  return {
    controlCount,
    blockers,
    hardFailureCount: blockers.filter((item) => item.severity === 'danger').length,
    warningCount: blockers.filter((item) => item.severity === 'warning').length,
  };
}

function blocker(
  key: string,
  label: string,
  count: number,
  href: string,
  severity: CoverageBlocker['severity'],
): CoverageBlocker {
  return { key, label, count, href, severity };
}

function countRows(table: Parameters<ReturnType<typeof db.select>['from']>[0], where: unknown) {
  return db
    .select({ value: count() })
    .from(table)
    .where(where as never);
}
