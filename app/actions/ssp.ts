'use server';

import { z } from 'zod';
import { and, eq, isNull, desc, max } from 'drizzle-orm';
import crypto from 'node:crypto';
import JSZip from 'jszip';
import { db } from '@/lib/db/client';
import { engagements, clientOrganisations, systems } from '@/db/schema/engagements';
import { engagementControls, ismControls } from '@/db/schema/ism';
import { systemBoundaries } from '@/db/schema/boundaries';
import { essentialEightAssessments } from '@/db/schema/essential-eight';
import { residualRisks } from '@/db/schema/certification';
import { sspExports, sspSections } from '@/db/schema/ssp';
import { engagementMembers, tenants } from '@/db/schema/tenants';
import { users } from '@/db/schema/auth';
import { auditLog } from '@/db/schema/audit';
import { requireSession } from '@/lib/auth/session';
import { requirePermission } from '@/lib/rbac/require';
import { ACTIONS } from '@/lib/rbac/matrix';
import {
  STORAGE_BUCKET,
  buildSspKey,
  deleteObject,
  presignDownload,
  putBuffer,
} from '@/lib/storage/s3';
import { renderSspPdf, type SspData } from '@/lib/pdf/ssp';
import { renderSspXlsx } from '@/lib/xlsx/ssp';
import { renderBoundaryPng } from '@/lib/boundary/render';
import { boundaryGraphSchema } from '@/lib/boundary/schema';
import { resolveBranding } from '@/lib/branding';

const generateSchema = z.object({
  engagementId: z.string().uuid(),
});

export async function generateSspPdf(input: z.infer<typeof generateSchema>) {
  const session = await requireSession();
  const { engagementId } = generateSchema.parse(input);

  const engagement = await requireEngagementExportAccess(session.user.id, engagementId);
  const nextVersion = await nextSspVersion(engagementId);
  const data = await buildSspData(engagementId, engagement, nextVersion);
  const buffer = await renderSspPdf(data);
  const sha = crypto.createHash('sha256').update(buffer).digest('hex');
  const key = buildSspKey({
    tenantId: engagement.tenantId,
    engagementId,
    version: nextVersion,
    format: 'pdf',
  });
  await putBuffer({ key, body: buffer, contentType: 'application/pdf' });

  const exportId = await recordSspExport({
    engagementId,
    tenantId: engagement.tenantId,
    userId: session.user.id,
    version: nextVersion,
    format: 'pdf',
    key,
    sha,
    size: buffer.length,
  });

  return { exportId, version: nextVersion, sha256: sha };
}

export async function generateSspXlsx(input: z.infer<typeof generateSchema>) {
  const session = await requireSession();
  const { engagementId } = generateSchema.parse(input);

  const engagement = await requireEngagementExportAccess(session.user.id, engagementId);
  const nextVersion = await nextSspVersion(engagementId);
  const data = await buildSspData(engagementId, engagement, nextVersion);
  const buffer = await renderSspXlsx(data);
  const sha = crypto.createHash('sha256').update(buffer).digest('hex');
  const key = buildSspKey({
    tenantId: engagement.tenantId,
    engagementId,
    version: nextVersion,
    format: 'xlsx',
  });
  await putBuffer({
    key,
    body: buffer,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const exportId = await recordSspExport({
    engagementId,
    tenantId: engagement.tenantId,
    userId: session.user.id,
    version: nextVersion,
    format: 'xlsx',
    key,
    sha,
    size: buffer.length,
  });

  return { exportId, version: nextVersion, sha256: sha };
}

export async function generateSspBundle(input: z.infer<typeof generateSchema>) {
  const session = await requireSession();
  const { engagementId } = generateSchema.parse(input);

  const engagement = await requireEngagementExportAccess(session.user.id, engagementId);
  const nextVersion = await nextSspVersion(engagementId);
  const data = await buildSspData(engagementId, engagement, nextVersion);
  const boundary = await latestBoundary(engagementId);
  const boundaryGraph = boundary
    ? boundaryGraphSchema.safeParse(boundary.graph).data
    : undefined;

  const pdf = await renderSspPdf(data);
  const xlsx = await renderSspXlsx(data);
  const boundaryPng = await renderBoundaryPng(boundaryGraph);

  const zip = new JSZip();
  const base = safeFilename(`${engagement.reference ?? engagement.name}-ssp-v${nextVersion}`);
  zip.file(`${base}.pdf`, pdf);
  zip.file(`${base}.xlsx`, xlsx);
  zip.file(`${base}-boundary.png`, boundaryPng);

  const buffer = Buffer.from(
    await zip.generateAsync({
      type: 'uint8array',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    }),
  );
  const sha = crypto.createHash('sha256').update(buffer).digest('hex');
  const key = buildSspKey({
    tenantId: engagement.tenantId,
    engagementId,
    version: nextVersion,
    format: 'zip',
  });

  await putBuffer({ key, body: buffer, contentType: 'application/zip' });

  const exportId = await recordSspExport({
    engagementId,
    tenantId: engagement.tenantId,
    userId: session.user.id,
    version: nextVersion,
    format: 'zip',
    key,
    sha,
    size: buffer.length,
  });

  return { exportId, version: nextVersion, sha256: sha };
}

async function requireEngagementExportAccess(userId: string, engagementId: string) {
  const [engagement] = await db
    .select()
    .from(engagements)
    .where(eq(engagements.id, engagementId))
    .limit(1);
  if (!engagement) throw new Error('Engagement not found');

  await requirePermission(ACTIONS.engagementView, {
    userId,
    tenantId: engagement.tenantId,
    engagementId,
  });

  return engagement;
}

async function nextSspVersion(engagementId: string) {
  const [{ maxVersion }] = await db
    .select({ maxVersion: max(sspExports.version) })
    .from(sspExports)
    .where(eq(sspExports.engagementId, engagementId));
  return (maxVersion ?? 0) + 1;
}

async function buildSspData(
  engagementId: string,
  engagement: typeof engagements.$inferSelect,
  version: number,
): Promise<SspData> {
  const [tenant] = await db
    .select({ name: tenants.name, branding: tenants.branding })
    .from(tenants)
    .where(eq(tenants.id, engagement.tenantId))
    .limit(1);
  const branding = resolveBranding(tenant.branding ?? null);

  const [client] = await db
    .select()
    .from(clientOrganisations)
    .where(eq(clientOrganisations.engagementId, engagementId))
    .limit(1);

  const [system] = await db
    .select()
    .from(systems)
    .where(eq(systems.engagementId, engagementId))
    .limit(1);

  const [boundary] = await db
    .select()
    .from(systemBoundaries)
    .where(
      and(
        eq(systemBoundaries.engagementId, engagementId),
        isNull(systemBoundaries.supersededAt),
      ),
    )
    .orderBy(desc(systemBoundaries.version))
    .limit(1);

  const controlRows = await db
    .select({
      controlId: engagementControls.controlId,
      description: ismControls.description,
      applicable: engagementControls.applicable,
      justification: engagementControls.applicabilityJustification,
      implementationStatement: engagementControls.implementationStatement,
      status: engagementControls.status,
      assessmentMethods: engagementControls.assessmentMethods,
      assessmentObjects: engagementControls.assessmentObjects,
      evidenceQuality: engagementControls.evidenceQuality,
      evidenceLimitations: engagementControls.evidenceLimitations,
    })
    .from(engagementControls)
    .innerJoin(ismControls, eq(ismControls.id, engagementControls.ismControlId))
    .where(eq(engagementControls.engagementId, engagementId))
    .orderBy(engagementControls.controlId);

  const e8 = await db
    .select({
      strategy: essentialEightAssessments.strategy,
      currentMaturity: essentialEightAssessments.currentMaturity,
      targetMaturity: essentialEightAssessments.targetMaturity,
    })
    .from(essentialEightAssessments)
    .where(eq(essentialEightAssessments.engagementId, engagementId));

  const risks = await db
    .select({
      title: residualRisks.title,
      description: residualRisks.description,
      mitigation: residualRisks.mitigation,
    })
    .from(residualRisks)
    .where(eq(residualRisks.engagementId, engagementId));

  const members = await db
    .select({
      name: users.name,
      email: users.email,
      role: engagementMembers.role,
      joinedAt: engagementMembers.joinedAt,
    })
    .from(engagementMembers)
    .innerJoin(users, eq(users.id, engagementMembers.userId))
    .where(
      and(
        eq(engagementMembers.engagementId, engagementId),
        isNull(engagementMembers.deletedAt),
      ),
    )
    .orderBy(engagementMembers.role, users.email);

  const summary = buildControlSummary(
    controlRows.map((c) => ({
      status: c.status,
      applicable: c.applicable,
      implementationStatement: c.implementationStatement,
    })),
    e8.length,
    risks.length,
  );

  return {
    engagement: {
      name: engagement.name,
      reference: engagement.reference,
      classification: engagement.classification,
      ismRevision: engagement.ismRevision,
      phase: engagement.phase,
      status: engagement.status,
      createdAt: engagement.createdAt.toISOString(),
      updatedAt: engagement.updatedAt.toISOString(),
      startedAt: engagement.startedAt?.toISOString() ?? null,
      targetCertificationAt: engagement.targetCertificationAt?.toISOString() ?? null,
      certifiedAt: engagement.certifiedAt?.toISOString() ?? null,
      boundaryLockedAt: engagement.boundaryLockedAt?.toISOString() ?? null,
    },
    tenant: { name: tenant.name, productName: branding.productName },
    client: { name: client?.name ?? '—', abn: client?.abn ?? null },
    system: {
      name: system?.name ?? '—',
      description: system?.description ?? null,
      environment: system?.environment ?? null,
    },
    boundary: boundary
      ? {
          version: boundary.version,
          nodes: boundary.graph?.nodes?.length ?? 0,
          edges: boundary.graph?.edges?.length ?? 0,
        }
      : null,
    members: members.map((member) => ({
      name: member.name,
      email: member.email,
      role: member.role,
      joinedAt: member.joinedAt?.toISOString() ?? null,
    })),
    summary,
    controls: controlRows.map((c) => ({
      controlId: c.controlId,
      description: c.description ?? '',
      applicable: c.applicable,
      justification: c.justification,
      implementationStatement: c.implementationStatement,
      status: c.status,
      assessmentMethods: c.assessmentMethods,
      assessmentObjects: c.assessmentObjects,
      evidenceQuality: c.evidenceQuality,
      evidenceLimitations: c.evidenceLimitations,
    })),
    essentialEight: e8.map((e) => ({
      strategy: e.strategy,
      currentMaturity: e.currentMaturity,
      targetMaturity: e.targetMaturity,
    })),
    residualRisks: risks.map((r) => ({
      title: r.title,
      description: r.description,
      mitigation: r.mitigation,
    })),
    exportedAt: new Date().toISOString(),
    exportVersion: version,
  };
}

function buildControlSummary(
  controls: Array<{
    status: string;
    applicable: string | null;
    implementationStatement: string | null;
  }>,
  essentialEightCount: number,
  residualRiskCount: number,
): SspData['summary'] {
  const counts = {
    notStarted: 0,
    inProgress: 0,
    evidencePending: 0,
    implemented: 0,
    notApplicable: 0,
    compensating: 0,
    notImplemented: 0,
    undecidedApplicability: 0,
    missingImplementationStatements: 0,
  };

  for (const control of controls) {
    if (control.status === 'not_started') counts.notStarted += 1;
    if (control.status === 'in_progress') counts.inProgress += 1;
    if (control.status === 'evidence_pending') counts.evidencePending += 1;
    if (control.status === 'implemented') counts.implemented += 1;
    if (control.status === 'not_applicable') counts.notApplicable += 1;
    if (control.status === 'compensating') counts.compensating += 1;
    if (control.status === 'not_implemented') counts.notImplemented += 1;
    if (!control.applicable) counts.undecidedApplicability += 1;
    if (!control.implementationStatement?.trim() && control.applicable !== 'not_applicable') {
      counts.missingImplementationStatements += 1;
    }
  }

  return {
    totalControls: controls.length,
    ...counts,
    remainingControls: controls.filter(
      (control) => control.status !== 'implemented' && control.status !== 'not_applicable',
    ).length,
    residualRiskCount,
    essentialEightCount,
  };
}

async function recordSspExport(opts: {
  engagementId: string;
  tenantId: string;
  userId: string;
  version: number;
  format: 'pdf' | 'xlsx' | 'zip';
  key: string;
  sha: string;
  size: number;
}) {
  const exportId = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(sspExports).values({
      id: exportId,
      engagementId: opts.engagementId,
      tenantId: opts.tenantId,
      version: opts.version,
      format: opts.format,
      storageKey: opts.key,
      storageBucket: STORAGE_BUCKET,
      sha256: opts.sha,
      sizeBytes: opts.size,
      generatedBy: opts.userId,
    });
    await tx.insert(auditLog).values({
      tenantId: opts.tenantId,
      engagementId: opts.engagementId,
      actorUserId: opts.userId,
      action: `ssp.export.${opts.format}`,
      resourceType: 'ssp_export',
      resourceId: exportId,
      afterJson: {
        version: opts.version,
        format: opts.format,
        sha256: opts.sha,
        size: opts.size,
      } as never,
    });
  });

  return exportId;
}

async function latestBoundary(engagementId: string) {
  const [boundary] = await db
    .select()
    .from(systemBoundaries)
    .where(
      and(
        eq(systemBoundaries.engagementId, engagementId),
        isNull(systemBoundaries.supersededAt),
      ),
    )
    .orderBy(desc(systemBoundaries.version))
    .limit(1);
  return boundary ?? null;
}

function safeFilename(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'oakattest-ssp';
}

// Issue a short-lived download URL for an SSP export.
export async function getSspDownloadUrl(opts: {
  engagementId: string;
  exportId: string;
}): Promise<{ url: string }> {
  const session = await requireSession();
  const [exp] = await db
    .select()
    .from(sspExports)
    .where(eq(sspExports.id, opts.exportId))
    .limit(1);
  if (!exp || exp.engagementId !== opts.engagementId) throw new Error('Export not found');

  await requirePermission(ACTIONS.engagementView, {
    userId: session.user.id,
    tenantId: exp.tenantId,
    engagementId: opts.engagementId,
  });

  await db.insert(auditLog).values({
    tenantId: exp.tenantId,
    engagementId: opts.engagementId,
    actorUserId: session.user.id,
    action: 'ssp.export.download',
    resourceType: 'ssp_export',
    resourceId: opts.exportId,
  });

  const url = await presignDownload({ key: exp.storageKey, expiresIn: 300 });
  return { url };
}

const deleteExportSchema = z.object({
  engagementId: z.string().uuid(),
  exportId: z.string().uuid(),
});

export async function deleteSspExport(input: z.infer<typeof deleteExportSchema>) {
  const session = await requireSession();
  const data = deleteExportSchema.parse(input);

  const [exp] = await db
    .select()
    .from(sspExports)
    .where(eq(sspExports.id, data.exportId))
    .limit(1);
  if (!exp || exp.engagementId !== data.engagementId) throw new Error('Export not found');

  await requirePermission(ACTIONS.sspExportDelete, {
    userId: session.user.id,
    tenantId: exp.tenantId,
    engagementId: data.engagementId,
  });

  await deleteObject(exp.storageKey);

  await db.transaction(async (tx) => {
    await tx.delete(sspExports).where(eq(sspExports.id, exp.id));
    await tx.insert(auditLog).values({
      tenantId: exp.tenantId,
      engagementId: data.engagementId,
      actorUserId: session.user.id,
      action: 'ssp.export.delete',
      resourceType: 'ssp_export',
      resourceId: exp.id,
      beforeJson: {
        version: exp.version,
        format: exp.format,
        storageBucket: exp.storageBucket,
        storageKey: exp.storageKey,
        sha256: exp.sha256,
        size: exp.sizeBytes,
      } as never,
    });
  });

  return { ok: true };
}

// Save free-text content for a specific SSP section. Used when assessors or
// clients customise generated prose.
const sectionSchema = z.object({
  engagementId: z.string().uuid(),
  sectionKey: z.enum([
    'overview',
    'classification',
    'boundary',
    'controls',
    'implementation',
    'essential_eight',
    'residual_risks',
    'annexes',
  ]),
  content: z.string().max(50000),
});

export async function saveSspSection(input: z.infer<typeof sectionSchema>) {
  const session = await requireSession();
  const data = sectionSchema.parse(input);
  const [eng] = await db
    .select({ tenantId: engagements.tenantId })
    .from(engagements)
    .where(eq(engagements.id, data.engagementId))
    .limit(1);
  if (!eng) throw new Error('Engagement not found');

  await requirePermission(ACTIONS.implementationStatementWrite, {
    userId: session.user.id,
    tenantId: eng.tenantId,
    engagementId: data.engagementId,
  }).catch(async () => {
    await requirePermission(ACTIONS.engagementUpdate, {
      userId: session.user.id,
      tenantId: eng.tenantId,
      engagementId: data.engagementId,
    });
  });

  const [existing] = await db
    .select()
    .from(sspSections)
    .where(
      and(
        eq(sspSections.engagementId, data.engagementId),
        eq(sspSections.sectionKey, data.sectionKey),
      ),
    )
    .limit(1);

  await db.transaction(async (tx) => {
    if (existing) {
      await tx
        .update(sspSections)
        .set({
          content: data.content,
          lastEditedBy: session.user.id,
          lastEditedAt: new Date(),
        })
        .where(eq(sspSections.id, existing.id));
    } else {
      await tx.insert(sspSections).values({
        engagementId: data.engagementId,
        tenantId: eng.tenantId,
        sectionKey: data.sectionKey,
        content: data.content,
        lastEditedBy: session.user.id,
      });
    }
    await tx.insert(auditLog).values({
      tenantId: eng.tenantId,
      engagementId: data.engagementId,
      actorUserId: session.user.id,
      action: 'ssp.section.save',
      resourceType: 'ssp_section',
      afterJson: { sectionKey: data.sectionKey, length: data.content.length } as never,
    });
  });

  return { ok: true };
}
