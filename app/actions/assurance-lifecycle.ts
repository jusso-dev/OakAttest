'use server';

import crypto from 'node:crypto';
import { z } from 'zod';
import { and, desc, eq, max } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db/client';
import { engagements } from '@/db/schema/engagements';
import { auditLog } from '@/db/schema/audit';
import {
  continuousMonitoringPlans,
  monitoringEvents,
  riskTreatmentDecisions,
  systemAuthorisations,
  systemRisks,
} from '@/db/schema/assurance-lifecycle';
import { requireSession } from '@/lib/auth/session';
import { userTimeZone } from '@/lib/auth/user-timezone';
import { requirePermission } from '@/lib/rbac/require';
import { ACTIONS } from '@/lib/rbac/matrix';
import {
  AUTHORISATION_STATUSES,
  MONITORING_EVENT_TYPES,
  RISK_TREATMENT_DECISIONS,
  monitoringEventRequiresReassessment,
  validateAuthorisationDecision,
  validateRiskTreatmentDecision,
  type RiskTreatmentDecision,
} from '@/lib/assurance-lifecycle';
import { zonedDateEndToUtc, zonedDateTimeToUtc } from '@/lib/timezone';

async function tenantForEngagement(engagementId: string): Promise<string> {
  const [row] = await db
    .select({ tenantId: engagements.tenantId })
    .from(engagements)
    .where(eq(engagements.id, engagementId))
    .limit(1);
  if (!row) throw new Error('Engagement not found');
  return row.tenantId;
}

function dateTime(value: string | undefined, timeZone: string): Date | null {
  return value ? zonedDateTimeToUtc(value, timeZone) : null;
}

function dateEnd(value: string | undefined, timeZone: string): Date | null {
  return value ? zonedDateEndToUtc(value, timeZone) : null;
}

function revalidateAssurance(engagementId: string) {
  revalidatePath(`/engagements/${engagementId}/assurance`);
  revalidatePath(`/engagements/${engagementId}/overview`);
}

const createRiskSchema = z.object({
  engagementId: z.string().uuid(),
  title: z.string().min(3).max(300),
  description: z.string().min(10).max(8000),
  asset: z.string().min(2).max(500),
  threat: z.string().min(2).max(2000),
  vulnerability: z.string().min(2).max(2000),
  inherentLikelihood: z.coerce.number().int().min(1).max(5),
  inherentImpact: z.coerce.number().int().min(1).max(5),
  existingControls: z.string().max(8000).optional(),
  residualLikelihood: z.coerce.number().int().min(1).max(5),
  residualImpact: z.coerce.number().int().min(1).max(5),
  ownerName: z.string().max(200).optional(),
  ownerEmail: z.string().email().max(320).or(z.literal('')).optional(),
});

export async function createSystemRisk(input: z.input<typeof createRiskSchema>) {
  const session = await requireSession();
  const data = createRiskSchema.parse(input);
  const tenantId = await tenantForEngagement(data.engagementId);
  await requirePermission(ACTIONS.riskAssess, {
    userId: session.user.id,
    tenantId,
    engagementId: data.engagementId,
  });

  const id = crypto.randomUUID();
  await db.transaction(async (tx) => {
    const [last] = await tx
      .select({ value: max(systemRisks.sequence) })
      .from(systemRisks)
      .where(and(eq(systemRisks.tenantId, tenantId), eq(systemRisks.engagementId, data.engagementId)));
    const sequence = (last?.value ?? 0) + 1;
    const code = `RSK-${String(sequence).padStart(3, '0')}`;
    await tx.insert(systemRisks).values({
      id,
      engagementId: data.engagementId,
      tenantId,
      sequence,
      code,
      title: data.title,
      description: data.description,
      asset: data.asset,
      threat: data.threat,
      vulnerability: data.vulnerability,
      inherentLikelihood: data.inherentLikelihood,
      inherentImpact: data.inherentImpact,
      existingControls: data.existingControls || null,
      residualLikelihood: data.residualLikelihood,
      residualImpact: data.residualImpact,
      ownerName: data.ownerName || null,
      ownerEmail: data.ownerEmail || null,
      createdBy: session.user.id,
      updatedBy: session.user.id,
    });
    await tx.insert(auditLog).values({
      tenantId,
      engagementId: data.engagementId,
      actorUserId: session.user.id,
      action: 'risk.create',
      resourceType: 'system_risk',
      resourceId: id,
      afterJson: { code, title: data.title } as never,
    });
  });
  revalidateAssurance(data.engagementId);
  return { id };
}

const treatmentSchema = z.object({
  engagementId: z.string().uuid(),
  riskId: z.string().uuid(),
  decision: z.enum(RISK_TREATMENT_DECISIONS),
  rationale: z.string().min(1).max(8000),
  treatmentPlan: z.string().max(8000).optional(),
  ownerName: z.string().max(200).optional(),
  ownerEmail: z.string().email().max(320).or(z.literal('')).optional(),
  dueDate: z.string().optional(),
  acceptedByName: z.string().max(200).optional(),
  acceptedByRole: z.string().max(200).optional(),
  acceptedAt: z.string().optional(),
  expiresOn: z.string().optional(),
});

export async function recordRiskTreatmentDecision(input: z.input<typeof treatmentSchema>) {
  const session = await requireSession();
  const data = treatmentSchema.parse(input);
  const tenantId = await tenantForEngagement(data.engagementId);
  await requirePermission(ACTIONS.riskTreat, {
    userId: session.user.id,
    tenantId,
    engagementId: data.engagementId,
  });
  if (data.decision === 'accept') {
    await requirePermission(ACTIONS.riskAccept, {
      userId: session.user.id,
      tenantId,
      engagementId: data.engagementId,
    });
  }

  const [risk] = await db
    .select({ id: systemRisks.id })
    .from(systemRisks)
    .where(
      and(
        eq(systemRisks.id, data.riskId),
        eq(systemRisks.tenantId, tenantId),
        eq(systemRisks.engagementId, data.engagementId),
      ),
    )
    .limit(1);
  if (!risk) throw new Error('Risk not found in this engagement');

  const timeZone = await userTimeZone(session.user.id);
  const dueAt = dateEnd(data.dueDate, timeZone);
  const acceptedAt = dateTime(data.acceptedAt, timeZone);
  const expiresAt = dateEnd(data.expiresOn, timeZone);
  const errors = validateRiskTreatmentDecision({
    decision: data.decision,
    rationale: data.rationale,
    treatmentPlan: data.treatmentPlan,
    ownerName: data.ownerName,
    dueAt,
    acceptedByName: data.acceptedByName,
    acceptedByRole: data.acceptedByRole,
    acceptedAt,
    expiresAt,
  });
  if (errors.length) throw new Error(errors.join(' '));

  const id = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(riskTreatmentDecisions).values({
      id,
      riskId: data.riskId,
      engagementId: data.engagementId,
      tenantId,
      decision: data.decision,
      rationale: data.rationale,
      treatmentPlan: data.treatmentPlan || null,
      ownerName: data.ownerName || null,
      ownerEmail: data.ownerEmail || null,
      dueAt,
      acceptedByName: data.acceptedByName || null,
      acceptedByRole: data.acceptedByRole || null,
      acceptedAt,
      expiresAt,
      recordedBy: session.user.id,
    });
    await tx
      .update(systemRisks)
      .set({ status: data.decision === 'accept' ? 'monitoring' : 'treating', updatedBy: session.user.id, updatedAt: new Date() })
      .where(and(eq(systemRisks.id, data.riskId), eq(systemRisks.tenantId, tenantId)));
    await tx.insert(auditLog).values({
      tenantId,
      engagementId: data.engagementId,
      actorUserId: session.user.id,
      action: data.decision === 'accept' ? 'risk.accept' : 'risk.treatment_decide',
      resourceType: 'system_risk',
      resourceId: data.riskId,
      afterJson: { decisionId: id, decision: data.decision, expiresAt: expiresAt?.toISOString() } as never,
    });
  });
  revalidateAssurance(data.engagementId);
  return { id };
}

const authorisationSchema = z.object({
  engagementId: z.string().uuid(),
  status: z.enum(AUTHORISATION_STATUSES),
  systemOwnerName: z.string().min(2).max(200),
  authorisingOfficerName: z.string().max(200).optional(),
  authorisingOfficerRole: z.string().max(200).optional(),
  decisionStatement: z.string().max(8000).optional(),
  conditions: z.string().max(8000).optional(),
  issuedAt: z.string().optional(),
  expiresOn: z.string().optional(),
});

export async function recordSystemAuthorisation(input: z.input<typeof authorisationSchema>) {
  const session = await requireSession();
  const data = authorisationSchema.parse(input);
  const tenantId = await tenantForEngagement(data.engagementId);
  await requirePermission(ACTIONS.systemAuthorise, {
    userId: session.user.id,
    tenantId,
    engagementId: data.engagementId,
  });
  const timeZone = await userTimeZone(session.user.id);
  const issuedAt = dateTime(data.issuedAt, timeZone);
  const expiresAt = dateEnd(data.expiresOn, timeZone);

  const [risks, treatments] = await Promise.all([
    db
      .select({
        id: systemRisks.id,
        code: systemRisks.code,
        title: systemRisks.title,
        residualLikelihood: systemRisks.residualLikelihood,
        residualImpact: systemRisks.residualImpact,
        status: systemRisks.status,
      })
      .from(systemRisks)
      .where(and(eq(systemRisks.tenantId, tenantId), eq(systemRisks.engagementId, data.engagementId))),
    db
      .select({
        id: riskTreatmentDecisions.id,
        riskId: riskTreatmentDecisions.riskId,
        decision: riskTreatmentDecisions.decision,
        acceptedAt: riskTreatmentDecisions.acceptedAt,
        expiresAt: riskTreatmentDecisions.expiresAt,
        createdAt: riskTreatmentDecisions.createdAt,
      })
      .from(riskTreatmentDecisions)
      .where(and(eq(riskTreatmentDecisions.tenantId, tenantId), eq(riskTreatmentDecisions.engagementId, data.engagementId)))
      .orderBy(desc(riskTreatmentDecisions.createdAt)),
  ]);
  const latestByRisk = new Map<string, (typeof treatments)[number]>();
  for (const treatment of treatments) {
    if (!latestByRisk.has(treatment.riskId)) latestByRisk.set(treatment.riskId, treatment);
  }
  const validationRisks = risks.map((risk) => {
    const latest = latestByRisk.get(risk.id);
    return {
      ...risk,
      latestTreatment: latest
        ? {
            decision: latest.decision as RiskTreatmentDecision,
            acceptedAt: latest.acceptedAt,
            expiresAt: latest.expiresAt,
          }
        : null,
    };
  });
  const errors = validateAuthorisationDecision(
    {
      status: data.status,
      authorisingOfficerName: data.authorisingOfficerName,
      authorisingOfficerRole: data.authorisingOfficerRole,
      decisionStatement: data.decisionStatement,
      conditions: data.conditions,
      issuedAt,
      expiresAt,
    },
    validationRisks,
  );
  if (errors.length) throw new Error(errors.join(' '));

  const id = crypto.randomUUID();
  await db.transaction(async (tx) => {
    const [last] = await tx
      .select({ value: max(systemAuthorisations.version) })
      .from(systemAuthorisations)
      .where(and(eq(systemAuthorisations.tenantId, tenantId), eq(systemAuthorisations.engagementId, data.engagementId)));
    const version = (last?.value ?? 0) + 1;
    const riskSnapshot = risks.map((risk) => ({
      ...risk,
      latestTreatment: latestByRisk.get(risk.id) ?? null,
    }));
    await tx.insert(systemAuthorisations).values({
      id,
      engagementId: data.engagementId,
      tenantId,
      version,
      status: data.status,
      systemOwnerName: data.systemOwnerName,
      authorisingOfficerName: data.authorisingOfficerName || null,
      authorisingOfficerRole: data.authorisingOfficerRole || null,
      decisionStatement: data.decisionStatement || null,
      conditions: data.conditions || null,
      issuedAt,
      expiresAt,
      riskSnapshot: riskSnapshot as never,
      decidedBy: session.user.id,
    });
    await tx.insert(auditLog).values({
      tenantId,
      engagementId: data.engagementId,
      actorUserId: session.user.id,
      action: 'system.authorisation_record',
      resourceType: 'system_authorisation',
      resourceId: id,
      afterJson: { version, status: data.status, riskCount: risks.length } as never,
    });
  });
  revalidateAssurance(data.engagementId);
  return { id };
}

const monitoringPlanSchema = z.object({
  engagementId: z.string().uuid(),
  status: z.enum(['draft', 'active', 'paused', 'retired']),
  objectives: z.string().min(10).max(8000),
  cadenceDays: z.coerce.number().int().min(1).max(3650),
  ownerName: z.string().min(2).max(200),
  ownerEmail: z.string().email().max(320).or(z.literal('')).optional(),
  monitoredSignals: z.array(z.string().min(1).max(500)).max(100),
  changeTriggers: z.array(z.string().min(1).max(500)).max(100),
  nextReviewAt: z.string().min(1),
  lastReviewedAt: z.string().optional(),
});

export async function upsertContinuousMonitoringPlan(input: z.input<typeof monitoringPlanSchema>) {
  const session = await requireSession();
  const data = monitoringPlanSchema.parse(input);
  const tenantId = await tenantForEngagement(data.engagementId);
  await requirePermission(ACTIONS.monitoringManage, {
    userId: session.user.id,
    tenantId,
    engagementId: data.engagementId,
  });
  const timeZone = await userTimeZone(session.user.id);
  const values = {
    status: data.status,
    objectives: data.objectives,
    cadenceDays: data.cadenceDays,
    ownerName: data.ownerName,
    ownerEmail: data.ownerEmail || null,
    monitoredSignals: data.monitoredSignals,
    changeTriggers: data.changeTriggers,
    nextReviewAt: zonedDateTimeToUtc(data.nextReviewAt, timeZone),
    lastReviewedAt: dateTime(data.lastReviewedAt, timeZone),
    updatedBy: session.user.id,
    updatedAt: new Date(),
  };

  const id = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx
      .insert(continuousMonitoringPlans)
      .values({ id, engagementId: data.engagementId, tenantId, ...values })
      .onConflictDoUpdate({
        target: continuousMonitoringPlans.engagementId,
        set: values,
      });
    await tx.insert(auditLog).values({
      tenantId,
      engagementId: data.engagementId,
      actorUserId: session.user.id,
      action: 'monitoring.plan_upsert',
      resourceType: 'continuous_monitoring_plan',
      resourceId: data.engagementId,
      afterJson: { status: data.status, cadenceDays: data.cadenceDays } as never,
    });
  });
  revalidateAssurance(data.engagementId);
  return { ok: true };
}

const eventSchema = z.object({
  engagementId: z.string().uuid(),
  type: z.enum(MONITORING_EVENT_TYPES),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  title: z.string().min(3).max(300),
  description: z.string().min(10).max(8000),
  source: z.string().max(500).optional(),
  relatedRiskId: z.string().uuid().or(z.literal('')).optional(),
  detectedAt: z.string().min(1),
});

export async function createMonitoringEvent(input: z.input<typeof eventSchema>) {
  const session = await requireSession();
  const data = eventSchema.parse(input);
  const tenantId = await tenantForEngagement(data.engagementId);
  await requirePermission(ACTIONS.monitoringEventCreate, {
    userId: session.user.id,
    tenantId,
    engagementId: data.engagementId,
  });
  if (data.relatedRiskId) {
    const [risk] = await db
      .select({ id: systemRisks.id })
      .from(systemRisks)
      .where(
        and(
          eq(systemRisks.id, data.relatedRiskId),
          eq(systemRisks.tenantId, tenantId),
          eq(systemRisks.engagementId, data.engagementId),
        ),
      )
      .limit(1);
    if (!risk) throw new Error('Related risk not found in this engagement');
  }
  const timeZone = await userTimeZone(session.user.id);
  const detectedAt = zonedDateTimeToUtc(data.detectedAt, timeZone);
  const requiresReassessment = monitoringEventRequiresReassessment(data.type, data.severity);
  const id = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(monitoringEvents).values({
      id,
      engagementId: data.engagementId,
      tenantId,
      type: data.type,
      severity: data.severity,
      title: data.title,
      description: data.description,
      source: data.source || null,
      relatedRiskId: data.relatedRiskId || null,
      detectedAt,
      requiresReassessment,
      createdBy: session.user.id,
    });
    await tx.insert(auditLog).values({
      tenantId,
      engagementId: data.engagementId,
      actorUserId: session.user.id,
      action: 'monitoring.event_create',
      resourceType: 'monitoring_event',
      resourceId: id,
      afterJson: { type: data.type, severity: data.severity, requiresReassessment } as never,
    });
  });
  revalidateAssurance(data.engagementId);
  return { id };
}

const resolveEventSchema = z.object({
  engagementId: z.string().uuid(),
  eventId: z.string().uuid(),
  status: z.enum(['triaged', 'closed']),
  triageNotes: z.string().min(10).max(8000),
});

export async function resolveMonitoringEvent(input: z.input<typeof resolveEventSchema>) {
  const session = await requireSession();
  const data = resolveEventSchema.parse(input);
  const tenantId = await tenantForEngagement(data.engagementId);
  await requirePermission(ACTIONS.monitoringManage, {
    userId: session.user.id,
    tenantId,
    engagementId: data.engagementId,
  });
  const [event] = await db
    .select({ id: monitoringEvents.id, status: monitoringEvents.status })
    .from(monitoringEvents)
    .where(
      and(
        eq(monitoringEvents.id, data.eventId),
        eq(monitoringEvents.tenantId, tenantId),
        eq(monitoringEvents.engagementId, data.engagementId),
      ),
    )
    .limit(1);
  if (!event) throw new Error('Monitoring event not found');

  await db.transaction(async (tx) => {
    await tx
      .update(monitoringEvents)
      .set({
        status: data.status,
        triageNotes: data.triageNotes,
        closedBy: data.status === 'closed' ? session.user.id : null,
        closedAt: data.status === 'closed' ? new Date() : null,
      })
      .where(and(eq(monitoringEvents.id, data.eventId), eq(monitoringEvents.tenantId, tenantId)));
    await tx.insert(auditLog).values({
      tenantId,
      engagementId: data.engagementId,
      actorUserId: session.user.id,
      action: `monitoring.event_${data.status}`,
      resourceType: 'monitoring_event',
      resourceId: data.eventId,
      beforeJson: { status: event.status } as never,
      afterJson: { status: data.status } as never,
    });
  });
  revalidateAssurance(data.engagementId);
  return { ok: true };
}
