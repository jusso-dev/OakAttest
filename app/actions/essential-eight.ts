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
import { engagementControls, frameworkControls } from '@/db/schema/frameworks';
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
import {
  validateEssentialEightAssessment,
  validateEssentialEightCriteriaForMaturity,
} from '@/lib/essential-eight-validation';
import {
  E8_ASSESSMENT_GUIDE_VERSION,
  E8_ASSESSMENT_OUTCOMES,
  buildEssentialEightCriterion,
} from '@/lib/essential-eight-criteria';
import {
  renderEssentialEightReportPdf,
  type EssentialEightReportData,
} from '@/lib/pdf/essential-eight';
import { userTimeZone } from '@/lib/auth/user-timezone';
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

const criterionResultSchema = z.object({
  criterionId: z.string().max(300),
  strategy: strategySchema,
  frameworkControlId: z.string().uuid(),
  controlId: z.string().max(120),
  criterionText: z.string().max(16000),
  sourceRevision: z.string().max(120),
  guideVersion: z.string().max(40),
  maturity: z.enum(['ml1', 'ml2', 'ml3']),
  outcome: z.enum(E8_ASSESSMENT_OUTCOMES),
  assessmentMethods: z.string().max(2000).optional(),
  assessmentObjects: z.string().max(2000).optional(),
  populationSize: z.number().int().nonnegative().max(10_000_000).optional(),
  sampleSize: z.number().int().nonnegative().max(10_000_000).optional(),
  sampledItems: z.array(z.string().max(500)).max(1000).optional(),
  testProcedure: z.string().max(8000).optional(),
  testResult: z.string().max(8000).optional(),
  evidenceQuality: z.enum(['excellent', 'good', 'fair', 'poor', 'insufficient']).optional(),
  evidenceLimitations: z.string().max(4000).optional(),
  evidenceRefs: z.array(z.string().uuid()).max(100).optional(),
  alternateControl: z.string().max(8000).optional(),
  equivalentProtectionConclusion: z.string().max(8000).optional(),
  notApplicableJustification: z.string().max(4000).optional(),
  exception: z
    .object({
      justification: z.string().max(4000),
      authorityName: z.string().max(500),
      authorityRole: z.string().max(500),
      decisionReference: z.string().max(500).optional(),
      approvedAt: z.string().date(),
      expiresAt: z.string().date().optional(),
    })
    .optional(),
  testedAt: z.string().date().optional(),
  notes: z.string().max(4000).optional(),
});

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
  criteriaResults: z.array(criterionResultSchema).max(300).optional(),
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
  let canAssess = true;
  try {
    await requirePermission(ACTIONS.applicabilityDecide, {
      userId: session.user.id,
      tenantId,
      engagementId: data.engagementId,
    });
  } catch {
    canAssess = false;
    await requirePermission(ACTIONS.remediationGuidanceWrite, {
      userId: session.user.id,
      tenantId,
      engagementId: data.engagementId,
    });
  }

  if (canAssess) {
    validateEssentialEightAssessment({
      currentMaturity: data.currentMaturity,
      targetMaturity: data.targetMaturity,
      evidenceQuality: data.evidenceQuality,
      assessorConclusion: data.assessorConclusion,
    });
  }

  const mappedRows = await db
    .select({
      frameworkControlId: frameworkControls.id,
      controlId: frameworkControls.controlId,
      description: frameworkControls.description,
      revision: frameworkControls.revision,
      mapping: frameworkControls.essentialEightMapping,
    })
    .from(engagementControls)
    .innerJoin(frameworkControls, eq(frameworkControls.id, engagementControls.frameworkControlId))
    .where(eq(engagementControls.engagementId, data.engagementId));
  const criteria = mappedRows.flatMap((row) =>
    (row.mapping ?? [])
      .filter((mapping) => mapping.strategy === data.strategy)
      .map((mapping) =>
        buildEssentialEightCriterion({
          strategy: data.strategy,
          frameworkControlId: row.frameworkControlId,
          controlId: row.controlId,
          description: row.description,
          sourceRevision: row.revision,
          maturityLevel: mapping.maturityLevel,
          guideVersion: E8_ASSESSMENT_GUIDE_VERSION,
        }),
      ),
  );
  const criterionById = new Map(criteria.map((criterion) => [criterion.criterionId, criterion]));
  const submittedResults = canAssess ? (data.criteriaResults ?? []) : [];
  const unknown = submittedResults.find((result) => !criterionById.has(result.criterionId));
  if (unknown) throw new Error(`Unknown Essential Eight criterion '${unknown.controlId}'.`);
  const criteriaResults = submittedResults.map((result) => ({
    ...result,
    ...criterionById.get(result.criterionId)!,
  }));

  if (canAssess) {
    validateEssentialEightCriteriaForMaturity({
      currentMaturity: data.currentMaturity,
      criteria,
      results: criteriaResults,
    });
  }

  const criterionEvidenceIds = Array.from(
    new Set(criteriaResults.flatMap((result) => result.evidenceRefs ?? [])),
  );
  if (criterionEvidenceIds.length > 0) {
    const acceptedEvidence = await db
      .select({ id: evidenceItems.id, reviewStatus: evidenceItems.reviewStatus })
      .from(evidenceItems)
      .where(
        and(
          eq(evidenceItems.engagementId, data.engagementId),
          inArray(evidenceItems.id, criterionEvidenceIds),
        ),
      );
    const acceptedIds = new Set(
      acceptedEvidence
        .filter((item) => item.reviewStatus === 'accepted')
        .map((item) => item.id),
    );
    const invalidEvidence = criterionEvidenceIds.find((id) => !acceptedIds.has(id));
    if (invalidEvidence) {
      throw new Error('Criterion evidence must belong to this assessment and be accepted.');
    }
  }

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
          currentMaturity: canAssess ? data.currentMaturity : existing.currentMaturity,
          targetMaturity: canAssess ? data.targetMaturity : existing.targetMaturity,
          remediationPlan: data.remediationPlan ?? existing.remediationPlan,
          evidenceRefs: (canAssess ? data.evidenceRefs ?? existing.evidenceRefs : existing.evidenceRefs) as never,
          assessmentMethods: canAssess ? data.assessmentMethods ?? existing.assessmentMethods : existing.assessmentMethods,
          assessmentObjects: canAssess ? data.assessmentObjects ?? existing.assessmentObjects : existing.assessmentObjects,
          sampleSize: canAssess ? data.sampleSize ?? existing.sampleSize : existing.sampleSize,
          evidenceQuality: canAssess ? data.evidenceQuality ?? existing.evidenceQuality : existing.evidenceQuality,
          evidenceLimitations: canAssess ? data.evidenceLimitations ?? existing.evidenceLimitations : existing.evidenceLimitations,
          assessorConclusion: canAssess ? data.assessorConclusion ?? existing.assessorConclusion : existing.assessorConclusion,
          criteriaResults: (canAssess ? criteriaResults : existing.criteriaResults) as never,
          exceptions: (canAssess ? data.exceptions ?? existing.exceptions : existing.exceptions) as never,
          assessedBy: canAssess ? session.user.id : existing.assessedBy,
          updatedAt: new Date(),
        })
        .where(eq(essentialEightAssessments.id, existing.id));
    } else {
      await tx.insert(essentialEightAssessments).values({
        engagementId: data.engagementId,
        tenantId,
        strategy: data.strategy,
        currentMaturity: canAssess ? data.currentMaturity : 'ml0',
        targetMaturity: canAssess ? data.targetMaturity : 'ml1',
        remediationPlan: data.remediationPlan ?? null,
        evidenceRefs: (canAssess ? data.evidenceRefs ?? null : null) as never,
        assessmentMethods: canAssess ? data.assessmentMethods ?? null : null,
        assessmentObjects: canAssess ? data.assessmentObjects ?? null : null,
        sampleSize: canAssess ? data.sampleSize ?? null : null,
        evidenceQuality: canAssess ? data.evidenceQuality ?? null : null,
        evidenceLimitations: canAssess ? data.evidenceLimitations ?? null : null,
        assessorConclusion: canAssess ? data.assessorConclusion ?? null : null,
        criteriaResults: (canAssess ? criteriaResults : []) as never,
        exceptions: (canAssess ? data.exceptions ?? null : null) as never,
        assessedBy: canAssess ? session.user.id : null,
      });
    }

    if (canAssess && (!existing || existing.currentMaturity !== data.currentMaturity)) {
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
      action: canAssess ? 'essential_eight.upsert' : 'essential_eight.remediation_plan.upsert',
      resourceType: 'essential_eight_assessment',
      afterJson: {
        strategy: data.strategy,
        currentMaturity: canAssess ? data.currentMaturity : undefined,
        targetMaturity: canAssess ? data.targetMaturity : undefined,
        evidenceQuality: canAssess ? data.evidenceQuality : undefined,
        evidenceRefs: canAssess ? data.evidenceRefs?.length ?? 0 : undefined,
        criteriaResults: canAssess ? criteriaResults.length : undefined,
        exceptions: canAssess ? data.exceptions?.length ?? 0 : undefined,
        remediationPlanUpdated: Boolean(data.remediationPlan),
      } as never,
    });
  });

  revalidatePath(`/engagements/${data.engagementId}/essential-eight`);
  return { ok: true };
}

export async function generateEssentialEightReport(input: { engagementId: string }) {
  const session = await requireSession();
  const timeZone = await userTimeZone(session.user.id);
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
      frameworkControlId: frameworkControls.id,
      controlId: engagementControls.controlId,
      description: frameworkControls.description,
      mapping: frameworkControls.essentialEightMapping,
    })
    .from(engagementControls)
    .innerJoin(frameworkControls, eq(frameworkControls.id, engagementControls.frameworkControlId))
    .where(eq(engagementControls.engagementId, data.engagementId));
  const findingLinks = await db
    .select({
      frameworkControlId: findingControls.frameworkControlId,
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
    new Set(
      rows.flatMap((row) => [
        ...(Array.isArray(row.evidenceRefs) ? row.evidenceRefs : []),
        ...(row.criteriaResults ?? []).flatMap((result) => result.evidenceRefs ?? []),
      ]),
    ),
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
    Array<{ frameworkControlId: string; controlId: string; maturityLevel?: number | null }>
  >();
  const strategyByControl = new Map<string, Set<string>>();
  for (const control of mappedControls) {
    for (const mapping of control.mapping ?? []) {
      const controls = controlsByStrategy.get(mapping.strategy) ?? [];
      controls.push({
        frameworkControlId: control.frameworkControlId,
        controlId: control.controlId,
        maturityLevel: mapping.maturityLevel ?? null,
      });
      controlsByStrategy.set(mapping.strategy, controls);
      const strategies = strategyByControl.get(control.frameworkControlId) ?? new Set<string>();
      strategies.add(mapping.strategy);
      strategyByControl.set(control.frameworkControlId, strategies);
    }
  }
  const findingsByStrategy = new Map<string, EssentialEightReportData['strategies'][number]['findings']>();
  for (const finding of findingLinks) {
    for (const strategy of strategyByControl.get(finding.frameworkControlId) ?? []) {
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
    timeZone,
    tenant: {
      name: tenant?.name ?? 'Tenant',
      productName: branding.productName,
      primaryColour: branding.primaryColour,
      accentColour: branding.accentColour,
      logoUrl: branding.logoUrl,
    },
    engagement: {
      name: engagement.name,
      reference: engagement.reference,
      classification: engagement.classification,
      frameworkRevision: engagement.frameworkRevision,
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
      assessmentGuideVersion: profile?.assessmentGuideVersion ?? '2024-08',
      criteriaModelVersion: profile?.criteriaModelVersion ?? 'ism-mapped-v1',
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
        criteriaResults: (row?.criteriaResults ?? []).map((result) => ({
          ...result,
          evidence: (result.evidenceRefs ?? [])
            .map((id) => evidenceById.get(id))
            .filter((item): item is NonNullable<typeof item> => Boolean(item))
            .map((item) => ({
              filename: item.filename,
              sha256: item.sha256,
              reviewStatus: item.reviewStatus,
            })),
        })),
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
