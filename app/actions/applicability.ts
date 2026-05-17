'use server';

import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db/client';
import { engagementControls } from '@/db/schema/ism';
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

const decideSchema = z.object({
  engagementId: z.string().uuid(),
  engagementControlId: z.string().uuid(),
  applicable: z.enum(['applicable', 'not_applicable', 'compensating']),
  justification: z.string().min(10).max(4000),
});

// Assessor decides whether a control is in scope. A justification is
// mandatory per §9.4 ("The assessor confirms with a justification field").
export async function decideApplicability(input: z.infer<typeof decideSchema>) {
  const session = await requireSession();
  const data = decideSchema.parse(input);
  const tenantId = await tenantForEngagement(data.engagementId);

  await requirePermission(ACTIONS.applicabilityDecide, {
    userId: session.user.id,
    tenantId,
    engagementId: data.engagementId,
  });

  const [before] = await db
    .select()
    .from(engagementControls)
    .where(
      and(
        eq(engagementControls.id, data.engagementControlId),
        eq(engagementControls.engagementId, data.engagementId),
      ),
    )
    .limit(1);
  if (!before) throw new Error('Control not found');

  await db.transaction(async (tx) => {
    await tx
      .update(engagementControls)
      .set({
        applicable: data.applicable,
        applicabilityJustification: data.justification,
        status: data.applicable === 'not_applicable' ? 'not_applicable' : 'in_progress',
        lastReviewedAt: new Date(),
        lastReviewedBy: session.user.id,
        updatedAt: new Date(),
      })
      .where(eq(engagementControls.id, data.engagementControlId));
    await tx.insert(auditLog).values({
      tenantId,
      engagementId: data.engagementId,
      actorUserId: session.user.id,
      action: 'applicability.decide',
      resourceType: 'engagement_control',
      resourceId: data.engagementControlId,
      beforeJson: {
        applicable: before.applicable,
        justification: before.applicabilityJustification,
      } as never,
      afterJson: { applicable: data.applicable, justification: data.justification } as never,
    });
  });

  revalidatePath(`/engagements/${data.engagementId}/scope`);
  return { ok: true };
}

const statementSchema = z.object({
  engagementId: z.string().uuid(),
  engagementControlId: z.string().uuid(),
  statement: z.string().max(8000),
});

// Client writes the implementation statement that lands in the SSP. Pure
// client-side action; assessors cannot author these (§15 independence).
export async function writeImplementationStatement(input: z.infer<typeof statementSchema>) {
  const session = await requireSession();
  const data = statementSchema.parse(input);
  const tenantId = await tenantForEngagement(data.engagementId);

  await requirePermission(ACTIONS.implementationStatementWrite, {
    userId: session.user.id,
    tenantId,
    engagementId: data.engagementId,
  });

  await db.transaction(async (tx) => {
    await tx
      .update(engagementControls)
      .set({
        implementationStatement: data.statement,
        status: data.statement.trim() ? 'evidence_pending' : 'in_progress',
        updatedAt: new Date(),
      })
      .where(eq(engagementControls.id, data.engagementControlId));
    await tx.insert(auditLog).values({
      tenantId,
      engagementId: data.engagementId,
      actorUserId: session.user.id,
      action: 'implementation_statement.write',
      resourceType: 'engagement_control',
      resourceId: data.engagementControlId,
      afterJson: { length: data.statement.length } as never,
    });
  });

  revalidatePath(`/engagements/${data.engagementId}/scope`);
  return { ok: true };
}
