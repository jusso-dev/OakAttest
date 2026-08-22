'use server';

import crypto from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { auditLog } from '@/db/schema/audit';
import { commonControlMappings, evidenceReuseLinks } from '@/db/schema/assurance-connectors';
import { clientOrganisations, engagements } from '@/db/schema/engagements';
import { evidenceItemControls, evidenceItems } from '@/db/schema/evidence';
import { engagementControls, frameworkControls } from '@/db/schema/frameworks';
import { requireSession } from '@/lib/auth/session';
import { userTimeZone } from '@/lib/auth/user-timezone';
import { requireFeature } from '@/lib/licensing';
import { requirePermission } from '@/lib/rbac/require';
import { ACTIONS } from '@/lib/rbac/matrix';
import { assertEvidenceReusable } from '@/lib/evidence/reuse';
import { zonedDateEndToUtc } from '@/lib/timezone';
import { presignDownload } from '@/lib/storage/s3';

async function engagementContext(engagementId: string) {
  const [row] = await db
    .select({
      tenantId: engagements.tenantId,
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
    .where(eq(engagements.id, engagementId))
    .limit(1);
  if (!row) throw new Error('Engagement not found.');
  return row;
}

const mappingSchema = z.object({
  engagementId: z.string().uuid(),
  sourceFrameworkControlId: z.string().uuid(),
  targetFrameworkControlId: z.string().uuid(),
  relation: z.enum(['equivalent', 'supporting', 'partial']),
  rationale: z.string().min(10).max(2000),
});

export async function createCommonControlMapping(input: z.infer<typeof mappingSchema>) {
  const session = await requireSession();
  const data = mappingSchema.parse(input);
  const context = await engagementContext(data.engagementId);
  await requirePermission(ACTIONS.commonControlManage, {
    userId: session.user.id,
    tenantId: context.tenantId,
    engagementId: data.engagementId,
  });
  await requireFeature(context.tenantId, 'EVIDENCE_REUSE');
  if (data.sourceFrameworkControlId === data.targetFrameworkControlId) {
    throw new Error('A common-control mapping must relate two different controls.');
  }
  const controls = await db
    .select({ id: frameworkControls.id })
    .from(frameworkControls)
    .where(
      and(
        inArray(frameworkControls.id, [data.sourceFrameworkControlId, data.targetFrameworkControlId]),
        or(isNull(frameworkControls.tenantId), eq(frameworkControls.tenantId, context.tenantId)),
      ),
    );
  if (new Set(controls.map((control) => control.id)).size !== 2) {
    throw new Error('Both mapped controls must be available to this tenant.');
  }
  const id = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(commonControlMappings).values({
      id,
      tenantId: context.tenantId,
      sourceFrameworkControlId: data.sourceFrameworkControlId,
      targetFrameworkControlId: data.targetFrameworkControlId,
      relation: data.relation,
      rationale: data.rationale,
      createdBy: session.user.id,
    });
    await tx.insert(auditLog).values({
      tenantId: context.tenantId,
      engagementId: data.engagementId,
      actorUserId: session.user.id,
      action: 'common_control_mapping.create',
      resourceType: 'common_control_mapping',
      resourceId: id,
      afterJson: {
        sourceFrameworkControlId: data.sourceFrameworkControlId,
        targetFrameworkControlId: data.targetFrameworkControlId,
        relation: data.relation,
        rationale: data.rationale,
      } as never,
    });
  });
  revalidate(data.engagementId);
  return { id };
}

const proposeSchema = z.object({
  targetEngagementId: z.string().uuid(),
  sourceEvidenceItemId: z.string().uuid(),
  targetFrameworkControlId: z.string().uuid(),
  commonControlMappingId: z.string().uuid().optional(),
  rationale: z.string().min(20).max(2000),
  validUntil: z.string().date(),
});

export async function proposeEvidenceReuse(input: z.infer<typeof proposeSchema>) {
  const session = await requireSession();
  const data = proposeSchema.parse(input);
  const target = await engagementContext(data.targetEngagementId);
  await requirePermission(ACTIONS.evidenceReusePropose, {
    userId: session.user.id,
    tenantId: target.tenantId,
    engagementId: data.targetEngagementId,
  });
  await requireFeature(target.tenantId, 'EVIDENCE_REUSE');
  const timeZone = await userTimeZone(session.user.id);
  const validUntil = zonedDateEndToUtc(data.validUntil, timeZone);
  const source = await loadSourceEvidence(data.sourceEvidenceItemId);
  await requirePermission(ACTIONS.evidenceView, {
    userId: session.user.id,
    tenantId: source.tenantId,
    engagementId: source.engagementId,
  });
  await assertTargetControl(data.targetEngagementId, target.tenantId, data.targetFrameworkControlId);
  await validateCommonMapping({
    mappingId: data.commonControlMappingId,
    tenantId: target.tenantId,
    sourceEvidenceItemId: source.id,
    targetFrameworkControlId: data.targetFrameworkControlId,
  });
  assertEvidenceReusable({
    sourceTenantId: source.tenantId,
    targetTenantId: target.tenantId,
    sourceClientId: source.clientId,
    targetClientId: target.clientId,
    sourceEngagementId: source.engagementId,
    targetEngagementId: data.targetEngagementId,
    evidenceClassification: source.dataClassification,
    targetClassification: target.classification,
    reviewStatus: source.reviewStatus,
    storageVerifiedAt: source.storageVerifiedAt,
    quarantinedAt: source.quarantinedAt,
    sha256: source.sha256,
    validUntil,
  });

  const id = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(evidenceReuseLinks).values({
      id,
      tenantId: target.tenantId,
      sourceEngagementId: source.engagementId,
      targetEngagementId: data.targetEngagementId,
      sourceEvidenceItemId: source.id,
      targetFrameworkControlId: data.targetFrameworkControlId,
      commonControlMappingId: data.commonControlMappingId ?? null,
      rationale: data.rationale,
      validUntil,
      proposedBy: session.user.id,
    });
    await tx.insert(auditLog).values({
      tenantId: target.tenantId,
      engagementId: data.targetEngagementId,
      actorUserId: session.user.id,
      action: 'evidence_reuse.propose',
      resourceType: 'evidence_reuse_link',
      resourceId: id,
      afterJson: {
        sourceEngagementId: source.engagementId,
        sourceEvidenceItemId: source.id,
        targetFrameworkControlId: data.targetFrameworkControlId,
        validUntil: validUntil.toISOString(),
      } as never,
    });
  });
  revalidate(data.targetEngagementId);
  return { id };
}

const decideSchema = z.object({
  targetEngagementId: z.string().uuid(),
  reuseLinkId: z.string().uuid(),
  status: z.enum(['approved', 'rejected']),
  decisionNotes: z.string().max(2000).optional(),
});

export async function reviewEvidenceReuse(input: z.infer<typeof decideSchema>) {
  const session = await requireSession();
  const data = decideSchema.parse(input);
  const target = await engagementContext(data.targetEngagementId);
  await requirePermission(ACTIONS.evidenceReuseReview, {
    userId: session.user.id,
    tenantId: target.tenantId,
    engagementId: data.targetEngagementId,
  });
  await requireFeature(target.tenantId, 'EVIDENCE_REUSE');
  const [link] = await db
    .select()
    .from(evidenceReuseLinks)
    .where(
      and(
        eq(evidenceReuseLinks.id, data.reuseLinkId),
        eq(evidenceReuseLinks.tenantId, target.tenantId),
        eq(evidenceReuseLinks.targetEngagementId, data.targetEngagementId),
      ),
    )
    .limit(1);
  if (!link) throw new Error('Evidence reuse proposal not found.');
  if (link.status !== 'proposed') throw new Error('Evidence reuse proposal has already been decided.');
  if (data.status === 'approved') {
    const source = await assertLinkStillReusable(link, target);
    await requirePermission(ACTIONS.evidenceView, {
      userId: session.user.id,
      tenantId: source.tenantId,
      engagementId: source.engagementId,
    });
  }
  const [decided] = await db.transaction(async (tx) => {
    const rows = await tx
      .update(evidenceReuseLinks)
      .set({
        status: data.status,
        decisionNotes: data.decisionNotes || null,
        decidedBy: session.user.id,
        decidedAt: new Date(),
      })
      .where(and(eq(evidenceReuseLinks.id, link.id), eq(evidenceReuseLinks.status, 'proposed')))
      .returning({ id: evidenceReuseLinks.id });
    if (!rows[0]) throw new Error('Evidence reuse proposal has already been decided.');
    await tx.insert(auditLog).values({
      tenantId: target.tenantId,
      engagementId: data.targetEngagementId,
      actorUserId: session.user.id,
      action: `evidence_reuse.${data.status}`,
      resourceType: 'evidence_reuse_link',
      resourceId: link.id,
    });
    return rows;
  });
  revalidate(data.targetEngagementId);
  return { id: decided.id };
}

const revokeSchema = z.object({
  targetEngagementId: z.string().uuid(),
  reuseLinkId: z.string().uuid(),
});

export async function revokeEvidenceReuse(input: z.infer<typeof revokeSchema>) {
  const session = await requireSession();
  const data = revokeSchema.parse(input);
  const target = await engagementContext(data.targetEngagementId);
  await requirePermission(ACTIONS.evidenceReuseReview, {
    userId: session.user.id,
    tenantId: target.tenantId,
    engagementId: data.targetEngagementId,
  });
  const now = new Date();
  const [revoked] = await db
    .update(evidenceReuseLinks)
    .set({ status: 'revoked', revokedAt: now, revokedBy: session.user.id })
    .where(
      and(
        eq(evidenceReuseLinks.id, data.reuseLinkId),
        eq(evidenceReuseLinks.tenantId, target.tenantId),
        eq(evidenceReuseLinks.targetEngagementId, data.targetEngagementId),
        eq(evidenceReuseLinks.status, 'approved'),
      ),
    )
    .returning({ id: evidenceReuseLinks.id });
  if (!revoked) throw new Error('Approved evidence reuse link not found.');
  await db.insert(auditLog).values({
    tenantId: target.tenantId,
    engagementId: data.targetEngagementId,
    actorUserId: session.user.id,
    action: 'evidence_reuse.revoked',
    resourceType: 'evidence_reuse_link',
    resourceId: revoked.id,
  });
  revalidate(data.targetEngagementId);
  return { ok: true };
}

export async function getReusedEvidenceDownloadUrl(input: {
  targetEngagementId: string;
  reuseLinkId: string;
}): Promise<{ url: string }> {
  const session = await requireSession();
  const data = revokeSchema.parse(input);
  const target = await engagementContext(data.targetEngagementId);
  await requirePermission(ACTIONS.evidenceReuseView, {
    userId: session.user.id,
    tenantId: target.tenantId,
    engagementId: data.targetEngagementId,
  });
  const [link] = await db
    .select()
    .from(evidenceReuseLinks)
    .where(
      and(
        eq(evidenceReuseLinks.id, data.reuseLinkId),
        eq(evidenceReuseLinks.tenantId, target.tenantId),
        eq(evidenceReuseLinks.targetEngagementId, data.targetEngagementId),
        eq(evidenceReuseLinks.status, 'approved'),
      ),
    )
    .limit(1);
  if (!link || link.revokedAt) throw new Error('Reusable evidence is not available.');
  const source = await assertLinkStillReusable(link, target);
  await db.insert(auditLog).values({
    tenantId: target.tenantId,
    engagementId: data.targetEngagementId,
    actorUserId: session.user.id,
    action: 'evidence_reuse.download',
    resourceType: 'evidence_reuse_link',
    resourceId: link.id,
    afterJson: { sourceEvidenceItemId: source.id, sourceEngagementId: source.engagementId } as never,
  });
  return { url: await presignDownload({ key: source.storageKey, expiresIn: 300 }) };
}

async function loadSourceEvidence(evidenceItemId: string) {
  const [source] = await db
    .select({
      id: evidenceItems.id,
      tenantId: evidenceItems.tenantId,
      engagementId: evidenceItems.engagementId,
      filename: evidenceItems.filename,
      storageKey: evidenceItems.storageKey,
      sha256: evidenceItems.sha256,
      dataClassification: evidenceItems.dataClassification,
      reviewStatus: evidenceItems.reviewStatus,
      storageVerifiedAt: evidenceItems.storageVerifiedAt,
      quarantinedAt: evidenceItems.quarantinedAt,
      clientId: clientOrganisations.clientId,
    })
    .from(evidenceItems)
    .innerJoin(engagements, eq(engagements.id, evidenceItems.engagementId))
    .leftJoin(
      clientOrganisations,
      and(
        eq(clientOrganisations.engagementId, evidenceItems.engagementId),
        eq(clientOrganisations.tenantId, evidenceItems.tenantId),
      ),
    )
    .where(eq(evidenceItems.id, evidenceItemId))
    .limit(1);
  if (!source) throw new Error('Source evidence not found.');
  return source;
}

async function assertTargetControl(engagementId: string, tenantId: string, frameworkControlId: string) {
  const [control] = await db
    .select({ id: engagementControls.id })
    .from(engagementControls)
    .where(
      and(
        eq(engagementControls.engagementId, engagementId),
        eq(engagementControls.tenantId, tenantId),
        eq(engagementControls.frameworkControlId, frameworkControlId),
      ),
    )
    .limit(1);
  if (!control) throw new Error('Target control does not belong to this assessment.');
}

async function validateCommonMapping(input: {
  mappingId?: string;
  tenantId: string;
  sourceEvidenceItemId: string;
  targetFrameworkControlId: string;
}) {
  if (!input.mappingId) return;
  const [mapping] = await db
    .select()
    .from(commonControlMappings)
    .where(and(eq(commonControlMappings.id, input.mappingId), eq(commonControlMappings.tenantId, input.tenantId)))
    .limit(1);
  if (!mapping || mapping.targetFrameworkControlId !== input.targetFrameworkControlId) {
    throw new Error('Common-control mapping does not match the target control.');
  }
  const [sourceControl] = await db
    .select({ id: evidenceItemControls.frameworkControlId })
    .from(evidenceItemControls)
    .where(
      and(
        eq(evidenceItemControls.evidenceItemId, input.sourceEvidenceItemId),
        eq(evidenceItemControls.frameworkControlId, mapping.sourceFrameworkControlId),
      ),
    )
    .limit(1);
  if (!sourceControl) throw new Error('Source evidence is not linked to the mapped source control.');
}

async function assertLinkStillReusable(
  link: typeof evidenceReuseLinks.$inferSelect,
  target: Awaited<ReturnType<typeof engagementContext>>,
) {
  const source = await loadSourceEvidence(link.sourceEvidenceItemId);
  assertEvidenceReusable({
    sourceTenantId: source.tenantId,
    targetTenantId: target.tenantId,
    sourceClientId: source.clientId,
    targetClientId: target.clientId,
    sourceEngagementId: source.engagementId,
    targetEngagementId: link.targetEngagementId,
    evidenceClassification: source.dataClassification,
    targetClassification: target.classification,
    reviewStatus: source.reviewStatus,
    storageVerifiedAt: source.storageVerifiedAt,
    quarantinedAt: source.quarantinedAt,
    sha256: source.sha256,
    validUntil: link.validUntil,
  });
  return source;
}

function revalidate(engagementId: string) {
  revalidatePath(`/engagements/${engagementId}/connectors`);
  revalidatePath(`/engagements/${engagementId}/evidence`);
}
