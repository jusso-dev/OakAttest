import { and, count, eq, isNotNull, isNull, ne, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { engagementControls } from '@/db/schema/frameworks';
import { evidenceItems, evidenceRequests } from '@/db/schema/evidence';
import { findings } from '@/db/schema/findings';
import { residualRisks } from '@/db/schema/certification';
import { essentialEightAssessments } from '@/db/schema/essential-eight';
import { sspSections } from '@/db/schema/ssp';
import { engagements } from '@/db/schema/engagements';

export type CoverageBlocker = {
  key: string;
  category: 'scope' | 'evidence' | 'findings' | 'risk' | 'ssp' | 'essential_eight' | 'certification';
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

export type EngagementCoverageCounts = {
  controlCount: number;
  unlockedBoundary: number;
  undecidedControls: number;
  missingStatements: number;
  applicableControlsWithoutEvidence: number;
  failingAutomatedTests: number;
  poorEvidenceControls: number;
  openEvidenceRequests: number;
  pendingEvidence: number;
  rejectedEvidence: number;
  unverifiedEvidence: number;
  unlinkedFindings: number;
  findingsWithoutEvidence: number;
  openHighFindings: number;
  awaitingRetestFindings: number;
  unsignedNonConformances: number;
  residualRisksMissingAcceptance: number;
  residualRisksMissingRating: number;
  incompleteE8: number;
  unapprovedSspSections: number;
  missingSspExport: number;
};

export async function getEngagementCoverage(engagementId: string): Promise<EngagementCoverage> {
  const [
    [{ value: unlockedBoundary }],
    [{ value: controlCount }],
    [{ value: undecidedControls }],
    [{ value: missingStatements }],
    [{ value: applicableControlsWithoutEvidence }],
    [{ value: failingAutomatedTests }],
    [{ value: poorEvidenceControls }],
    [{ value: openEvidenceRequests }],
    [{ value: pendingEvidence }],
    [{ value: rejectedEvidence }],
    [{ value: unverifiedEvidence }],
    [{ value: unlinkedFindings }],
    [{ value: findingsWithoutEvidence }],
    [{ value: openHighFindings }],
    [{ value: awaitingRetestFindings }],
    [{ value: unsignedNonConformances }],
    [{ value: residualRisksMissingAcceptance }],
    [{ value: residualRisksMissingRating }],
    [{ value: incompleteE8 }],
    [{ value: unapprovedSspSections }],
    [{ value: missingSspExport }],
  ] = await Promise.all([
    countRows(
      engagements,
      and(eq(engagements.id, engagementId), isNull(engagements.boundaryLockedAt)),
    ),
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
    db.execute<{ value: number }>(sql`
      select count(*)::int as value
      from engagement_controls ec
      where ec.engagement_id = ${engagementId}
        and ec.applicable in ('applicable', 'compensating')
        and not exists (
          select 1
          from evidence_item_controls eic
          join evidence_items ei on ei.id = eic.evidence_item_id
          where eic.framework_control_id = ec.framework_control_id
            and ei.engagement_id = ec.engagement_id
            and ei.storage_verified_at is not null
            and ei.quarantined_at is null
        )
        and not exists (
          select 1
          from evidence_reuse_links erl
          join evidence_items source_ei on source_ei.id = erl.source_evidence_item_id
          join client_organisations source_client on source_client.engagement_id = erl.source_engagement_id
            and source_client.tenant_id = erl.tenant_id
          join client_organisations target_client on target_client.engagement_id = erl.target_engagement_id
            and target_client.tenant_id = erl.tenant_id
          join engagements target_engagement on target_engagement.id = erl.target_engagement_id
          where erl.target_engagement_id = ec.engagement_id
            and erl.target_framework_control_id = ec.framework_control_id
            and erl.tenant_id = ec.tenant_id
            and erl.status = 'approved'
            and erl.revoked_at is null
            and erl.valid_until > now()
            and source_ei.tenant_id = ec.tenant_id
            and source_ei.engagement_id = erl.source_engagement_id
            and source_ei.review_status = 'accepted'
            and source_ei.storage_verified_at is not null
            and source_ei.quarantined_at is null
            and source_client.client_id is not null
            and source_client.client_id = target_client.client_id
            and case source_ei.data_classification
              when 'OFFICIAL' then 1
              when 'OFFICIAL_SENSITIVE' then 2
              when 'PROTECTED' then 3
              when 'SECRET' then 4
              when 'TOP_SECRET' then 5
              else 99
            end <= target_engagement.classification_rank
        )
        and not exists (
          select 1
          from assurance_test_result_controls atrc
          join assurance_test_results atr on atr.id = atrc.result_id
          join assurance_connectors ac on ac.id = atr.connector_id
          where atrc.framework_control_id = ec.framework_control_id
            and atr.engagement_id = ec.engagement_id
            and atr.tenant_id = ec.tenant_id
            and ac.status = 'active'
            and atr.outcome = 'pass'
            and atr.review_status = 'accepted'
            and atr.observed_at >= now() - make_interval(mins => ac.schedule_minutes * 2)
            and not exists (
              select 1 from assurance_test_results newer
              where newer.connector_id = atr.connector_id
                and newer.test_key = atr.test_key
                and newer.observed_at > atr.observed_at
            )
        )
    `),
    db.execute<{ value: number }>(sql`
      select count(distinct atr.id)::int as value
      from assurance_test_results atr
      join assurance_connectors ac on ac.id = atr.connector_id
      where atr.engagement_id = ${engagementId}
        and exists (
          select 1 from assurance_test_result_controls atrc
          where atrc.result_id = atr.id
        )
        and not exists (
          select 1 from assurance_test_results newer
          where newer.connector_id = atr.connector_id
            and newer.test_key = atr.test_key
            and newer.observed_at > atr.observed_at
        )
        and (
          ac.status <> 'active'
          or atr.outcome <> 'pass'
          or atr.review_status <> 'accepted'
          or atr.observed_at < now() - make_interval(mins => ac.schedule_minutes * 2)
        )
    `),
    countRows(
      engagementControls,
      and(
        eq(engagementControls.engagementId, engagementId),
        or(eq(engagementControls.evidenceQuality, 'poor'), eq(engagementControls.evidenceQuality, 'insufficient')),
      ),
    ),
    countRows(
      evidenceRequests,
      and(
        eq(evidenceRequests.engagementId, engagementId),
        or(eq(evidenceRequests.status, 'open'), eq(evidenceRequests.status, 'partially_satisfied')),
      ),
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
      and(
        eq(evidenceItems.engagementId, engagementId),
        or(eq(evidenceItems.reviewStatus, 'rejected'), eq(evidenceItems.reviewStatus, 'insufficient')),
      ),
    ),
    countRows(
      evidenceItems,
      and(
        eq(evidenceItems.engagementId, engagementId),
        or(isNull(evidenceItems.storageVerifiedAt), isNotNull(evidenceItems.quarantinedAt)),
      ),
    ),
    db.execute<{ value: number }>(sql`
      select count(*)::int as value
      from findings f
      where f.engagement_id = ${engagementId}
        and not exists (select 1 from finding_controls fc where fc.finding_id = f.id)
    `),
    db.execute<{ value: number }>(sql`
      select count(*)::int as value
      from findings f
      where f.engagement_id = ${engagementId}
        and not exists (select 1 from finding_evidence fe where fe.finding_id = f.id)
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
      findings,
      and(eq(findings.engagementId, engagementId), eq(findings.status, 'awaiting_retest')),
    ),
    countRows(
      findings,
      and(
        eq(findings.engagementId, engagementId),
        eq(findings.type, 'non_conformance'),
        isNull(findings.signedOffAt),
        ne(findings.status, 'accepted_risk'),
      ),
    ),
    countRows(
      residualRisks,
      and(eq(residualRisks.engagementId, engagementId), isNull(residualRisks.acceptedAt)),
    ),
    countRows(
      residualRisks,
      and(
        eq(residualRisks.engagementId, engagementId),
        or(isNull(residualRisks.likelihood), isNull(residualRisks.impact), isNull(residualRisks.mitigation)),
      ),
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
    db.execute<{ value: number }>(sql`
      select case when exists (
        select 1 from ssp_exports
        where engagement_id = ${engagementId}
          and format = 'pdf'
      ) then 0 else 1 end::int as value
    `),
  ]);

  return buildEngagementCoverage(engagementId, {
    controlCount,
    unlockedBoundary,
    undecidedControls,
    missingStatements,
    applicableControlsWithoutEvidence,
    failingAutomatedTests,
    poorEvidenceControls,
    openEvidenceRequests,
    pendingEvidence,
    rejectedEvidence,
    unverifiedEvidence,
    unlinkedFindings,
    findingsWithoutEvidence,
    openHighFindings,
    awaitingRetestFindings,
    unsignedNonConformances,
    residualRisksMissingAcceptance,
    residualRisksMissingRating,
    incompleteE8,
    unapprovedSspSections,
    missingSspExport,
  });
}

export function buildEngagementCoverage(
  engagementId: string,
  counts: EngagementCoverageCounts,
): EngagementCoverage {
  const href = (path: string) => `/engagements/${engagementId}/${path}`;
  const blockers: CoverageBlocker[] = [
    blocker('boundary-unlocked', 'scope', 'System boundary is not locked', counts.unlockedBoundary, href('scope'), 'danger'),
    blocker('undecided-controls', 'scope', 'Controls missing applicability decisions', counts.undecidedControls, href('scope'), 'danger'),
    blocker('missing-statements', 'scope', 'Applicable controls missing implementation statements', counts.missingStatements, href('scope'), 'danger'),
    blocker('missing-control-evidence', 'evidence', 'Applicable controls missing verified linked evidence', counts.applicableControlsWithoutEvidence, href('evidence'), 'danger'),
    blocker('automated-tests-not-current', 'evidence', 'Mapped automated tests are not current, passing, and assessor-accepted', counts.failingAutomatedTests, href('connectors'), 'danger'),
    blocker('poor-evidence', 'evidence', 'Controls with poor or insufficient evidence quality', counts.poorEvidenceControls, href('scope'), 'warning'),
    blocker('open-evidence-requests', 'evidence', 'Open or partially satisfied evidence requests', counts.openEvidenceRequests, href('evidence'), 'danger'),
    blocker('pending-evidence', 'evidence', 'Evidence pending review', counts.pendingEvidence, href('evidence'), 'danger'),
    blocker('rejected-evidence', 'evidence', 'Rejected or insufficient evidence items', counts.rejectedEvidence, href('evidence'), 'danger'),
    blocker('unverified-evidence', 'evidence', 'Evidence not finalised or quarantined', counts.unverifiedEvidence, href('evidence'), 'danger'),
    blocker('unlinked-findings', 'findings', 'Findings without linked controls', counts.unlinkedFindings, href('findings'), 'warning'),
    blocker('findings-without-evidence', 'findings', 'Findings without linked evidence', counts.findingsWithoutEvidence, href('findings'), 'warning'),
    blocker('open-high-findings', 'findings', 'Open critical/high non-conformances', counts.openHighFindings, href('findings'), 'danger'),
    blocker('awaiting-retest', 'findings', 'Findings awaiting retest', counts.awaitingRetestFindings, href('findings'), 'danger'),
    blocker('unsigned-non-conformances', 'findings', 'Non-conformances missing lead assessor sign-off', counts.unsignedNonConformances, href('findings'), 'danger'),
    blocker('unaccepted-risks', 'risk', 'Residual risks missing acceptance', counts.residualRisksMissingAcceptance, href('certification'), 'danger'),
    blocker('unrated-risks', 'risk', 'Residual risks missing likelihood, impact, or treatment', counts.residualRisksMissingRating, href('certification'), 'danger'),
    blocker('incomplete-e8', 'essential_eight', 'Essential Eight strategies missing conclusion or evidence quality', counts.incompleteE8, href('essential-eight'), 'warning'),
    blocker('unapproved-ssp', 'ssp', 'SSP sections not approved', counts.unapprovedSspSections, href('overview'), 'warning'),
    blocker('missing-ssp-export', 'certification', 'Latest SSP PDF export is missing', counts.missingSspExport, href('overview'), 'danger'),
  ].filter((item) => item.count > 0);

  return {
    controlCount: counts.controlCount,
    blockers,
    hardFailureCount: blockers.filter((item) => item.severity === 'danger').length,
    warningCount: blockers.filter((item) => item.severity === 'warning').length,
  };
}

function blocker(
  key: string,
  category: CoverageBlocker['category'],
  label: string,
  count: number,
  href: string,
  severity: CoverageBlocker['severity'],
): CoverageBlocker {
  return { key, category, label, count, href, severity };
}

export function filterCoverageBlockersForRoles(
  blockers: CoverageBlocker[],
  roles: string[],
): CoverageBlocker[] {
  const isClient = roles.some((role) => role === 'client_admin' || role === 'client_contributor');
  const isAssessor = roles.some((role) => role === 'lead_assessor' || role === 'assessor' || role === 'assessor_admin' || role === 'tenant_owner');
  if (isAssessor) return blockers;
  if (isClient) {
    return blockers.filter((blocker) =>
      blocker.category === 'evidence' ||
      blocker.key === 'missing-statements' ||
      blocker.key === 'unaccepted-risks' ||
      blocker.key === 'unrated-risks',
    );
  }
  return blockers.filter((blocker) => blocker.severity === 'danger');
}

function countRows(table: Parameters<ReturnType<typeof db.select>['from']>[0], where: unknown) {
  return db
    .select({ value: count() })
    .from(table)
    .where(where as never);
}
