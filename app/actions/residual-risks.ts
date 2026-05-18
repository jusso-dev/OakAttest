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

export async function addResidualRisk(input: z.infer<typeof schema>) {
  const session = await requireSession();
  const data = schema.parse(input);
  const [eng] = await db
    .select({ tenantId: engagements.tenantId })
    .from(engagements)
    .where(and(eq(engagements.id, data.engagementId), isNull(engagements.deletedAt)))
    .limit(1);
  if (!eng) throw new Error('Engagement not found');

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
