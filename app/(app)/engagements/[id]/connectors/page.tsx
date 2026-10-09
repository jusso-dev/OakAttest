import { and, desc, eq, inArray, isNotNull, isNull, ne } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import {
  assuranceConnectors,
  assuranceTestControlMappings,
  assuranceTestResultControls,
  assuranceTestResults,
  assuranceTestRuns,
  commonControlMappings,
  evidenceReuseLinks,
} from '@/db/schema/assurance-connectors';
import { clientOrganisations, engagements } from '@/db/schema/engagements';
import { evidenceItemControls, evidenceItems } from '@/db/schema/evidence';
import { engagementControls, frameworkControls } from '@/db/schema/frameworks';
import { engagementMembers } from '@/db/schema/tenants';
import { requireEngagementPage } from '@/lib/auth/engagement-access';
import { userTimeZone } from '@/lib/auth/user-timezone';
import { hasFeature } from '@/lib/licensing';
import { requirePermission, rolesForUser } from '@/lib/rbac/require';
import { ACTIONS, isPermitted } from '@/lib/rbac/matrix';
import { classificationAllowed } from '@/lib/classification/guard';
import { formatDateInput } from '@/lib/timezone';
import { parseConnectorConfig } from '@/lib/connectors/types';
import { AssuranceAutomationWorkspace } from '@/components/connectors/AssuranceAutomationWorkspace';

export default async function AssuranceConnectorsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { session } = await requireEngagementPage(id);
  const [engagement] = await db
    .select({
      tenantId: engagements.tenantId,
      name: engagements.name,
      classification: engagements.classification,
      clientId: clientOrganisations.clientId,
    })
    .from(engagements)
    .leftJoin(
      clientOrganisations,
      and(
        eq(clientOrganisations.engagementId, engagements.id),
        eq(clientOrganisations.tenantId, engagements.tenantId),
      ),
    )
    .where(eq(engagements.id, id))
    .limit(1);
  if (!engagement) throw new Error('Engagement not found.');
  await Promise.all([
    requirePermission(ACTIONS.connectorView, {
      userId: session.user.id,
      tenantId: engagement.tenantId,
      engagementId: id,
    }),
    requirePermission(ACTIONS.evidenceReuseView, {
      userId: session.user.id,
      tenantId: engagement.tenantId,
      engagementId: id,
    }),
  ]);

  const [roles, timeZone, integrationsEnabled, reuseEnabled, connectors, controls, runs, results, mappings, reuseLinks, commonMappings] = await Promise.all([
    rolesForUser({ userId: session.user.id, tenantId: engagement.tenantId, engagementId: id }),
    userTimeZone(session.user.id),
    hasFeature(engagement.tenantId, 'INTEGRATIONS'),
    hasFeature(engagement.tenantId, 'EVIDENCE_REUSE'),
    db.select().from(assuranceConnectors).where(and(eq(assuranceConnectors.tenantId, engagement.tenantId), eq(assuranceConnectors.engagementId, id))).orderBy(desc(assuranceConnectors.createdAt)),
    db
      .select({
        frameworkControlId: engagementControls.frameworkControlId,
        controlId: engagementControls.controlId,
        description: frameworkControls.description,
      })
      .from(engagementControls)
      .innerJoin(frameworkControls, eq(frameworkControls.id, engagementControls.frameworkControlId))
      .where(and(eq(engagementControls.tenantId, engagement.tenantId), eq(engagementControls.engagementId, id)))
      .orderBy(engagementControls.controlId),
    db.select().from(assuranceTestRuns).where(and(eq(assuranceTestRuns.tenantId, engagement.tenantId), eq(assuranceTestRuns.engagementId, id))).orderBy(desc(assuranceTestRuns.startedAt)).limit(20),
    db.select().from(assuranceTestResults).where(and(eq(assuranceTestResults.tenantId, engagement.tenantId), eq(assuranceTestResults.engagementId, id))).orderBy(desc(assuranceTestResults.observedAt)).limit(100),
    db
      .select({ connectorId: assuranceTestControlMappings.connectorId, testKey: assuranceTestControlMappings.testKey, frameworkControlId: assuranceTestControlMappings.frameworkControlId })
      .from(assuranceTestControlMappings)
      .innerJoin(assuranceConnectors, eq(assuranceConnectors.id, assuranceTestControlMappings.connectorId))
      .where(and(eq(assuranceConnectors.tenantId, engagement.tenantId), eq(assuranceConnectors.engagementId, id))),
    db.select().from(evidenceReuseLinks).where(and(eq(evidenceReuseLinks.tenantId, engagement.tenantId), eq(evidenceReuseLinks.targetEngagementId, id))).orderBy(desc(evidenceReuseLinks.createdAt)),
    db.select().from(commonControlMappings).where(eq(commonControlMappings.tenantId, engagement.tenantId)).orderBy(desc(commonControlMappings.createdAt)),
  ]);

  const resultControlRows = results.length
    ? await db
        .select({ resultId: assuranceTestResultControls.resultId, controlId: frameworkControls.controlId })
        .from(assuranceTestResultControls)
        .innerJoin(frameworkControls, eq(frameworkControls.id, assuranceTestResultControls.frameworkControlId))
        .where(inArray(assuranceTestResultControls.resultId, results.map((result) => result.id)))
    : [];

  const sourceEngagements = engagement.clientId
    ? await db
        .select({ id: engagements.id, name: engagements.name })
        .from(clientOrganisations)
        .innerJoin(engagements, eq(engagements.id, clientOrganisations.engagementId))
        .where(
          and(
            eq(clientOrganisations.tenantId, engagement.tenantId),
            eq(clientOrganisations.clientId, engagement.clientId),
            ne(clientOrganisations.engagementId, id),
            isNull(engagements.deletedAt),
          ),
        )
    : [];
  const broadSourceAccess = roles.includes('tenant_owner') || roles.includes('assessor_admin');
  const membershipRows = broadSourceAccess || sourceEngagements.length === 0
    ? []
    : await db
        .select({ engagementId: engagementMembers.engagementId })
        .from(engagementMembers)
        .where(
          and(
            eq(engagementMembers.tenantId, engagement.tenantId),
            eq(engagementMembers.userId, session.user.id),
            isNull(engagementMembers.deletedAt),
            inArray(engagementMembers.engagementId, sourceEngagements.map((source) => source.id)),
          ),
        );
  const membershipIds = new Set(membershipRows.map((row) => row.engagementId));
  const permittedSources = broadSourceAccess
    ? sourceEngagements
    : sourceEngagements.filter((source) => membershipIds.has(source.id));
  const sourceName = new Map(permittedSources.map((source) => [source.id, source.name]));
  const candidates = permittedSources.length
    ? await db
        .select({
          id: evidenceItems.id,
          engagementId: evidenceItems.engagementId,
          filename: evidenceItems.filename,
          description: evidenceItems.description,
          sha256: evidenceItems.sha256,
          dataClassification: evidenceItems.dataClassification,
          uploadedAt: evidenceItems.uploadedAt,
        })
        .from(evidenceItems)
        .where(
          and(
            eq(evidenceItems.tenantId, engagement.tenantId),
            inArray(evidenceItems.engagementId, permittedSources.map((source) => source.id)),
            eq(evidenceItems.reviewStatus, 'accepted'),
            isNotNull(evidenceItems.storageVerifiedAt),
            isNull(evidenceItems.quarantinedAt),
          ),
        )
        .orderBy(desc(evidenceItems.uploadedAt))
    : [];
  const allowedCandidates = candidates.filter((candidate) =>
    classificationAllowed(engagement.classification, candidate.dataClassification),
  );
  const candidateControlLinks = allowedCandidates.length
    ? await db
        .select({ evidenceItemId: evidenceItemControls.evidenceItemId, frameworkControlId: evidenceItemControls.frameworkControlId })
        .from(evidenceItemControls)
        .where(inArray(evidenceItemControls.evidenceItemId, allowedCandidates.map((candidate) => candidate.id)))
    : [];

  const relatedEvidenceIds = Array.from(new Set(reuseLinks.map((link) => link.sourceEvidenceItemId)));
  const linkedEvidence = relatedEvidenceIds.length
    ? await db
        .select({ id: evidenceItems.id, filename: evidenceItems.filename, engagementId: evidenceItems.engagementId })
        .from(evidenceItems)
        .where(and(eq(evidenceItems.tenantId, engagement.tenantId), inArray(evidenceItems.id, relatedEvidenceIds)))
    : [];
  const relatedSourceEngagementIds = Array.from(new Set(linkedEvidence.map((item) => item.engagementId)));
  const linkedSourceEngagements = relatedSourceEngagementIds.length
    ? await db
        .select({ id: engagements.id, name: engagements.name })
        .from(engagements)
        .where(and(eq(engagements.tenantId, engagement.tenantId), inArray(engagements.id, relatedSourceEngagementIds)))
    : [];
  const evidenceById = new Map(linkedEvidence.map((item) => [item.id, item]));
  const engagementById = new Map(linkedSourceEngagements.map((item) => [item.id, item.name]));

  const sourceControlIds = Array.from(new Set([
    ...candidateControlLinks.map((link) => link.frameworkControlId),
    ...commonMappings.flatMap((mapping) => [mapping.sourceFrameworkControlId, mapping.targetFrameworkControlId]),
  ]));
  const sourceControls = sourceControlIds.length
    ? await db
        .select({ id: frameworkControls.id, controlId: frameworkControls.controlId, description: frameworkControls.description })
        .from(frameworkControls)
        .where(inArray(frameworkControls.id, sourceControlIds))
    : [];
  const controlLabel = new Map([...controls.map((control) => [control.frameworkControlId, `${control.controlId} — ${control.description}`] as const), ...sourceControls.map((control) => [control.id, `${control.controlId} — ${control.description}`] as const)]);
  const resultControls = new Map<string, string[]>();
  for (const row of resultControlRows) {
    const values = resultControls.get(row.resultId) ?? [];
    values.push(row.controlId);
    resultControls.set(row.resultId, values);
  }

  const defaultValidity = new Date();
  defaultValidity.setUTCDate(defaultValidity.getUTCDate() + 90);
  const permissions = {
    canManageConnectors: roles.some((role) => isPermitted(ACTIONS.connectorManage, role)),
    canRunConnectors: roles.some((role) => isPermitted(ACTIONS.connectorRun, role)),
    canReviewTests: roles.some((role) => isPermitted(ACTIONS.evidenceReview, role)),
    canManageMappings: roles.some((role) => isPermitted(ACTIONS.commonControlManage, role)),
    canProposeReuse: roles.some((role) => isPermitted(ACTIONS.evidenceReusePropose, role)),
    canReviewReuse: roles.some((role) => isPermitted(ACTIONS.evidenceReuseReview, role)),
  };

  return (
    <AssuranceAutomationWorkspace
      engagementId={id}
      timeZone={timeZone}
      defaultValidity={formatDateInput(defaultValidity, timeZone)}
      integrationsEnabled={integrationsEnabled}
      reuseEnabled={reuseEnabled}
      awsPrincipalArn={process.env.AWS_CONNECTOR_PRINCIPAL_ARN ?? null}
      permissions={permissions}
      controls={controls}
      connectors={connectors.map((connector) => ({
        id: connector.id,
        name: connector.name,
        provider: connector.provider,
        status: connector.status,
        config: parseConnectorConfig(connector.configuration),
        scheduleMinutes: connector.scheduleMinutes,
        lastConnectionTestAt: connector.lastConnectionTestAt?.toISOString() ?? null,
        lastRunAt: connector.lastRunAt?.toISOString() ?? null,
        nextRunAt: connector.nextRunAt?.toISOString() ?? null,
        lastError: connector.lastError,
        mappings: mappings.filter((mapping) => mapping.connectorId === connector.id),
      }))}
      runs={runs.map((run) => ({ ...run, startedAt: run.startedAt.toISOString(), completedAt: run.completedAt?.toISOString() ?? null }))}
      results={results.map((result) => ({
        ...result,
        observedAt: result.observedAt.toISOString(),
        createdAt: result.createdAt.toISOString(),
        controlIds: resultControls.get(result.id) ?? [],
      }))}
      candidates={allowedCandidates.map((candidate) => ({
        ...candidate,
        sourceEngagementName: sourceName.get(candidate.engagementId) ?? 'Source assessment',
        uploadedAt: candidate.uploadedAt.toISOString(),
        sourceFrameworkControlIds: candidateControlLinks.filter((link) => link.evidenceItemId === candidate.id).map((link) => link.frameworkControlId),
      }))}
      commonMappings={commonMappings.map((mapping) => ({
        ...mapping,
        createdAt: mapping.createdAt.toISOString(),
        sourceLabel: controlLabel.get(mapping.sourceFrameworkControlId) ?? mapping.sourceFrameworkControlId,
        targetLabel: controlLabel.get(mapping.targetFrameworkControlId) ?? mapping.targetFrameworkControlId,
      }))}
      sourceControls={sourceControls}
      reuseLinks={reuseLinks.map((link) => {
        const item = evidenceById.get(link.sourceEvidenceItemId);
        return {
          ...link,
          filename: item?.filename ?? 'Evidence record',
          sourceEngagementName: item ? engagementById.get(item.engagementId) ?? 'Source assessment' : 'Source assessment',
          targetControlLabel: controlLabel.get(link.targetFrameworkControlId) ?? link.targetFrameworkControlId,
          validUntil: link.validUntil.toISOString(),
          decidedAt: link.decidedAt?.toISOString() ?? null,
          revokedAt: link.revokedAt?.toISOString() ?? null,
          createdAt: link.createdAt.toISOString(),
        };
      })}
    />
  );
}
