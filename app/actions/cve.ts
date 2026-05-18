'use server';

import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import crypto from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db/client';
import { cveScans, cveScanFindings } from '@/db/schema/cve';
import { engagements } from '@/db/schema/engagements';
import { findings, findingControls } from '@/db/schema/findings';
import { engagementControls } from '@/db/schema/ism';
import { auditLog } from '@/db/schema/audit';
import { requireSession } from '@/lib/auth/session';
import { requirePermission } from '@/lib/rbac/require';
import { ACTIONS } from '@/lib/rbac/matrix';
import { parseManifest, type PackagePin } from '@/lib/cve/manifest';
import { scanPins } from '@/lib/cve/osv';

async function tenantForEngagement(engagementId: string): Promise<string> {
  const [row] = await db
    .select({ tenantId: engagements.tenantId })
    .from(engagements)
    .where(eq(engagements.id, engagementId))
    .limit(1);
  if (!row) throw new Error('Engagement not found');
  return row.tenantId;
}

const submitSchema = z.object({
  engagementId: z.string().uuid(),
  filename: z.string().min(1).max(255),
  content: z.string().min(1).max(20_000_000),
  source: z.enum(['manifest', 'sbom', 'github']).default('manifest'),
});

// Submit a manifest or SBOM, kick off an OSV.dev scan, persist findings, and
// auto-draft observations on the patching/vulnerability-management
// controls. The scan runs inline (a few API calls; the OSV batch endpoint
// is fast enough that we do not need a separate worker).
export async function submitCveScan(input: z.infer<typeof submitSchema>) {
  const session = await requireSession();
  const data = submitSchema.parse(input);
  const tenantId = await tenantForEngagement(data.engagementId);

  await requirePermission(ACTIONS.evidenceUpload, {
    userId: session.user.id,
    tenantId,
    engagementId: data.engagementId,
  });

  const sourceHash = crypto.createHash('sha256').update(data.content).digest('hex');
  const scanId = crypto.randomUUID();

  await db.insert(cveScans).values({
    id: scanId,
    engagementId: data.engagementId,
    tenantId,
    source: data.source,
    sourceFilename: data.filename,
    sourceArtifactHash: sourceHash,
    status: 'running',
    requestedBy: session.user.id,
  });
  await db.insert(auditLog).values({
    tenantId,
    engagementId: data.engagementId,
    actorUserId: session.user.id,
    action: 'cve_scan.start',
    resourceType: 'cve_scan',
    resourceId: scanId,
    afterJson: { filename: data.filename, source: data.source } as never,
  });

  let pins: PackagePin[];
  try {
    pins = parseManifest(data.filename, data.content);
  } catch (err) {
    await markFailed({ scanId, tenantId, engagementId: data.engagementId, reason: (err as Error).message });
    throw err;
  }

  if (pins.length === 0) {
    await markFailed({
      scanId,
      tenantId,
      engagementId: data.engagementId,
      reason: 'No package pins parsed from input',
    });
    throw new Error('No packages found in manifest');
  }

  let scanFindings;
  try {
    scanFindings = await scanPins(pins);
  } catch (err) {
    await markFailed({ scanId, tenantId, engagementId: data.engagementId, reason: (err as Error).message });
    throw err;
  }

  let critical = 0;
  let high = 0;
  let medium = 0;
  let low = 0;
  for (const f of scanFindings) {
    if (f.advisory.severity === 'critical') critical += 1;
    else if (f.advisory.severity === 'high') high += 1;
    else if (f.advisory.severity === 'medium') medium += 1;
    else if (f.advisory.severity === 'low') low += 1;
  }

  // Find ISM controls related to patching/vulnerability management for the
  // auto-drafted observation links.
  const patchingControls = await db
    .select({ id: engagementControls.id, ismControlId: engagementControls.ismControlId, controlId: engagementControls.controlId })
    .from(engagementControls)
    .where(
      and(
        eq(engagementControls.tenantId, tenantId),
        eq(engagementControls.engagementId, data.engagementId),
      ),
    );
  const patchingControlIds = patchingControls
    .filter((c) => /patch|vulnerab/i.test(c.controlId))
    .map((c) => c.ismControlId);

  const signedHash = crypto
    .createHash('sha256')
    .update(JSON.stringify({ pins, findings: scanFindings, completedAt: new Date().toISOString() }))
    .digest('hex');

  await db.transaction(async (tx) => {
    if (scanFindings.length > 0) {
      // Insert in chunks to keep the parameter count safe.
      const rows = scanFindings.map((f) => ({
        scanId,
        packageEcosystem: f.pin.ecosystem,
        packageName: f.pin.name,
        version: f.pin.version,
        advisoryId: f.advisory.id,
        severity: f.advisory.severity,
        cvssScore: f.advisory.cvss != null ? f.advisory.cvss.toFixed(1) : null,
        summary: f.advisory.summary,
        fixedVersions: f.advisory.fixedVersions as never,
        references: f.advisory.references as never,
      }));
      for (let i = 0; i < rows.length; i += 500) {
        await tx.insert(cveScanFindings).values(rows.slice(i, i + 500));
      }
    }

    await tx
      .update(cveScans)
      .set({
        status: 'completed',
        completedAt: new Date(),
        findingCount: scanFindings.length,
        criticalCount: critical,
        highCount: high,
        mediumCount: medium,
        lowCount: low,
        signedHash,
        signedAt: new Date(),
      })
      .where(
        and(
          eq(cveScans.id, scanId),
          eq(cveScans.tenantId, tenantId),
          eq(cveScans.engagementId, data.engagementId),
        ),
      );

    // Auto-draft an observation per scan if there are any high/critical
    // findings. Promotion to non-conformance is a separate assessor action.
    if ((critical > 0 || high > 0) && patchingControlIds.length > 0) {
      const findingId = crypto.randomUUID();
      const seq = await tx
        .select()
        .from(findings)
        .where(and(eq(findings.tenantId, tenantId), eq(findings.engagementId, data.engagementId)));
      const sequence = seq.length + 1;
      const code = `FND-${String(sequence).padStart(3, '0')}`;
      await tx.insert(findings).values({
        id: findingId,
        engagementId: data.engagementId,
        tenantId,
        sequence,
        code,
        type: 'observation',
        severity: critical > 0 ? 'critical' : 'high',
        title: `Open CVEs in declared dependencies — scan ${scanId.slice(0, 8)}`,
        description: `An OSV.dev scan against the declared dependency manifest produced ${critical} critical and ${high} high-severity advisories. See the CVE scan detail for the full list.`,
        recommendation: 'Upgrade affected packages to the fixed versions listed in the scan report.',
        reportedBy: session.user.id,
      });
      await tx.insert(findingControls).values(
        patchingControlIds.map((cid) => ({ findingId, ismControlId: cid })),
      );
    }

    await tx.insert(auditLog).values({
      tenantId,
      engagementId: data.engagementId,
      actorUserId: session.user.id,
      action: 'cve_scan.complete',
      resourceType: 'cve_scan',
      resourceId: scanId,
      afterJson: {
        critical,
        high,
        medium,
        low,
        findingCount: scanFindings.length,
        signedHash,
      } as never,
    });
  });

  revalidatePath(`/engagements/${data.engagementId}/evidence/cve`);
  revalidatePath(`/engagements/${data.engagementId}/findings`);
  return { scanId, critical, high, medium, low, total: scanFindings.length, signedHash };
}

async function markFailed(input: {
  scanId: string;
  tenantId: string;
  engagementId: string;
  reason: string;
}) {
  await db
    .update(cveScans)
    .set({ status: 'failed', failureReason: input.reason, completedAt: new Date() })
    .where(
      and(
        eq(cveScans.id, input.scanId),
        eq(cveScans.tenantId, input.tenantId),
        eq(cveScans.engagementId, input.engagementId),
      ),
    );
  await db.insert(auditLog).values({
    tenantId: input.tenantId,
    engagementId: input.engagementId,
    actorType: 'system',
    action: 'cve_scan.failed',
    resourceType: 'cve_scan',
    resourceId: input.scanId,
    afterJson: { reason: input.reason } as never,
  });
}
