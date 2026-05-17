import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import {
  essentialEightAssessments,
  essentialEightHistory,
} from '@/db/schema/essential-eight';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EssentialEightGrid } from '@/components/engagement/EssentialEightGrid';
import { EssentialEightChart } from '@/components/engagement/EssentialEightChart';

export const metadata = { title: 'Essential Eight · OakAttest' };

const STRATEGIES = [
  { key: 'application_control', label: 'Application control' },
  { key: 'patch_applications', label: 'Patch applications' },
  { key: 'configure_macro_settings', label: 'Configure macro settings' },
  { key: 'user_application_hardening', label: 'User application hardening' },
  { key: 'restrict_admin_privileges', label: 'Restrict admin privileges' },
  { key: 'patch_operating_systems', label: 'Patch operating systems' },
  { key: 'multi_factor_authentication', label: 'Multi-factor authentication' },
  { key: 'regular_backups', label: 'Regular backups' },
] as const;

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

  const byStrategy = Object.fromEntries(rows.map((r) => [r.strategy, r]));

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
            strategies={STRATEGIES.map((s) => ({
              ...s,
              current: byStrategy[s.key]?.currentMaturity ?? 'ml0',
              target: byStrategy[s.key]?.targetMaturity ?? 'ml1',
              remediationPlan: byStrategy[s.key]?.remediationPlan ?? '',
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
            <p className="text-sm text-slate-500">No history recorded.</p>
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
