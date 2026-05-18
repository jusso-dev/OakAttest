'use server';

import { z } from 'zod';
import { eq, and, max, inArray } from 'drizzle-orm';
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
import { clientOrganisations, systems } from '@/db/schema/engagements';
import { tenants } from '@/db/schema/tenants';
import { evidenceItems } from '@/db/schema/evidence';
import { engagementControls, ismControls } from '@/db/schema/ism';
import { findingControls, findings } from '@/db/schema/findings';
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
import { calculateEssentialEightOverall, ESSENTIAL_EIGHT_STRATEGIES } from '@/lib/essential-eight';
import { validateEssentialEightAssessment } from '@/lib/essential-eight-validation';
import { E8_CRITERION_STATUSES } from '@/lib/essential-eight-criteria';
import {
  renderEssentialEightReportPdf,
  type EssentialEightReportData,
} from '@/lib/pdf/essential-eight';
import { resolveBranding } from '@/lib/branding';

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
  criteriaResults: z
    .array(
      z.object({
        criterionId: z.string().max(120),
        maturity: z.enum(['ml1', 'ml2', 'ml3']),
        status: z.enum(E8_CRITERION_STATUSES),
        notes: z.string().max(4000).optional(),
        evidenceRefs: z.array(z.string().uuid()).optional(),
      }),
    )
    .max(40)
    .optional(),
  exceptions: z
    .array(
      z.object({
        scope: z.string().max(2000).optional(),
        justification: z.string().max(4000).optional(),
        owner: z.string().max(500).optional(),
        compensatingControls: z.string().max(4000).optional(),
        conclusion: z.string().max(4000).optional(),
      }),
    )
    .max(10)
    .optional(),
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

  validateEssentialEightAssessment({
    currentMaturity: data.currentMaturity,
    targetMaturity: data.targetMaturity,
    evidenceQuality: data.evidenceQuality,
    assessorConclusion: data.assessorConclusion,
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
          criteriaResults: (data.criteriaResults ?? existing.criteriaResults) as never,
          exceptions: (data.exceptions ?? existing.exceptions) as never,
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
        criteriaResults: (data.criteriaResults ?? null) as never,
        exceptions: (data.exceptions ?? null) as never,
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
        evidenceQuality: data.evidenceQuality,
        evidenceRefs: data.evidenceRefs?.length ?? 0,
        criteriaResults: data.criteriaResults?.length ?? 0,
        exceptions: data.exceptions?.length ?? 0,
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
  const [engagement] = await db
    .select()
    .from(engagements)
    .where(eq(engagements.id, data.engagementId))
    .limit(1);
  if (!engagement) throw new Error('Engagement not found');
  const [tenant] = await db
    .select({ name: tenants.name, branding: tenants.branding })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  const branding = resolveBranding(tenant?.branding ?? null);
  const [client] = await db
    .select({ name: clientOrganisations.name })
    .from(clientOrganisations)
    .where(eq(clientOrganisations.engagementId, data.engagementId))
    .limit(1);
  const [system] = await db
    .select({ name: systems.name, description: systems.description, environment: systems.environment })
    .from(systems)
    .where(eq(systems.engagementId, data.engagementId))
    .limit(1);
  const mappedControls = await db
    .select({
      ismControlId: ismControls.id,
      controlId: engagementControls.controlId,
      description: ismControls.description,
      mapping: ismControls.essentialEightMapping,
    })
    .from(engagementControls)
    .innerJoin(ismControls, eq(ismControls.id, engagementControls.ismControlId))
    .where(eq(engagementControls.engagementId, data.engagementId));
  const findingLinks = await db
    .select({
      ismControlId: findingControls.ismControlId,
      code: findings.code,
      type: findings.type,
      severity: findings.severity,
      status: findings.status,
      title: findings.title,
    })
    .from(findings)
    .innerJoin(findingControls, eq(findingControls.findingId, findings.id))
    .where(eq(findings.engagementId, data.engagementId));
  const evidenceIds = Array.from(
    new Set(rows.flatMap((row) => (Array.isArray(row.evidenceRefs) ? row.evidenceRefs : []))),
  );
  const evidenceRows =
    evidenceIds.length > 0
      ? await db
          .select({
            id: evidenceItems.id,
            filename: evidenceItems.filename,
            sha256: evidenceItems.sha256,
            reviewStatus: evidenceItems.reviewStatus,
          })
          .from(evidenceItems)
          .where(inArray(evidenceItems.id, evidenceIds))
      : [];
  const targetMaturity = profile?.targetMaturity ?? 'ml1';
  const overall = calculateEssentialEightOverall(rows, targetMaturity);
  const [{ maxV }] = await db
    .select({ maxV: max(essentialEightReports.version) })
    .from(essentialEightReports)
    .where(eq(essentialEightReports.engagementId, data.engagementId));
  const version = (maxV ?? 0) + 1;
  const generatedAt = new Date().toISOString();
  const rowByStrategy = new Map(rows.map((row) => [row.strategy, row]));
  const controlsByStrategy = new Map<
    string,
    Array<{ ismControlId: string; controlId: string; maturityLevel?: number | null }>
  >();
  const strategyByControl = new Map<string, Set<string>>();
  for (const control of mappedControls) {
    for (const mapping of control.mapping ?? []) {
      const controls = controlsByStrategy.get(mapping.strategy) ?? [];
      controls.push({
        ismControlId: control.ismControlId,
        controlId: control.controlId,
        maturityLevel: mapping.maturityLevel ?? null,
      });
      controlsByStrategy.set(mapping.strategy, controls);
      const strategies = strategyByControl.get(control.ismControlId) ?? new Set<string>();
      strategies.add(mapping.strategy);
      strategyByControl.set(control.ismControlId, strategies);
    }
  }
  const findingsByStrategy = new Map<string, EssentialEightReportData['strategies'][number]['findings']>();
  for (const finding of findingLinks) {
    for (const strategy of strategyByControl.get(finding.ismControlId) ?? []) {
      const existing = findingsByStrategy.get(strategy) ?? [];
      if (!existing.some((item) => item.code === finding.code)) {
        existing.push({
          code: finding.code,
          type: finding.type,
          severity: finding.severity,
          status: finding.status,
          title: finding.title,
        });
      }
      findingsByStrategy.set(strategy, existing);
    }
  }
  const evidenceById = new Map(evidenceRows.map((item) => [item.id, item]));
  const reportData: EssentialEightReportData = {
    tenant: { name: tenant?.name ?? 'Tenant', productName: branding.productName },
    engagement: {
      name: engagement.name,
      reference: engagement.reference,
      classification: engagement.classification,
      ismRevision: engagement.ismRevision,
    },
    client: { name: client?.name ?? '-' },
    system: {
      name: system?.name ?? engagement.name,
      description: system?.description ?? null,
      environment: system?.environment ?? null,
    },
    report: { version, generatedAt },
    profile: {
      targetMaturity,
      scope: profile?.scope ?? null,
      approach: profile?.approach ?? null,
      limitations: profile?.limitations ?? null,
    },
    overall,
    strategies: ESSENTIAL_EIGHT_STRATEGIES.map((strategy) => {
      const row = rowByStrategy.get(strategy.key);
      return {
        strategy: strategy.key,
        currentMaturity: row?.currentMaturity ?? 'ml0',
        targetMaturity: row?.targetMaturity ?? targetMaturity,
        remediationPlan: row?.remediationPlan ?? null,
        assessmentMethods: row?.assessmentMethods ?? null,
        assessmentObjects: row?.assessmentObjects ?? null,
        sampleSize: row?.sampleSize ?? null,
        evidenceQuality: row?.evidenceQuality ?? null,
        evidenceLimitations: row?.evidenceLimitations ?? null,
        assessorConclusion: row?.assessorConclusion ?? null,
        criteriaResults: row?.criteriaResults ?? [],
        exceptions: row?.exceptions ?? [],
        mappedControls: (controlsByStrategy.get(strategy.key) ?? []).map((control) => ({
          controlId: control.controlId,
          maturityLevel: control.maturityLevel,
        })),
        evidence: (row?.evidenceRefs ?? [])
          .map((id) => evidenceById.get(id))
          .filter((item): item is NonNullable<typeof item> => Boolean(item))
          .map((item) => ({
            filename: item.filename,
            sha256: item.sha256,
            reviewStatus: item.reviewStatus,
            quality: row?.evidenceQuality ?? null,
          })),
        findings: findingsByStrategy.get(strategy.key) ?? [],
      };
    }),
  };
  const pdfBuffer = await renderEssentialEightReportPdf(reportData);
  const sha256 = crypto.createHash('sha256').update(pdfBuffer).digest('hex');
  const snapshot = {
    generatedAt,
    targetMaturity,
    overall,
    profile,
    reportData: { ...reportData, report: { ...reportData.report, sha256 } },
  };
  const key = buildEssentialEightReportKey({ tenantId, engagementId: data.engagementId, version });
  await putBuffer({ key, body: pdfBuffer, contentType: 'application/pdf' });
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
