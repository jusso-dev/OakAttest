'use server';

import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db/client';
import {
  essentialEightAssessments,
  essentialEightHistory,
} from '@/db/schema/essential-eight';
import { engagements } from '@/db/schema/engagements';
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

const strategySchema = z.enum([
  'application_control',
  'patch_applications',
  'configure_macro_settings',
  'user_application_hardening',
  'restrict_admin_privileges',
  'patch_operating_systems',
  'multi_factor_authentication',
  'regular_backups',
]);

const maturitySchema = z.enum(['ml0', 'ml1', 'ml2', 'ml3']);

const upsertSchema = z.object({
  engagementId: z.string().uuid(),
  strategy: strategySchema,
  currentMaturity: maturitySchema,
  targetMaturity: maturitySchema,
  remediationPlan: z.string().max(8000).optional(),
  evidenceRefs: z.array(z.string().uuid()).optional(),
});

export async function upsertEssentialEight(input: z.infer<typeof upsertSchema>) {
  const session = await requireSession();
  const data = upsertSchema.parse(input);
  const tenantId = await tenantForEngagement(data.engagementId);

  // Both assessor and client may contribute here; the client owns the
  // remediation plan, the assessor confirms current maturity.
  await requirePermission(ACTIONS.applicabilityDecide, {
    userId: session.user.id,
    tenantId,
    engagementId: data.engagementId,
  }).catch(async () => {
    // Fall back to remediation_guidance write for client roles.
    await requirePermission(ACTIONS.remediationGuidanceWrite, {
      userId: session.user.id,
      tenantId,
      engagementId: data.engagementId,
    });
  });

  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(essentialEightAssessments)
      .where(
        and(
          eq(essentialEightAssessments.engagementId, data.engagementId),
          eq(essentialEightAssessments.strategy, data.strategy),
        ),
      )
      .limit(1);

    if (existing) {
      await tx
        .update(essentialEightAssessments)
        .set({
          currentMaturity: data.currentMaturity,
          targetMaturity: data.targetMaturity,
          remediationPlan: data.remediationPlan ?? existing.remediationPlan,
          evidenceRefs: (data.evidenceRefs ?? existing.evidenceRefs) as never,
          assessedBy: session.user.id,
          updatedAt: new Date(),
        })
        .where(eq(essentialEightAssessments.id, existing.id));
    } else {
      await tx.insert(essentialEightAssessments).values({
        engagementId: data.engagementId,
        tenantId,
        strategy: data.strategy,
        currentMaturity: data.currentMaturity,
        targetMaturity: data.targetMaturity,
        remediationPlan: data.remediationPlan ?? null,
        evidenceRefs: (data.evidenceRefs ?? null) as never,
        assessedBy: session.user.id,
      });
    }

    if (!existing || existing.currentMaturity !== data.currentMaturity) {
      await tx.insert(essentialEightHistory).values({
        engagementId: data.engagementId,
        tenantId,
        strategy: data.strategy,
        maturity: data.currentMaturity,
        recordedBy: session.user.id,
      });
    }

    await tx.insert(auditLog).values({
      tenantId,
      engagementId: data.engagementId,
      actorUserId: session.user.id,
      action: 'essential_eight.upsert',
      resourceType: 'essential_eight_assessment',
      afterJson: {
        strategy: data.strategy,
        currentMaturity: data.currentMaturity,
        targetMaturity: data.targetMaturity,
      } as never,
    });
  });

  revalidatePath(`/engagements/${data.engagementId}/essential-eight`);
  return { ok: true };
}
