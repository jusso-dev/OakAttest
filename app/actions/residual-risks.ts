'use server';

import { z } from 'zod';
import { and, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import crypto from 'node:crypto';
import { db } from '@/lib/db/client';
import { residualRisks } from '@/db/schema/certification';
import { engagements } from '@/db/schema/engagements';
import { auditLog } from '@/db/schema/audit';
import { requireSession } from '@/lib/auth/session';
import { requirePermission } from '@/lib/rbac/require';
import { ACTIONS } from '@/lib/rbac/matrix';

const schema = z.object({
  engagementId: z.string().uuid(),
  title: z.string().min(2).max(300),
  description: z.string().min(10).max(8000),
  mitigation: z.string().max(8000).optional(),
  likelihood: z.string().max(100).optional(),
  impact: z.string().max(100).optional(),
});

const updateSchema = z.object({
  engagementId: z.string().uuid(),
  riskId: z.string().uuid(),
  title: z.string().min(2).max(300).optional(),
  description: z.string().min(10).max(8000).optional(),
  mitigation: z.string().max(8000).optional(),
  likelihood: z.string().max(100).optional(),
  impact: z.string().max(100).optional(),
});

const acceptSchema = z.object({
  engagementId: z.string().uuid(),
  riskId: z.string().uuid(),
  mitigation: z.string().max(8000).optional(),
  likelihood: z.string().max(100).optional(),
  impact: z.string().max(100).optional(),
});

function present(value: string | null | undefined) {
  const text = value?.trim();
  return text ? text : null;
}

async function loadEngagementTenant(engagementId: string) {
  const [eng] = await db
    .select({ tenantId: engagements.tenantId })
    .from(engagements)
    .where(and(eq(engagements.id, engagementId), isNull(engagements.deletedAt)))
    .limit(1);
  if (!eng) throw new Error('Engagement not found');
  return eng;
}

export async function addResidualRisk(input: z.infer<typeof schema>) {
  const session = await requireSession();
  const data = schema.parse(input);
  const eng = await loadEngagementTenant(data.engagementId);

  await requirePermission(ACTIONS.certificationGenerate, {
    userId: session.user.id,
    tenantId: eng.tenantId,
    engagementId: data.engagementId,
  });

  const id = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(residualRisks).values({
      id,
      engagementId: data.engagementId,
      tenantId: eng.tenantId,
      title: data.title,
      description: data.description,
      mitigation: data.mitigation ?? null,
      likelihood: data.likelihood ?? null,
      impact: data.impact ?? null,
      createdBy: session.user.id,
    });
    await tx.insert(auditLog).values({
      tenantId: eng.tenantId,
      engagementId: data.engagementId,
      actorUserId: session.user.id,
      action: 'residual_risk.add',
      resourceType: 'residual_risk',
      resourceId: id,
    });
  });
  revalidatePath(`/engagements/${data.engagementId}/certification`);
  return { id };
}

export async function updateResidualRisk(input: z.infer<typeof updateSchema>) {
  const session = await requireSession();
  const data = updateSchema.parse(input);
  const eng = await loadEngagementTenant(data.engagementId);

  await requirePermission(ACTIONS.certificationGenerate, {
    userId: session.user.id,
    tenantId: eng.tenantId,
    engagementId: data.engagementId,
  });

  const [existing] = await db
    .select()
    .from(residualRisks)
    .where(
      and(
        eq(residualRisks.id, data.riskId),
        eq(residualRisks.tenantId, eng.tenantId),
        eq(residualRisks.engagementId, data.engagementId),
      ),
    )
    .limit(1);
  if (!existing) throw new Error('Residual risk not found');

  const patch: {
    title?: string;
    description?: string;
    mitigation?: string | null;
    likelihood?: string | null;
    impact?: string | null;
  } = {};
  if (data.title !== undefined) patch.title = data.title;
  if (data.description !== undefined) patch.description = data.description;
  if (data.mitigation !== undefined) patch.mitigation = present(data.mitigation);
  if (data.likelihood !== undefined) patch.likelihood = present(data.likelihood);
  if (data.impact !== undefined) patch.impact = present(data.impact);

  await db.transaction(async (tx) => {
    await tx
      .update(residualRisks)
      .set(patch)
      .where(
        and(
          eq(residualRisks.id, data.riskId),
          eq(residualRisks.tenantId, eng.tenantId),
          eq(residualRisks.engagementId, data.engagementId),
        ),
      );
    await tx.insert(auditLog).values({
      tenantId: eng.tenantId,
      engagementId: data.engagementId,
      actorUserId: session.user.id,
      action: 'residual_risk.update',
      resourceType: 'residual_risk',
      resourceId: data.riskId,
      afterJson: patch as never,
    });
  });
  revalidatePath(`/engagements/${data.engagementId}/certification`);
  return { ok: true };
}

export async function acceptResidualRisk(input: z.infer<typeof acceptSchema>) {
  const session = await requireSession();
  const data = acceptSchema.parse(input);
  const eng = await loadEngagementTenant(data.engagementId);

  await requirePermission(ACTIONS.certificationGenerate, {
    userId: session.user.id,
    tenantId: eng.tenantId,
    engagementId: data.engagementId,
  });

  const [existing] = await db
    .select()
    .from(residualRisks)
    .where(
      and(
        eq(residualRisks.id, data.riskId),
        eq(residualRisks.tenantId, eng.tenantId),
        eq(residualRisks.engagementId, data.engagementId),
      ),
    )
    .limit(1);
  if (!existing) throw new Error('Residual risk not found');

  const likelihood = present(data.likelihood) ?? present(existing.likelihood);
  const impact = present(data.impact) ?? present(existing.impact);
  const mitigation = present(data.mitigation) ?? present(existing.mitigation);
  if (!likelihood || !impact || !mitigation) {
    throw new Error('Acceptance requires likelihood, impact, and treatment.');
  }

  const acceptedAt = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(residualRisks)
      .set({
        likelihood,
        impact,
        mitigation,
        acceptedBy: session.user.id,
        acceptedAt,
      })
      .where(
        and(
          eq(residualRisks.id, data.riskId),
          eq(residualRisks.tenantId, eng.tenantId),
          eq(residualRisks.engagementId, data.engagementId),
        ),
      );
    await tx.insert(auditLog).values({
      tenantId: eng.tenantId,
      engagementId: data.engagementId,
      actorUserId: session.user.id,
      action: 'residual_risk.accept',
      resourceType: 'residual_risk',
      resourceId: data.riskId,
      afterJson: { acceptedBy: session.user.id, acceptedAt: acceptedAt.toISOString() } as never,
    });
  });
  revalidatePath(`/engagements/${data.engagementId}/certification`);
  return { ok: true };
}
