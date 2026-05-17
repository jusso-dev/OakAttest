'use server';

import { z } from 'zod';
import { and, eq, isNull, desc, max } from 'drizzle-orm';
import crypto from 'node:crypto';
import { db } from '@/lib/db/client';
import { engagements, clientOrganisations, systems } from '@/db/schema/engagements';
import { engagementControls } from '@/db/schema/ism';
import { systemBoundaries } from '@/db/schema/boundaries';
import { essentialEightAssessments } from '@/db/schema/essential-eight';
import { residualRisks } from '@/db/schema/certification';
import { sspExports, sspSections } from '@/db/schema/ssp';
import { tenants } from '@/db/schema/tenants';
import { auditLog } from '@/db/schema/audit';
import { requireSession } from '@/lib/auth/session';
import { requirePermission } from '@/lib/rbac/require';
import { ACTIONS } from '@/lib/rbac/matrix';
import {
  STORAGE_BUCKET,
  buildSspKey,
  presignDownload,
  putBuffer,
} from '@/lib/storage/s3';
import { renderSspPdf, type SspData } from '@/lib/pdf/ssp';
import { resolveBranding } from '@/lib/branding';

const generateSchema = z.object({
  engagementId: z.string().uuid(),
});

export async function generateSspPdf(input: z.infer<typeof generateSchema>) {
  const session = await requireSession();
  const { engagementId } = generateSchema.parse(input);

  const [engagement] = await db
    .select()
    .from(engagements)
    .where(eq(engagements.id, engagementId))
    .limit(1);
  if (!engagement) throw new Error('Engagement not found');

  await requirePermission(ACTIONS.engagementView, {
    userId: session.user.id,
    tenantId: engagement.tenantId,
    engagementId,
  });

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
      description: engagementControls.implementationStatement,
      applicable: engagementControls.applicable,
      justification: engagementControls.applicabilityJustification,
      implementationStatement: engagementControls.implementationStatement,
      status: engagementControls.status,
    })
    .from(engagementControls)
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

  const [{ maxVersion }] = await db
    .select({ maxVersion: max(sspExports.version) })
    .from(sspExports)
    .where(eq(sspExports.engagementId, engagementId));
  const nextVersion = (maxVersion ?? 0) + 1;

  const data: SspData = {
    engagement: {
      name: engagement.name,
      reference: engagement.reference,
      classification: engagement.classification,
      ismRevision: engagement.ismRevision,
      phase: engagement.phase,
      status: engagement.status,
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
    controls: controlRows.map((c) => ({
      controlId: c.controlId,
      description: c.description ?? '',
      applicable: c.applicable,
      justification: c.justification,
      implementationStatement: c.implementationStatement,
      status: c.status,
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
    exportVersion: nextVersion,
  };

  const buffer = await renderSspPdf(data);
  const sha = crypto.createHash('sha256').update(buffer).digest('hex');
  const key = buildSspKey({
    tenantId: engagement.tenantId,
    engagementId,
    version: nextVersion,
    format: 'pdf',
  });
  await putBuffer({ key, body: buffer, contentType: 'application/pdf' });

  const exportId = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(sspExports).values({
      id: exportId,
      engagementId,
      tenantId: engagement.tenantId,
      version: nextVersion,
      format: 'pdf',
      storageKey: key,
      storageBucket: STORAGE_BUCKET,
      sha256: sha,
      sizeBytes: buffer.length,
      generatedBy: session.user.id,
    });
    await tx.insert(auditLog).values({
      tenantId: engagement.tenantId,
      engagementId,
      actorUserId: session.user.id,
      action: 'ssp.export.pdf',
      resourceType: 'ssp_export',
      resourceId: exportId,
      afterJson: { version: nextVersion, sha256: sha, size: buffer.length } as never,
    });
  });

  return { exportId, version: nextVersion, sha256: sha };
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
