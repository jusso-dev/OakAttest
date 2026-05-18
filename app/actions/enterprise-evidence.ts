'use server';

import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { auditLog } from '@/db/schema/audit';
import { engagements } from '@/db/schema/engagements';
import { engagementControls, ismControls } from '@/db/schema/ism';
import { parseEnterpriseEvidenceCsv } from '@/lib/evidence/enterprise-csv';
import { requireSession } from '@/lib/auth/session';
import { requirePermission } from '@/lib/rbac/require';
import { ACTIONS } from '@/lib/rbac/matrix';

const analyseSchema = z.object({
  engagementId: z.string().uuid(),
  filename: z.string().min(1).max(255),
  content: z.string().min(1).max(2_000_000),
});

export type EnterpriseEvidenceControlSuggestion = {
  id: string;
  controlId: string;
  description: string;
  topic?: string | null;
  section?: string | null;
  matchedTerms: string[];
  score: number;
};

export async function analyseEnterpriseEvidenceCsv(input: z.infer<typeof analyseSchema>) {
  const session = await requireSession();
  const data = analyseSchema.parse(input);

  const [engagement] = await db
    .select({ tenantId: engagements.tenantId })
    .from(engagements)
    .where(eq(engagements.id, data.engagementId))
    .limit(1);
  if (!engagement) throw new Error('Engagement not found');

  await requirePermission(ACTIONS.evidenceRequest, {
    userId: session.user.id,
    tenantId: engagement.tenantId,
    engagementId: data.engagementId,
  });

  const summary = parseEnterpriseEvidenceCsv(data.filename, data.content);
  const controls = await db
    .select({
      id: engagementControls.ismControlId,
      controlId: engagementControls.controlId,
      description: ismControls.description,
      topic: ismControls.topic,
      section: ismControls.section,
      essentialEightMapping: ismControls.essentialEightMapping,
    })
    .from(engagementControls)
    .innerJoin(ismControls, eq(ismControls.id, engagementControls.ismControlId))
    .where(eq(engagementControls.engagementId, data.engagementId));

  const terms = Array.from(
    new Set([...summary.suggestedControlKeywords, ...summary.mappedStrategies].map((term) => term.toLowerCase())),
  );

  const suggestedControls = controls
    .map((control) => {
      const searchable = [
        control.controlId,
        control.description,
        control.topic ?? '',
        control.section ?? '',
      ].join(' ').toLowerCase();
      const e8Strategies = control.essentialEightMapping?.map((m) => m.strategy.toLowerCase()) ?? [];
      const matchedTerms = terms.filter(
        (term) => searchable.includes(term) || e8Strategies.includes(term),
      );
      const score =
        matchedTerms.length +
        summary.mappedStrategies.filter((strategy) => e8Strategies.includes(strategy.toLowerCase())).length * 3;

      return {
        id: control.id,
        controlId: control.controlId,
        description: control.description,
        topic: control.topic,
        section: control.section,
        matchedTerms,
        score,
      };
    })
    .filter((control) => control.score > 0)
    .sort((a, b) => b.score - a.score || a.controlId.localeCompare(b.controlId))
    .slice(0, 30) satisfies EnterpriseEvidenceControlSuggestion[];

  await db.insert(auditLog).values({
    tenantId: engagement.tenantId,
    engagementId: data.engagementId,
    actorUserId: session.user.id,
    action: 'enterprise_evidence.analyse',
    resourceType: 'enterprise_evidence_csv',
    resourceId: data.filename,
    afterJson: {
      filename: data.filename,
      source: summary.source,
      rowCount: summary.rowCount,
      suggestedControlCount: suggestedControls.length,
    } as never,
  });

  return { summary, suggestedControls };
}
