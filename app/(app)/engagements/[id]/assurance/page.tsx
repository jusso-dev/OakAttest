import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { engagements } from '@/db/schema/engagements';
import { engagementControls, frameworks } from '@/db/schema/frameworks';
import {
  continuousMonitoringPlans,
  monitoringEvents,
  riskTreatmentDecisions,
  systemAuthorisations,
  systemRisks,
} from '@/db/schema/assurance-lifecycle';
import { requirePageSession } from '@/lib/auth/session';
import { userTimeZone } from '@/lib/auth/user-timezone';
import { requirePermission, rolesForUser } from '@/lib/rbac/require';
import { ACTIONS, isPermitted } from '@/lib/rbac/matrix';
import {
  buildLifecycleStages,
  riskRating,
  type AuthorisationStatus,
  type RiskTreatmentDecision,
} from '@/lib/assurance-lifecycle';
import { formatDateTimeInput } from '@/lib/timezone';
import { AssuranceLifecycleWorkspace } from '@/components/engagement/AssuranceLifecycleWorkspace';

export const metadata = { title: 'Assurance lifecycle · Assessment Platform' };

export default async function AssuranceLifecyclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePageSession();
  const [engagement] = await db
    .select({
      id: engagements.id,
      tenantId: engagements.tenantId,
      boundaryLockedAt: engagements.boundaryLockedAt,
      frameworkLabel: frameworks.label,
    })
    .from(engagements)
    .innerJoin(frameworks, eq(frameworks.id, engagements.frameworkId))
    .where(and(eq(engagements.id, id), isNull(engagements.deletedAt)))
    .limit(1);
  if (!engagement) throw new Error('Engagement not found');

  await requirePermission(ACTIONS.assuranceLifecycleView, {
    userId: session.user.id,
    tenantId: engagement.tenantId,
    engagementId: id,
  });
  const [timeZone, roles] = await Promise.all([
    userTimeZone(session.user.id),
    rolesForUser({ userId: session.user.id, tenantId: engagement.tenantId, engagementId: id }),
  ]);

  const [controls, risks, treatments, authorisations, plans, events] = await Promise.all([
    db
      .select({ status: engagementControls.status })
      .from(engagementControls)
      .where(and(eq(engagementControls.tenantId, engagement.tenantId), eq(engagementControls.engagementId, id))),
    db
      .select()
      .from(systemRisks)
      .where(and(eq(systemRisks.tenantId, engagement.tenantId), eq(systemRisks.engagementId, id)))
      .orderBy(asc(systemRisks.sequence)),
    db
      .select()
      .from(riskTreatmentDecisions)
      .where(and(eq(riskTreatmentDecisions.tenantId, engagement.tenantId), eq(riskTreatmentDecisions.engagementId, id)))
      .orderBy(desc(riskTreatmentDecisions.createdAt)),
    db
      .select()
      .from(systemAuthorisations)
      .where(and(eq(systemAuthorisations.tenantId, engagement.tenantId), eq(systemAuthorisations.engagementId, id)))
      .orderBy(desc(systemAuthorisations.version)),
    db
      .select()
      .from(continuousMonitoringPlans)
      .where(and(eq(continuousMonitoringPlans.tenantId, engagement.tenantId), eq(continuousMonitoringPlans.engagementId, id)))
      .limit(1),
    db
      .select()
      .from(monitoringEvents)
      .where(and(eq(monitoringEvents.tenantId, engagement.tenantId), eq(monitoringEvents.engagementId, id)))
      .orderBy(desc(monitoringEvents.detectedAt)),
  ]);

  const latestTreatmentByRisk = new Map<string, (typeof treatments)[number]>();
  for (const treatment of treatments) {
    if (!latestTreatmentByRisk.has(treatment.riskId)) latestTreatmentByRisk.set(treatment.riskId, treatment);
  }
  const now = new Date();
  const untreatedHighRiskCount = risks.filter((risk) => {
    const rating = riskRating(risk.residualLikelihood, risk.residualImpact);
    if (rating !== 'high' && rating !== 'extreme') return false;
    const treatment = latestTreatmentByRisk.get(risk.id);
    if (!treatment) return true;
    return treatment.decision === 'accept' && (!treatment.expiresAt || treatment.expiresAt <= now);
  }).length;
  const latestAuthorisation = authorisations[0];
  const monitoringPlan = plans[0] ?? null;
  const stages = buildLifecycleStages({
    boundaryLocked: Boolean(engagement.boundaryLockedAt),
    assessedControlCount: controls.filter((control) => control.status !== 'not_started').length,
    totalControlCount: controls.length,
    riskCount: risks.length,
    untreatedHighRiskCount,
    authorisationStatus: latestAuthorisation?.status as AuthorisationStatus | undefined,
    monitoringPlanStatus: monitoringPlan?.status,
    openReassessmentEvents: events.filter((event) => event.requiresReassessment && event.status !== 'closed').length,
  });
  const permitted = (action: Parameters<typeof isPermitted>[0]) => roles.some((role) => isPermitted(action, role));

  return (
    <AssuranceLifecycleWorkspace
      engagementId={id}
      frameworkLabel={engagement.frameworkLabel}
      stages={stages}
      timeZone={timeZone}
      currentLocalDateTime={formatDateTimeInput(now, timeZone)}
      permissions={{
        canAssessRisk: permitted(ACTIONS.riskAssess),
        canTreatRisk: permitted(ACTIONS.riskTreat),
        canAcceptRisk: permitted(ACTIONS.riskAccept),
        canAuthorise: permitted(ACTIONS.systemAuthorise),
        canManageMonitoring: permitted(ACTIONS.monitoringManage),
        canRecordMonitoringEvent: permitted(ACTIONS.monitoringEventCreate),
      }}
      risks={risks.map((risk) => {
        const treatment = latestTreatmentByRisk.get(risk.id);
        return {
          id: risk.id,
          code: risk.code,
          title: risk.title,
          description: risk.description,
          asset: risk.asset,
          threat: risk.threat,
          vulnerability: risk.vulnerability,
          inherentLikelihood: risk.inherentLikelihood,
          inherentImpact: risk.inherentImpact,
          existingControls: risk.existingControls,
          residualLikelihood: risk.residualLikelihood,
          residualImpact: risk.residualImpact,
          ownerName: risk.ownerName,
          status: risk.status,
          createdAt: risk.createdAt.toISOString(),
          latestTreatment: treatment ? {
            id: treatment.id,
            decision: treatment.decision as RiskTreatmentDecision,
            rationale: treatment.rationale,
            treatmentPlan: treatment.treatmentPlan,
            ownerName: treatment.ownerName,
            dueAt: treatment.dueAt?.toISOString() ?? null,
            acceptedByName: treatment.acceptedByName,
            acceptedByRole: treatment.acceptedByRole,
            acceptedAt: treatment.acceptedAt?.toISOString() ?? null,
            expiresAt: treatment.expiresAt?.toISOString() ?? null,
            createdAt: treatment.createdAt.toISOString(),
          } : null,
        };
      })}
      authorisations={authorisations.map((record) => ({
        id: record.id,
        version: record.version,
        status: record.status,
        systemOwnerName: record.systemOwnerName,
        authorisingOfficerName: record.authorisingOfficerName,
        authorisingOfficerRole: record.authorisingOfficerRole,
        decisionStatement: record.decisionStatement,
        conditions: record.conditions,
        issuedAt: record.issuedAt?.toISOString() ?? null,
        expiresAt: record.expiresAt?.toISOString() ?? null,
        createdAt: record.createdAt.toISOString(),
      }))}
      monitoringPlan={monitoringPlan ? {
        status: monitoringPlan.status,
        objectives: monitoringPlan.objectives,
        cadenceDays: monitoringPlan.cadenceDays,
        ownerName: monitoringPlan.ownerName,
        ownerEmail: monitoringPlan.ownerEmail,
        monitoredSignals: monitoringPlan.monitoredSignals,
        changeTriggers: monitoringPlan.changeTriggers,
        nextReviewAt: monitoringPlan.nextReviewAt.toISOString(),
        nextReviewInput: formatDateTimeInput(monitoringPlan.nextReviewAt, timeZone),
        lastReviewedAt: monitoringPlan.lastReviewedAt?.toISOString() ?? null,
        lastReviewedInput: monitoringPlan.lastReviewedAt ? formatDateTimeInput(monitoringPlan.lastReviewedAt, timeZone) : '',
      } : null}
      events={events.map((event) => ({
        id: event.id,
        type: event.type,
        severity: event.severity,
        title: event.title,
        description: event.description,
        source: event.source,
        relatedRiskId: event.relatedRiskId,
        detectedAt: event.detectedAt.toISOString(),
        requiresReassessment: event.requiresReassessment,
        status: event.status,
        triageNotes: event.triageNotes,
        closedAt: event.closedAt?.toISOString() ?? null,
      }))}
    />
  );
}
