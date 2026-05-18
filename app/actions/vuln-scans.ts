'use server';

import { z } from 'zod';
import { and, eq, max } from 'drizzle-orm';
import crypto from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db/client';
import { engagements } from '@/db/schema/engagements';
import { findings, findingControls } from '@/db/schema/findings';
import { engagementControls } from '@/db/schema/ism';
import { auditLog } from '@/db/schema/audit';
import { requireSession } from '@/lib/auth/session';
import { requirePermission } from '@/lib/rbac/require';
import { ACTIONS } from '@/lib/rbac/matrix';
import { parseScan } from '@/lib/scans/parse';

async function tenantForEngagement(engagementId: string): Promise<string> {
  const [row] = await db
    .select({ tenantId: engagements.tenantId })
    .from(engagements)
    .where(eq(engagements.id, engagementId))
    .limit(1);
  if (!row) throw new Error('Engagement not found');
  return row.tenantId;
}

const importSchema = z.object({
  engagementId: z.string().uuid(),
  filename: z.string().min(1).max(255),
  content: z.string().min(1).max(50_000_000),
});

// Vendor scan import (§9.8). Parses Nessus, Rapid7, Qualys, or generic CSV
// and drafts one observation per Critical or High finding, linked to any
// controls whose id matches a patching/vulnerability heuristic.
export async function importVulnScan(input: z.infer<typeof importSchema>) {
  const session = await requireSession();
  const data = importSchema.parse(input);
  const tenantId = await tenantForEngagement(data.engagementId);

  // Fieldwork lives on the assessor side; the import action is assessor-only.
  await requirePermission(ACTIONS.findingCreate, {
    userId: session.user.id,
    tenantId,
    engagementId: data.engagementId,
  });

  const results = parseScan(data.filename, data.content);
  const critical = results.filter((r) => r.severity === 'critical');
  const high = results.filter((r) => r.severity === 'high');

  const patching = await db
    .select({
      id: engagementControls.ismControlId,
      controlId: engagementControls.controlId,
    })
    .from(engagementControls)
    .where(
      and(
        eq(engagementControls.tenantId, tenantId),
        eq(engagementControls.engagementId, data.engagementId),
      ),
    );
  const patchingIds = patching
    .filter((c) => /patch|vulnerab/i.test(c.controlId))
    .map((c) => c.id);

  let drafted = 0;
  await db.transaction(async (tx) => {
    for (const finding of [...critical, ...high]) {
      const [{ maxV }] = await tx
        .select({ maxV: max(findings.sequence) })
        .from(findings)
        .where(and(eq(findings.tenantId, tenantId), eq(findings.engagementId, data.engagementId)));
      const sequence = (maxV ?? 0) + 1 + drafted;
      const code = `FND-${String(sequence).padStart(3, '0')}`;
      const findingId = crypto.randomUUID();
      await tx.insert(findings).values({
        id: findingId,
        engagementId: data.engagementId,
        tenantId,
        sequence,
        code,
        type: 'observation',
        severity: finding.severity === 'critical' ? 'critical' : 'high',
        title: `Vuln scan: ${finding.title}${finding.host ? ` on ${finding.host}` : ''}`,
        description: `${finding.description ?? finding.title}\n\nPlugin ID: ${finding.pluginId}\nCVSS: ${finding.cvssScore ?? 'unknown'}\nSource: ${finding.source}`,
        recommendation: finding.solution ?? null,
        reportedBy: session.user.id,
      });
      if (patchingIds.length > 0) {
        await tx.insert(findingControls).values(
          patchingIds.map((cid) => ({ findingId, ismControlId: cid })),
        );
      }
      drafted += 1;
    }
    await tx.insert(auditLog).values({
      tenantId,
      engagementId: data.engagementId,
      actorUserId: session.user.id,
      action: 'vuln_scan.import',
      resourceType: 'fieldwork',
      afterJson: {
        filename: data.filename,
        total: results.length,
        critical: critical.length,
        high: high.length,
        drafted,
      } as never,
    });
  });

  revalidatePath(`/engagements/${data.engagementId}/fieldwork`);
  revalidatePath(`/engagements/${data.engagementId}/findings`);
  return {
    total: results.length,
    critical: critical.length,
    high: high.length,
    drafted,
  };
}
