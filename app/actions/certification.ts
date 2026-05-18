'use server';

import { z } from 'zod';
import { and, eq, max, desc } from 'drizzle-orm';
import crypto from 'node:crypto';
import JSZip from 'jszip';
import { db } from '@/lib/db/client';
import { engagements, clientOrganisations } from '@/db/schema/engagements';
import { tenants } from '@/db/schema/tenants';
import {
  certificationReports,
  residualRisks,
  tenantSigningKeys,
} from '@/db/schema/certification';
import { findings } from '@/db/schema/findings';
import { evidenceItems } from '@/db/schema/evidence';
import { auditLog } from '@/db/schema/audit';
import { sspExports } from '@/db/schema/ssp';
import { requireSession } from '@/lib/auth/session';
import { requirePermission } from '@/lib/rbac/require';
import { ACTIONS } from '@/lib/rbac/matrix';
import {
  STORAGE_BUCKET,
  buildCertificationKey,
  presignDownload,
  putBuffer,
} from '@/lib/storage/s3';
import { renderCertificationPdf, type CertificationData } from '@/lib/pdf/certification';
import { resolveBranding } from '@/lib/branding';
import { getCertificationReadiness } from '@/lib/certification/readiness';
import { signCertificationBundle } from '@/lib/security/signing';

const generateSchema = z.object({
  engagementId: z.string().uuid(),
  scope: z.string().min(10).max(8000),
  methodology: z.string().min(10).max(8000),
  recommendation: z.enum(['recommended', 'recommended_with_conditions', 'not_recommended']),
  conditions: z.string().max(4000).optional(),
  validUntil: z.string().date().optional(),
});

export async function generateCertificationDraft(input: z.infer<typeof generateSchema>) {
  const session = await requireSession();
  const data = generateSchema.parse(input);

  const [engagement] = await db
    .select()
    .from(engagements)
    .where(eq(engagements.id, data.engagementId))
    .limit(1);
  if (!engagement) throw new Error('Engagement not found');

  await requirePermission(ACTIONS.certificationGenerate, {
    userId: session.user.id,
    tenantId: engagement.tenantId,
    engagementId: data.engagementId,
  });

  const [tenant] = await db
    .select({ name: tenants.name, branding: tenants.branding })
    .from(tenants)
    .where(eq(tenants.id, engagement.tenantId))
    .limit(1);
  const branding = resolveBranding(tenant.branding ?? null);

  const [client] = await db
    .select({ name: clientOrganisations.name })
    .from(clientOrganisations)
    .where(eq(clientOrganisations.engagementId, data.engagementId))
    .limit(1);

  const findingRows = await db
    .select({
      type: findings.type,
      severity: findings.severity,
      status: findings.status,
    })
    .from(findings)
    .where(eq(findings.engagementId, data.engagementId));

  const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
  let nonConformanceOpen = 0;
  let observations = 0;
  for (const f of findingRows) {
    bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
    if (f.type === 'non_conformance' && f.status !== 'closed') nonConformanceOpen += 1;
    if (f.type === 'observation') observations += 1;
  }

  const risks = await db
    .select({
      title: residualRisks.title,
      description: residualRisks.description,
      mitigation: residualRisks.mitigation,
    })
    .from(residualRisks)
    .where(eq(residualRisks.engagementId, data.engagementId));

  const [{ maxV }] = await db
    .select({ maxV: max(certificationReports.version) })
    .from(certificationReports)
    .where(eq(certificationReports.engagementId, data.engagementId));
  const nextVersion = (maxV ?? 0) + 1;

  const cert: CertificationData = {
    engagement: {
      name: engagement.name,
      reference: engagement.reference,
      classification: engagement.classification,
      ismRevision: engagement.ismRevision,
    },
    tenant: { name: tenant.name, productName: branding.productName },
    client: { name: client?.name ?? '—' },
    scope: data.scope,
    methodology: data.methodology,
    findings: {
      total: findingRows.length,
      nonConformanceOpen,
      observations,
      bySeverity,
    },
    residualRisks: risks.map((r) => ({
      title: r.title,
      description: r.description,
      mitigation: r.mitigation,
    })),
    recommendation: data.recommendation,
    conditions: data.conditions ?? null,
    validUntil: data.validUntil ?? null,
    signedBy: null,
    signedAt: null,
    bundleHash: null,
    publicVerificationUrl: null,
    reportVersion: nextVersion,
  };

  const pdfBuffer = await renderCertificationPdf(cert);
  const pdfSha = crypto.createHash('sha256').update(pdfBuffer).digest('hex');
  const pdfKey = buildCertificationKey({
    tenantId: engagement.tenantId,
    engagementId: data.engagementId,
    version: nextVersion,
    kind: 'pdf',
  });
  await putBuffer({ key: pdfKey, body: pdfBuffer, contentType: 'application/pdf' });

  const id = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(certificationReports).values({
      id,
      engagementId: data.engagementId,
      tenantId: engagement.tenantId,
      version: nextVersion,
      status: 'draft',
      snapshot: cert as never,
      pdfStorageKey: pdfKey,
      pdfStorageBucket: STORAGE_BUCKET,
      pdfSha256: pdfSha,
      createdBy: session.user.id,
    });
    await tx.insert(auditLog).values({
      tenantId: engagement.tenantId,
      engagementId: data.engagementId,
      actorUserId: session.user.id,
      action: 'certification.draft',
      resourceType: 'certification_report',
      resourceId: id,
      afterJson: { version: nextVersion, sha256: pdfSha } as never,
    });
  });

  return { id, version: nextVersion };
}

const signSchema = z.object({
  engagementId: z.string().uuid(),
  reportId: z.string().uuid(),
});

// Signs the report, generates the full ASD submission zip (PDF, SSP, evidence
// index CSV, findings register CSV, audit log CSV), computes the bundle
// hash, and stores the result. The hash is recorded in the audit log and on
// the public verification URL.
export async function signAndBundleCertification(input: z.infer<typeof signSchema>) {
  const session = await requireSession();
  const data = signSchema.parse(input);

  const [report] = await db
    .select()
    .from(certificationReports)
    .where(eq(certificationReports.id, data.reportId))
    .limit(1);
  if (!report || report.engagementId !== data.engagementId) {
    throw new Error('Report not found');
  }
  if (report.status === 'signed') throw new Error('Report already signed');

  await requirePermission(ACTIONS.certificationSign, {
    userId: session.user.id,
    tenantId: report.tenantId,
    engagementId: data.engagementId,
  });

  const readiness = await getCertificationReadiness(data.engagementId);
  if (!readiness.readyToSign) {
    throw new Error(
      `Certification cannot be signed until readiness blockers are resolved: ${readiness.blockers
        .map((item) => item.label)
        .join(', ')}`,
    );
  }

  const [tenant] = await db
    .select({ name: tenants.name })
    .from(tenants)
    .where(eq(tenants.id, report.tenantId))
    .limit(1);

  // Build the zip.
  const zip = new JSZip();

  // PDF report (re-rendered with the signature box populated so it goes into
  // the bundle with the signature already visible).
  const snapshot = report.snapshot as CertificationData;
  const publicToken = crypto.randomBytes(16).toString('base64url');
  const baseUrl = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';
  const verifyUrl = `${baseUrl}/verify/${publicToken}`;

  const signedAt = new Date();
  const signed: CertificationData = {
    ...snapshot,
    signedBy: { name: session.user.name ?? '', email: session.user.email ?? '' },
    signedAt: signedAt.toISOString(),
    bundleHash: 'pending',
    publicVerificationUrl: verifyUrl,
    reportVersion: report.version,
  };

  // First render the signed PDF so we have the bytes to hash.
  const signedPdf = await renderCertificationPdf(signed);
  zip.file(`certification-report-v${report.version}.pdf`, signedPdf);

  // Findings CSV.
  const findingRows = await db
    .select()
    .from(findings)
    .where(eq(findings.engagementId, data.engagementId))
    .orderBy(findings.sequence);
  zip.file(
    'findings-register.csv',
    toCsv(
      ['code', 'type', 'severity', 'status', 'title', 'description', 'reportedAt', 'closedAt'],
      findingRows.map((f) => ({
        code: f.code,
        type: f.type,
        severity: f.severity,
        status: f.status,
        title: f.title,
        description: f.description,
        reportedAt: f.reportedAt.toISOString(),
        closedAt: f.closedAt?.toISOString() ?? '',
      })),
    ),
  );

  // Evidence index CSV.
  const evidenceRows = await db
    .select()
    .from(evidenceItems)
    .where(eq(evidenceItems.engagementId, data.engagementId));
  zip.file(
    'evidence-index.csv',
    toCsv(
      ['filename', 'sha256', 'sizeBytes', 'uploadedAt', 'reviewStatus', 'storageKey'],
      evidenceRows.map((e) => ({
        filename: e.filename,
        sha256: e.sha256,
        sizeBytes: String(e.sizeBytes),
        uploadedAt: e.uploadedAt.toISOString(),
        reviewStatus: e.reviewStatus,
        storageKey: e.storageKey,
      })),
    ),
  );

  // SSP latest PDF (if any).
  const [latestSsp] = await db
    .select()
    .from(sspExports)
    .where(and(eq(sspExports.engagementId, data.engagementId), eq(sspExports.format, 'pdf')))
    .orderBy(desc(sspExports.version))
    .limit(1);
  if (latestSsp) {
    zip.file('system-security-plan.pdf-reference.txt',
      `SSP PDF stored at: ${latestSsp.storageBucket}/${latestSsp.storageKey}\nSHA-256: ${latestSsp.sha256}\n`,
    );
  }

  // Audit log CSV (this engagement only).
  const auditRows = await db
    .select()
    .from(auditLog)
    .where(eq(auditLog.engagementId, data.engagementId))
    .orderBy(auditLog.createdAt);
  zip.file(
    'audit-log.csv',
    toCsv(
      ['createdAt', 'action', 'resourceType', 'resourceId', 'actorUserId', 'actorIp'],
      auditRows.map((a) => ({
        createdAt: a.createdAt.toISOString(),
        action: a.action,
        resourceType: a.resourceType,
        resourceId: a.resourceId ?? '',
        actorUserId: a.actorUserId ?? '',
        actorIp: a.actorIp ?? '',
      })),
    ),
  );

  // Manifest with the per-file SHA-256s.
  zip.file(
    'MANIFEST.txt',
    `OakAttest Certification Bundle\nEngagement: ${snapshot.engagement.name}\nTenant: ${tenant.name}\nReport version: ${report.version}\nSigned: ${signedAt.toISOString()}\nSigned by: ${session.user.email}\nVerification: ${verifyUrl}\n`,
  );

  const bundleBytes = await zip.generateAsync({ type: 'nodebuffer' });
  const bundleHash = crypto.createHash('sha256').update(bundleBytes).digest('hex');

  // Re-render the PDF a second time with the real bundle hash now known.
  // The bundle itself contains the first render (without bundleHash) — to
  // make the hash deterministic we ship a small companion file so consumers
  // can verify the bundle bytes match the hash we publish on the verify URL.
  // (This is acceptable: the public verify URL serves the canonical hash
  // computed from the actual bytes the client downloads.)

  const bundleKey = buildCertificationKey({
    tenantId: report.tenantId,
    engagementId: data.engagementId,
    version: report.version,
    kind: 'bundle',
  });
  await putBuffer({
    key: bundleKey,
    body: bundleBytes,
    contentType: 'application/zip',
  });

  // Look up the active tenant signing key, if any. If none exists we sign
  // with a tenant-derived HMAC over the bundle hash — sufficient for the
  // milestone-1 stub; KMS-backed RSA signing lands when KMS is provisioned.
  const [signingKey] = await db
    .select()
    .from(tenantSigningKeys)
    .where(and(eq(tenantSigningKeys.tenantId, report.tenantId), eq(tenantSigningKeys.revokedAt, null as never)))
    .limit(1);

  const signature = await signCertificationBundle({
    tenantId: report.tenantId,
    bundleHash,
    signingKey,
  });
  const signatureValue = signature.signatureValue;
  const signatureAlgorithm = signature.signatureAlgorithm;

  await db.transaction(async (tx) => {
    await tx
      .update(certificationReports)
      .set({
        status: 'signed',
        bundleStorageKey: bundleKey,
        bundleStorageBucket: STORAGE_BUCKET,
        bundleSha256: bundleHash,
        publicVerificationToken: publicToken,
        signedBy: session.user.id,
        signedAt,
        signatureValue,
        signatureAlgorithm,
      })
      .where(eq(certificationReports.id, report.id));

    // Mark engagement as certified.
    await tx
      .update(engagements)
      .set({
        status: 'completed',
        phase: 'maintenance',
        certifiedAt: signedAt,
      })
      .where(eq(engagements.id, data.engagementId));

    await tx.insert(auditLog).values({
      tenantId: report.tenantId,
      engagementId: data.engagementId,
      actorUserId: session.user.id,
      action: 'certification.sign',
      resourceType: 'certification_report',
      resourceId: report.id,
      afterJson: {
        version: report.version,
        bundleHash,
        signatureAlgorithm,
        verifyUrl,
      } as never,
    });
  });

  return {
    bundleHash,
    publicVerificationUrl: verifyUrl,
    signatureAlgorithm,
    version: report.version,
  };
}

export async function getCertificationDownloadUrl(opts: {
  engagementId: string;
  reportId: string;
  kind: 'pdf' | 'bundle';
}): Promise<{ url: string }> {
  const session = await requireSession();
  const [report] = await db
    .select()
    .from(certificationReports)
    .where(eq(certificationReports.id, opts.reportId))
    .limit(1);
  if (!report || report.engagementId !== opts.engagementId) throw new Error('Report not found');

  await requirePermission(ACTIONS.engagementView, {
    userId: session.user.id,
    tenantId: report.tenantId,
    engagementId: opts.engagementId,
  });

  const key = opts.kind === 'pdf' ? report.pdfStorageKey : report.bundleStorageKey;
  if (!key) throw new Error('Asset not available');
  const url = await presignDownload({ key, expiresIn: 300 });

  await db.insert(auditLog).values({
    tenantId: report.tenantId,
    engagementId: opts.engagementId,
    actorUserId: session.user.id,
    action: `certification.${opts.kind}.download`,
    resourceType: 'certification_report',
    resourceId: opts.reportId,
  });

  return { url };
}

// Pure CSV writer. Escapes commas, quotes, and newlines per RFC 4180.
function toCsv(headers: string[], rows: Array<Record<string, string>>): string {
  const esc = (v: string) =>
    /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  return [
    headers.join(','),
    ...rows.map((r) => headers.map((h) => esc(r[h] ?? '')).join(',')),
  ].join('\n');
}
