'use server';

import { z } from 'zod';
import { and, eq, inArray, max } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import crypto from 'node:crypto';
import { db } from '@/lib/db/client';
import {
  findings,
  findingControls,
  findingEvidence,
  remediationActions,
  findingRetests,
  findingRiskAcceptances,
} from '@/db/schema/findings';
import { engagements } from '@/db/schema/engagements';
import { evidenceItems } from '@/db/schema/evidence';
import { residualRisks } from '@/db/schema/certification';
import { auditLog } from '@/db/schema/audit';
import { requireSession } from '@/lib/auth/session';
import { requirePermission } from '@/lib/rbac/require';
import { ACTIONS } from '@/lib/rbac/matrix';

async function tenantForEngagement(engagementId: string): Promise<string> {
  const [row] = await db
    .select({ tenantId: engagements.tenantId })
    .from(engagements)
    .where(eq(engagements.id, engagementId))
    .limit(1);
  if (!row) throw new Error('Engagement not found');
  return row.tenantId;
}

async function assertEvidenceItemsInEngagement(input: {
  tenantId: string;
  engagementId: string;
  evidenceItemIds?: string[];
}) {
  const ids = input.evidenceItemIds ?? [];
  if (ids.length === 0) return;
  const rows = await db
    .select({ id: evidenceItems.id })
    .from(evidenceItems)
    .where(
      and(
        eq(evidenceItems.tenantId, input.tenantId),
        eq(evidenceItems.engagementId, input.engagementId),
        inArray(evidenceItems.id, ids),
      ),
    );
  const allowed = new Set(rows.map((row) => row.id));
  if (ids.some((id) => !allowed.has(id))) {
    throw new Error('Evidence item not found in this engagement');
  }
}

const createSchema = z.object({
  engagementId: z.string().uuid(),
  type: z.enum(['non_conformance', 'observation']),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  title: z.string().min(2).max(300),
  description: z.string().min(10).max(8000),
  recommendation: z.string().max(8000).optional(),
  ismControlIds: z.array(z.string().uuid()).optional(),
  evidenceItemIds: z.array(z.string().uuid()).optional(),
});

export async function createFinding(input: z.infer<typeof createSchema>) {
  const session = await requireSession();
  const data = createSchema.parse(input);
  const tenantId = await tenantForEngagement(data.engagementId);

  await requirePermission(ACTIONS.findingCreate, {
    userId: session.user.id,
    tenantId,
    engagementId: data.engagementId,
  });
  await assertEvidenceItemsInEngagement({
    tenantId,
    engagementId: data.engagementId,
    evidenceItemIds: data.evidenceItemIds,
  });

  const id = crypto.randomUUID();

  await db.transaction(async (tx) => {
    const [last] = await tx
      .select({ max: max(findings.sequence) })
      .from(findings)
      .where(and(eq(findings.tenantId, tenantId), eq(findings.engagementId, data.engagementId)));
    const sequence = (last?.max ?? 0) + 1;
    const code = `FND-${String(sequence).padStart(3, '0')}`;

    await tx.insert(findings).values({
      id,
      engagementId: data.engagementId,
      tenantId,
      sequence,
      code,
      type: data.type,
      severity: data.severity,
      title: data.title,
      description: data.description,
      recommendation: data.recommendation ?? null,
      reportedBy: session.user.id,
    });
    if (data.ismControlIds?.length) {
      await tx.insert(findingControls).values(
        data.ismControlIds.map((cid) => ({ findingId: id, ismControlId: cid })),
      );
    }
    if (data.evidenceItemIds?.length) {
      await tx.insert(findingEvidence).values(
        data.evidenceItemIds.map((eid) => ({ findingId: id, evidenceItemId: eid })),
      );
    }
    await tx.insert(auditLog).values({
      tenantId,
      engagementId: data.engagementId,
      actorUserId: session.user.id,
      action: 'finding.create',
      resourceType: 'finding',
      resourceId: id,
      afterJson: { code, type: data.type, severity: data.severity } as never,
    });
  });

  revalidatePath(`/engagements/${data.engagementId}/findings`);
  return { id };
}

const signOffSchema = z.object({
  engagementId: z.string().uuid(),
  findingId: z.string().uuid(),
});

export async function signOffFinding(input: z.infer<typeof signOffSchema>) {
  const session = await requireSession();
  const data = signOffSchema.parse(input);
  const tenantId = await tenantForEngagement(data.engagementId);

  await requirePermission(ACTIONS.findingSignOff, {
    userId: session.user.id,
    tenantId,
    engagementId: data.engagementId,
  });

  await db.transaction(async (tx) => {
    await tx
      .update(findings)
      .set({ signedOffBy: session.user.id, signedOffAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(findings.id, data.findingId),
          eq(findings.tenantId, tenantId),
          eq(findings.engagementId, data.engagementId),
        ),
      );
    await tx.insert(auditLog).values({
      tenantId,
      engagementId: data.engagementId,
      actorUserId: session.user.id,
      action: 'finding.sign_off',
      resourceType: 'finding',
      resourceId: data.findingId,
    });
  });

  revalidatePath(`/engagements/${data.engagementId}/findings`);
  return { ok: true };
}

const updateStatusSchema = z.object({
  engagementId: z.string().uuid(),
  findingId: z.string().uuid(),
  status: z.enum(['open', 'in_progress', 'awaiting_retest', 'closed', 'accepted_risk']),
});

export async function updateFindingStatus(input: z.infer<typeof updateStatusSchema>) {
  const session = await requireSession();
  const data = updateStatusSchema.parse(input);
  const tenantId = await tenantForEngagement(data.engagementId);

  await requirePermission(ACTIONS.findingUpdate, {
    userId: session.user.id,
    tenantId,
    engagementId: data.engagementId,
  });

  await db.transaction(async (tx) => {
    const [finding] = await tx
      .select({ type: findings.type, signedOffAt: findings.signedOffAt })
      .from(findings)
      .where(
        and(
          eq(findings.id, data.findingId),
          eq(findings.tenantId, tenantId),
          eq(findings.engagementId, data.engagementId),
        ),
      )
      .limit(1);
    if (!finding) throw new Error('Finding not found');
    if (data.status === 'closed' && finding.type === 'non_conformance' && !finding.signedOffAt) {
      throw new Error('Non-conformances require lead assessor sign-off before closure.');
    }
    await tx
      .update(findings)
      .set({
        status: data.status,
        closedAt: data.status === 'closed' ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(findings.id, data.findingId),
          eq(findings.tenantId, tenantId),
          eq(findings.engagementId, data.engagementId),
        ),
      );
    await tx.insert(auditLog).values({
      tenantId,
      engagementId: data.engagementId,
      actorUserId: session.user.id,
      action: 'finding.status',
      resourceType: 'finding',
      resourceId: data.findingId,
      afterJson: { status: data.status } as never,
    });
  });

  revalidatePath(`/engagements/${data.engagementId}/findings`);
  return { ok: true };
}

const retestSchema = z.object({
  engagementId: z.string().uuid(),
  findingId: z.string().uuid(),
  method: z.string().min(2).max(1000),
  result: z.enum(['passed', 'failed', 'partially_remediated']),
  notes: z.string().max(4000).optional(),
  evidenceItemIds: z.array(z.string().uuid()).optional(),
});

export async function recordFindingRetest(input: z.infer<typeof retestSchema>) {
  const session = await requireSession();
  const data = retestSchema.parse(input);
  const tenantId = await tenantForEngagement(data.engagementId);

  await requirePermission(ACTIONS.findingUpdate, {
    userId: session.user.id,
    tenantId,
    engagementId: data.engagementId,
  });
  await assertEvidenceItemsInEngagement({
    tenantId,
    engagementId: data.engagementId,
    evidenceItemIds: data.evidenceItemIds,
  });

  const id = crypto.randomUUID();
  await db.transaction(async (tx) => {
    const [finding] = await tx
      .select({ id: findings.id })
      .from(findings)
      .where(
        and(
          eq(findings.id, data.findingId),
          eq(findings.tenantId, tenantId),
          eq(findings.engagementId, data.engagementId),
        ),
      )
      .limit(1);
    if (!finding) throw new Error('Finding not found');
    await tx.insert(findingRetests).values({
      id,
      findingId: data.findingId,
      engagementId: data.engagementId,
      tenantId,
      method: data.method,
      result: data.result,
      notes: data.notes ?? null,
      evidenceItemIds: (data.evidenceItemIds ?? null) as never,
      retestedBy: session.user.id,
    });
    await tx
      .update(findings)
      .set({
        status: data.result === 'passed' ? 'awaiting_retest' : 'in_progress',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(findings.id, data.findingId),
          eq(findings.tenantId, tenantId),
          eq(findings.engagementId, data.engagementId),
        ),
      );
    await tx.insert(auditLog).values({
      tenantId,
      engagementId: data.engagementId,
      actorUserId: session.user.id,
      action: 'finding.retest',
      resourceType: 'finding',
      resourceId: data.findingId,
      afterJson: { result: data.result, evidenceCount: data.evidenceItemIds?.length ?? 0 } as never,
    });
  });

  revalidatePath(`/engagements/${data.engagementId}/findings`);
  return { id };
}

const acceptRiskSchema = z.object({
  engagementId: z.string().uuid(),
  findingId: z.string().uuid(),
  acceptedByName: z.string().min(2).max(200),
  acceptedAt: z.string().datetime(),
  rationale: z.string().min(10).max(4000),
  residualRiskId: z.string().uuid().optional(),
});

export async function acceptFindingRisk(input: z.infer<typeof acceptRiskSchema>) {
  const session = await requireSession();
  const data = acceptRiskSchema.parse(input);
  const tenantId = await tenantForEngagement(data.engagementId);

  await requirePermission(ACTIONS.findingUpdate, {
    userId: session.user.id,
    tenantId,
    engagementId: data.engagementId,
  });
  if (data.residualRiskId) {
    const [risk] = await db
      .select({ id: residualRisks.id })
      .from(residualRisks)
      .where(
        and(
          eq(residualRisks.id, data.residualRiskId),
          eq(residualRisks.tenantId, tenantId),
          eq(residualRisks.engagementId, data.engagementId),
        ),
      )
      .limit(1);
    if (!risk) throw new Error('Residual risk not found in this engagement');
  }

  const id = crypto.randomUUID();
  await db.transaction(async (tx) => {
    const [finding] = await tx
      .select({ id: findings.id })
      .from(findings)
      .where(
        and(
          eq(findings.id, data.findingId),
          eq(findings.tenantId, tenantId),
          eq(findings.engagementId, data.engagementId),
        ),
      )
      .limit(1);
    if (!finding) throw new Error('Finding not found');
    await tx.insert(findingRiskAcceptances).values({
      id,
      findingId: data.findingId,
      engagementId: data.engagementId,
      tenantId,
      acceptedByName: data.acceptedByName,
      acceptedAt: new Date(data.acceptedAt),
      rationale: data.rationale,
      residualRiskId: data.residualRiskId ?? null,
      recordedBy: session.user.id,
    });
    await tx
      .update(findings)
      .set({ status: 'accepted_risk', updatedAt: new Date(), closedAt: new Date() })
      .where(
        and(
          eq(findings.id, data.findingId),
          eq(findings.tenantId, tenantId),
          eq(findings.engagementId, data.engagementId),
        ),
      );
    await tx.insert(auditLog).values({
      tenantId,
      engagementId: data.engagementId,
      actorUserId: session.user.id,
      action: 'finding.risk_accept',
      resourceType: 'finding',
      resourceId: data.findingId,
      afterJson: {
        acceptedByName: data.acceptedByName,
        residualRiskId: data.residualRiskId ?? null,
      } as never,
    });
  });

  revalidatePath(`/engagements/${data.engagementId}/findings`);
  return { id };
}

// Remediation actions are owned by the client side.
const createRemediationSchema = z.object({
  engagementId: z.string().uuid(),
  findingId: z.string().uuid(),
  description: z.string().min(2).max(4000),
  ownerName: z.string().max(200).optional(),
  ownerEmail: z.string().email().optional(),
  dueDate: z.string().datetime().optional(),
});

export async function createRemediationAction(input: z.infer<typeof createRemediationSchema>) {
  const session = await requireSession();
  const data = createRemediationSchema.parse(input);
  const tenantId = await tenantForEngagement(data.engagementId);

  // Remediation guidance is client-only (§15 independence guard).
  await requirePermission(ACTIONS.remediationGuidanceWrite, {
    userId: session.user.id,
    tenantId,
    engagementId: data.engagementId,
  });

  const id = crypto.randomUUID();
  await db.transaction(async (tx) => {
    const [finding] = await tx
      .select({ id: findings.id })
      .from(findings)
      .where(
        and(
          eq(findings.id, data.findingId),
          eq(findings.tenantId, tenantId),
          eq(findings.engagementId, data.engagementId),
        ),
      )
      .limit(1);
    if (!finding) throw new Error('Finding not found');

    await tx.insert(remediationActions).values({
      id,
      findingId: data.findingId,
      engagementId: data.engagementId,
      tenantId,
      description: data.description,
      ownerName: data.ownerName ?? null,
      ownerEmail: data.ownerEmail ?? null,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      createdBy: session.user.id,
    });
    await tx.insert(auditLog).values({
      tenantId,
      engagementId: data.engagementId,
      actorUserId: session.user.id,
      action: 'remediation_action.create',
      resourceType: 'remediation_action',
      resourceId: id,
    });
  });

  revalidatePath(`/engagements/${data.engagementId}/findings`);
  return { id };
}

const updateRemediationSchema = z.object({
  engagementId: z.string().uuid(),
  remediationActionId: z.string().uuid(),
  status: z.enum(['open', 'in_progress', 'ready_for_retest', 'closed']).optional(),
  proofEvidenceItemId: z.string().uuid().nullable().optional(),
  notes: z.string().max(4000).optional(),
});

export async function updateRemediationAction(input: z.infer<typeof updateRemediationSchema>) {
  const session = await requireSession();
  const data = updateRemediationSchema.parse(input);
  const tenantId = await tenantForEngagement(data.engagementId);

  await requirePermission(ACTIONS.remediationGuidanceWrite, {
    userId: session.user.id,
    tenantId,
    engagementId: data.engagementId,
  });

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (data.status) {
    patch.status = data.status;
    if (data.status === 'closed') patch.closedAt = new Date();
  }
  if (data.proofEvidenceItemId !== undefined) patch.proofEvidenceItemId = data.proofEvidenceItemId;
  if (data.notes !== undefined) patch.notes = data.notes;
  await assertEvidenceItemsInEngagement({
    tenantId,
    engagementId: data.engagementId,
    evidenceItemIds: data.proofEvidenceItemId ? [data.proofEvidenceItemId] : [],
  });

  await db.transaction(async (tx) => {
    await tx
      .update(remediationActions)
      .set(patch as never)
      .where(
        and(
          eq(remediationActions.id, data.remediationActionId),
          eq(remediationActions.tenantId, tenantId),
          eq(remediationActions.engagementId, data.engagementId),
        ),
      );
    await tx.insert(auditLog).values({
      tenantId,
      engagementId: data.engagementId,
      actorUserId: session.user.id,
      action: 'remediation_action.update',
      resourceType: 'remediation_action',
      resourceId: data.remediationActionId,
      afterJson: patch as never,
    });
  });

  revalidatePath(`/engagements/${data.engagementId}/findings`);
  return { ok: true };
}
