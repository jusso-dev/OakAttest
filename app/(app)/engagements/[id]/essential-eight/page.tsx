import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import {
  essentialEightAssessments,
  essentialEightHistory,
  essentialEightProfiles,
  essentialEightReports,
} from '@/db/schema/essential-eight';
import { engagementControls, ismControls } from '@/db/schema/ism';
import { evidenceItemControls, evidenceItems } from '@/db/schema/evidence';
import { findingControls, findings } from '@/db/schema/findings';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EssentialEightGrid } from '@/components/engagement/EssentialEightGrid';
import { EssentialEightChart } from '@/components/engagement/EssentialEightChart';
import { calculateEssentialEightOverall, ESSENTIAL_EIGHT_STRATEGIES } from '@/lib/essential-eight';
import { groupEssentialEightMappedControls } from '@/lib/essential-eight-mapping';

export const metadata = { title: 'Essential Eight · OakAttest' };

export default async function EssentialEightPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const rows = await db
    .select()
    .from(essentialEightAssessments)
    .where(eq(essentialEightAssessments.engagementId, id));

  const history = await db
    .select()
    .from(essentialEightHistory)
    .where(eq(essentialEightHistory.engagementId, id))
    .orderBy(essentialEightHistory.recordedAt);

  const [profile] = await db
    .select()
    .from(essentialEightProfiles)
    .where(eq(essentialEightProfiles.engagementId, id))
    .limit(1);

  const reports = await db
    .select()
    .from(essentialEightReports)
    .where(eq(essentialEightReports.engagementId, id))
    .orderBy(desc(essentialEightReports.version));

  const evidenceOptions = await db
    .select({
      id: evidenceItems.id,
      filename: evidenceItems.filename,
      reviewStatus: evidenceItems.reviewStatus,
      sha256: evidenceItems.sha256,
    })
    .from(evidenceItems)
    .where(eq(evidenceItems.engagementId, id));

  const mappedControls = await db
    .select({
      ismControlId: ismControls.id,
      controlId: engagementControls.controlId,
      description: ismControls.description,
      status: engagementControls.status,
      applicable: engagementControls.applicable,
      mapping: ismControls.essentialEightMapping,
    })
    .from(engagementControls)
    .innerJoin(ismControls, eq(ismControls.id, engagementControls.ismControlId))
    .where(eq(engagementControls.engagementId, id));

  const mappedEvidence = await db
    .select({
      ismControlId: evidenceItemControls.ismControlId,
      id: evidenceItems.id,
      filename: evidenceItems.filename,
      reviewStatus: evidenceItems.reviewStatus,
      sha256: evidenceItems.sha256,
    })
    .from(evidenceItemControls)
    .innerJoin(evidenceItems, eq(evidenceItems.id, evidenceItemControls.evidenceItemId))
    .where(eq(evidenceItems.engagementId, id));

  const mappedFindings = await db
    .select({
      ismControlId: findingControls.ismControlId,
      code: findings.code,
      title: findings.title,
      type: findings.type,
      severity: findings.severity,
      status: findings.status,
    })
    .from(findingControls)
    .innerJoin(findings, eq(findings.id, findingControls.findingId))
    .where(eq(findings.engagementId, id));

  const byStrategy = Object.fromEntries(rows.map((r) => [r.strategy, r]));
  const targetMaturity = profile?.targetMaturity ?? 'ml1';
  const overall = calculateEssentialEightOverall(rows, targetMaturity);
  const mappedByStrategy = groupEssentialEightMappedControls({
    controls: mappedControls,
    evidence: mappedEvidence,
    findings: mappedFindings,
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Essential Eight</CardTitle>
          <CardDescription>
            Current vs target maturity for each of the eight strategies.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EssentialEightGrid
            engagementId={id}
            profile={{
              targetMaturity,
              scope: profile?.scope ?? '',
              approach: profile?.approach ?? '',
              limitations: profile?.limitations ?? '',
            }}
            overall={overall}
            reports={reports.map((report) => ({
              id: report.id,
              version: report.version,
              sha256: report.sha256,
              generatedAt: report.generatedAt.toISOString(),
            }))}
            evidenceOptions={evidenceOptions}
            strategies={ESSENTIAL_EIGHT_STRATEGIES.map((s) => ({
              ...s,
              current: byStrategy[s.key]?.currentMaturity ?? 'ml0',
              target: byStrategy[s.key]?.targetMaturity ?? targetMaturity,
              evidenceRefs: byStrategy[s.key]?.evidenceRefs ?? [],
              remediationPlan: byStrategy[s.key]?.remediationPlan ?? '',
              assessmentMethods: byStrategy[s.key]?.assessmentMethods ?? '',
              assessmentObjects: byStrategy[s.key]?.assessmentObjects ?? '',
              sampleSize: byStrategy[s.key]?.sampleSize ?? '',
              evidenceQuality: byStrategy[s.key]?.evidenceQuality ?? '',
              evidenceLimitations: byStrategy[s.key]?.evidenceLimitations ?? '',
              assessorConclusion: byStrategy[s.key]?.assessorConclusion ?? '',
              criteriaResults: byStrategy[s.key]?.criteriaResults ?? [],
              exceptions: byStrategy[s.key]?.exceptions ?? [],
              mappedControls: mappedByStrategy.get(s.key) ?? [],
            }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Maturity history</CardTitle>
          <CardDescription>Recorded over time.</CardDescription>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-slate-600">No history recorded.</p>
          ) : (
            <EssentialEightChart
              data={history.map((h) => ({
                strategy: h.strategy,
                maturity: Number(h.maturity.replace('ml', '')),
                recordedAt: h.recordedAt.toISOString(),
              }))}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
