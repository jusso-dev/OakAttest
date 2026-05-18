'use server';

import { z } from 'zod';
import { eq, and, max } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import crypto from 'node:crypto';
import { db } from '@/lib/db/client';
import {
  essentialEightAssessments,
  essentialEightHistory,
  essentialEightProfiles,
  essentialEightReports,
} from '@/db/schema/essential-eight';
import { engagements } from '@/db/schema/engagements';
import { auditLog } from '@/db/schema/audit';
import { requireSession } from '@/lib/auth/session';
import { requirePermission } from '@/lib/rbac/require';
import { ACTIONS } from '@/lib/rbac/matrix';
import {
  STORAGE_BUCKET,
  buildEssentialEightReportKey,
  presignDownload,
  putBuffer,
} from '@/lib/storage/s3';
import { calculateEssentialEightOverall } from '@/lib/essential-eight';

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
  assessmentMethods: z.string().max(2000).optional(),
  assessmentObjects: z.string().max(2000).optional(),
  sampleSize: z.string().max(500).optional(),
  evidenceQuality: z.enum(['excellent', 'good', 'fair', 'poor', 'insufficient']).optional(),
  evidenceLimitations: z.string().max(4000).optional(),
  assessorConclusion: z.string().max(8000).optional(),
});

const profileSchema = z.object({
  engagementId: z.string().uuid(),
  targetMaturity: maturitySchema,
  scope: z.string().max(8000).optional(),
  approach: z.string().max(8000).optional(),
  limitations: z.string().max(8000).optional(),
});

export async function upsertEssentialEightProfile(input: z.infer<typeof profileSchema>) {
  const session = await requireSession();
  const data = profileSchema.parse(input);
  const tenantId = await tenantForEngagement(data.engagementId);

  await requirePermission(ACTIONS.applicabilityDecide, {
    userId: session.user.id,
    tenantId,
    engagementId: data.engagementId,
  });

  const [existing] = await db
    .select({ id: essentialEightProfiles.id })
    .from(essentialEightProfiles)
    .where(eq(essentialEightProfiles.engagementId, data.engagementId))
    .limit(1);

  await db.transaction(async (tx) => {
    if (existing) {
      await tx
        .update(essentialEightProfiles)
        .set({
          targetMaturity: data.targetMaturity,
          scope: data.scope ?? null,
          approach: data.approach ?? null,
          limitations: data.limitations ?? null,
          updatedBy: session.user.id,
          updatedAt: new Date(),
        })
        .where(eq(essentialEightProfiles.id, existing.id));
    } else {
      await tx.insert(essentialEightProfiles).values({
        engagementId: data.engagementId,
        tenantId,
        targetMaturity: data.targetMaturity,
        scope: data.scope ?? null,
        approach: data.approach ?? null,
        limitations: data.limitations ?? null,
        updatedBy: session.user.id,
      });
    }
    await tx.insert(auditLog).values({
      tenantId,
      engagementId: data.engagementId,
      actorUserId: session.user.id,
      action: 'essential_eight.profile.upsert',
      resourceType: 'essential_eight_profile',
      afterJson: { targetMaturity: data.targetMaturity } as never,
    });
  });

  revalidatePath(`/engagements/${data.engagementId}/essential-eight`);
  return { ok: true };
}

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
          assessmentMethods: data.assessmentMethods ?? existing.assessmentMethods,
          assessmentObjects: data.assessmentObjects ?? existing.assessmentObjects,
          sampleSize: data.sampleSize ?? existing.sampleSize,
          evidenceQuality: data.evidenceQuality ?? existing.evidenceQuality,
          evidenceLimitations: data.evidenceLimitations ?? existing.evidenceLimitations,
          assessorConclusion: data.assessorConclusion ?? existing.assessorConclusion,
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
        assessmentMethods: data.assessmentMethods ?? null,
        assessmentObjects: data.assessmentObjects ?? null,
        sampleSize: data.sampleSize ?? null,
        evidenceQuality: data.evidenceQuality ?? null,
        evidenceLimitations: data.evidenceLimitations ?? null,
        assessorConclusion: data.assessorConclusion ?? null,
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

export async function generateEssentialEightReport(input: { engagementId: string }) {
  const session = await requireSession();
  const data = z.object({ engagementId: z.string().uuid() }).parse(input);
  const tenantId = await tenantForEngagement(data.engagementId);
  await requirePermission(ACTIONS.certificationGenerate, {
    userId: session.user.id,
    tenantId,
    engagementId: data.engagementId,
  }).catch(async () => {
    await requirePermission(ACTIONS.applicabilityDecide, {
      userId: session.user.id,
      tenantId,
      engagementId: data.engagementId,
    });
  });

  const [profile] = await db
    .select()
    .from(essentialEightProfiles)
    .where(eq(essentialEightProfiles.engagementId, data.engagementId))
    .limit(1);
  const rows = await db
    .select()
    .from(essentialEightAssessments)
    .where(eq(essentialEightAssessments.engagementId, data.engagementId));
  const targetMaturity = profile?.targetMaturity ?? 'ml1';
  const overall = calculateEssentialEightOverall(rows, targetMaturity);
  const [{ maxV }] = await db
    .select({ maxV: max(essentialEightReports.version) })
    .from(essentialEightReports)
    .where(eq(essentialEightReports.engagementId, data.engagementId));
  const version = (maxV ?? 0) + 1;
  const snapshot = {
    generatedAt: new Date().toISOString(),
    targetMaturity,
    overall,
    profile,
    strategies: rows,
  };
  const body = Buffer.from(JSON.stringify(snapshot, null, 2));
  const sha256 = crypto.createHash('sha256').update(body).digest('hex');
  const key = buildEssentialEightReportKey({ tenantId, engagementId: data.engagementId, version });
  await putBuffer({ key, body, contentType: 'application/json' });
  const id = crypto.randomUUID();

  await db.transaction(async (tx) => {
    await tx.insert(essentialEightReports).values({
      id,
      engagementId: data.engagementId,
      tenantId,
      version,
      snapshot: snapshot as never,
      storageKey: key,
      storageBucket: STORAGE_BUCKET,
      sha256,
      generatedBy: session.user.id,
    });
    await tx.insert(auditLog).values({
      tenantId,
      engagementId: data.engagementId,
      actorUserId: session.user.id,
      action: 'essential_eight.report.generate',
      resourceType: 'essential_eight_report',
      resourceId: id,
      afterJson: { version, sha256, achieved: overall.achieved } as never,
    });
  });

  revalidatePath(`/engagements/${data.engagementId}/essential-eight`);
  return { id, version };
}

export async function getEssentialEightReportDownloadUrl(input: {
  engagementId: string;
  reportId: string;
}) {
  const session = await requireSession();
  const data = z.object({ engagementId: z.string().uuid(), reportId: z.string().uuid() }).parse(input);
  const [report] = await db
    .select()
    .from(essentialEightReports)
    .where(and(eq(essentialEightReports.id, data.reportId), eq(essentialEightReports.engagementId, data.engagementId)))
    .limit(1);
  if (!report) throw new Error('Essential Eight report not found');
  await requirePermission(ACTIONS.engagementView, {
    userId: session.user.id,
    tenantId: report.tenantId,
    engagementId: data.engagementId,
  });
  await db.insert(auditLog).values({
    tenantId: report.tenantId,
    engagementId: data.engagementId,
    actorUserId: session.user.id,
    action: 'essential_eight.report.download',
    resourceType: 'essential_eight_report',
    resourceId: data.reportId,
  });
  return { url: await presignDownload({ key: report.storageKey, expiresIn: 300 }) };
}
