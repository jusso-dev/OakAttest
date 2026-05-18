'use server';

import { z } from 'zod';
import { and, eq, inArray } from 'drizzle-orm';
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
        eq(engagementControls.tenantId, tenantId),
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
      .where(
        and(
          eq(engagementControls.id, data.engagementControlId),
          eq(engagementControls.tenantId, tenantId),
          eq(engagementControls.engagementId, data.engagementId),
        ),
      );
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

const assessmentRecordSchema = z.object({
  engagementId: z.string().uuid(),
  engagementControlId: z.string().uuid(),
  assessmentMethods: z.string().max(1000).optional(),
  assessmentObjects: z.string().max(2000).optional(),
  evidenceQuality: z.enum(['excellent', 'good', 'fair', 'poor', 'insufficient']).optional(),
  evidenceLimitations: z.string().max(4000).optional(),
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
      .where(
        and(
          eq(engagementControls.id, data.engagementControlId),
          eq(engagementControls.tenantId, tenantId),
          eq(engagementControls.engagementId, data.engagementId),
        ),
      );
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

export async function updateControlAssessmentRecord(
  input: z.infer<typeof assessmentRecordSchema>,
) {
  const session = await requireSession();
  const data = assessmentRecordSchema.parse(input);
  const tenantId = await tenantForEngagement(data.engagementId);

  await requirePermission(ACTIONS.applicabilityDecide, {
    userId: session.user.id,
    tenantId,
    engagementId: data.engagementId,
  });

  await db.transaction(async (tx) => {
    await tx
      .update(engagementControls)
      .set({
        assessmentMethods: data.assessmentMethods ?? null,
        assessmentObjects: data.assessmentObjects ?? null,
        evidenceQuality: data.evidenceQuality ?? null,
        evidenceLimitations: data.evidenceLimitations ?? null,
        lastReviewedAt: new Date(),
        lastReviewedBy: session.user.id,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(engagementControls.id, data.engagementControlId),
          eq(engagementControls.tenantId, tenantId),
          eq(engagementControls.engagementId, data.engagementId),
        ),
      );
    await tx.insert(auditLog).values({
      tenantId,
      engagementId: data.engagementId,
      actorUserId: session.user.id,
      action: 'control_assessment_record.update',
      resourceType: 'engagement_control',
      resourceId: data.engagementControlId,
      afterJson: {
        assessmentMethods: data.assessmentMethods ?? null,
        assessmentObjectsLength: data.assessmentObjects?.length ?? 0,
        evidenceQuality: data.evidenceQuality ?? null,
        evidenceLimitationsLength: data.evidenceLimitations?.length ?? 0,
      } as never,
    });
  });

  revalidatePath(`/engagements/${data.engagementId}/scope`);
  return { ok: true };
}

const bulkRemoveSchema = z.object({
  engagementId: z.string().uuid(),
  engagementControlIds: z.array(z.string().uuid()).min(1).max(500),
});

const bulkDecideSchema = z.object({
  engagementId: z.string().uuid(),
  engagementControlIds: z.array(z.string().uuid()).min(1).max(500),
  applicable: z.enum(['applicable', 'not_applicable', 'compensating']),
  justification: z.string().min(10).max(4000),
});

export async function bulkDecideApplicabilityControls(
  input: z.infer<typeof bulkDecideSchema>,
) {
  const session = await requireSession();
  const data = bulkDecideSchema.parse(input);
  const tenantId = await tenantForEngagement(data.engagementId);

  await requirePermission(ACTIONS.applicabilityDecide, {
    userId: session.user.id,
    tenantId,
    engagementId: data.engagementId,
  });

  const before = await db
    .select({
      id: engagementControls.id,
      controlId: engagementControls.controlId,
      applicable: engagementControls.applicable,
      justification: engagementControls.applicabilityJustification,
      status: engagementControls.status,
    })
    .from(engagementControls)
    .where(
      and(
        eq(engagementControls.engagementId, data.engagementId),
        eq(engagementControls.tenantId, tenantId),
        inArray(engagementControls.id, data.engagementControlIds),
      ),
    );

  if (before.length === 0) throw new Error('No matching controls found');

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
      .where(
        and(
          eq(engagementControls.engagementId, data.engagementId),
          eq(engagementControls.tenantId, tenantId),
          inArray(engagementControls.id, before.map((row) => row.id)),
        ),
      );
    await tx.insert(auditLog).values({
      tenantId,
      engagementId: data.engagementId,
      actorUserId: session.user.id,
      action: 'applicability.bulk_decide',
      resourceType: 'engagement_control',
      beforeJson: {
        controls: before.map((row) => ({
          id: row.id,
          controlId: row.controlId,
          applicable: row.applicable,
          justification: row.justification,
          status: row.status,
        })),
      } as never,
      afterJson: {
        count: before.length,
        applicable: data.applicable,
        justification: data.justification,
      } as never,
    });
  });

  revalidatePath(`/engagements/${data.engagementId}/scope`);
  return { ok: true, updated: before.length };
}

export async function bulkRemoveApplicabilityControls(
  input: z.infer<typeof bulkRemoveSchema>,
) {
  const session = await requireSession();
  const data = bulkRemoveSchema.parse(input);
  const tenantId = await tenantForEngagement(data.engagementId);

  await requirePermission(ACTIONS.applicabilityDecide, {
    userId: session.user.id,
    tenantId,
    engagementId: data.engagementId,
  });

  const before = await db
    .select({
      id: engagementControls.id,
      controlId: engagementControls.controlId,
      applicable: engagementControls.applicable,
      status: engagementControls.status,
    })
    .from(engagementControls)
    .where(
      and(
        eq(engagementControls.engagementId, data.engagementId),
        eq(engagementControls.tenantId, tenantId),
        inArray(engagementControls.id, data.engagementControlIds),
      ),
    );

  if (before.length === 0) throw new Error('No matching controls found');

  await db.transaction(async (tx) => {
    await tx
      .delete(engagementControls)
      .where(
        and(
          eq(engagementControls.engagementId, data.engagementId),
          eq(engagementControls.tenantId, tenantId),
          inArray(engagementControls.id, before.map((row) => row.id)),
        ),
      );
    await tx.insert(auditLog).values({
      tenantId,
      engagementId: data.engagementId,
      actorUserId: session.user.id,
      action: 'applicability.bulk_remove',
      resourceType: 'engagement_control',
      afterJson: {
        count: before.length,
        controls: before.map((row) => ({
          id: row.id,
          controlId: row.controlId,
          applicable: row.applicable,
          status: row.status,
        })),
      } as never,
    });
  });

  revalidatePath(`/engagements/${data.engagementId}/scope`);
  return { ok: true, removed: before.length };
}
