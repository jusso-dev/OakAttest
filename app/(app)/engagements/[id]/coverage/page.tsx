import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getEngagementCoverage } from '@/lib/assessment/coverage';

export const metadata = { title: 'Assessment coverage · OakAttest' };

export default async function CoveragePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const coverage = await getEngagementCoverage(id);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Assessment coverage</CardTitle>
          <CardDescription>
            Live blockers across controls, evidence, findings, SSP, Essential Eight, and certification.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <Metric label="Controls in scope" value={coverage.controlCount} />
          <Metric label="Hard blockers" value={coverage.hardFailureCount} intent="danger" />
          <Metric label="Warnings" value={coverage.warningCount} intent="warning" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Blockers</CardTitle>
          <CardDescription>Each item links to the workflow that needs attention.</CardDescription>
        </CardHeader>
        <CardContent>
          {coverage.blockers.length === 0 ? (
            <p className="text-sm text-[var(--oak-shield)]">No coverage blockers detected.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {coverage.blockers.map((blocker) => (
                <Link
                  key={blocker.key}
                  href={blocker.href}
                  className="flex items-center justify-between py-3 text-sm hover:bg-[var(--oak-mist)]"
                >
                  <span className="font-medium text-slate-900">{blocker.label}</span>
                  <span className={blocker.severity === 'danger' ? 'text-red-700' : 'text-amber-700'}>
                    {blocker.count}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({
  label,
  value,
  intent = 'default',
}: {
  label: string;
  value: number;
  intent?: 'default' | 'warning' | 'danger';
}) {
  const tone =
    intent === 'danger'
      ? 'text-red-700'
      : intent === 'warning'
        ? 'text-amber-700'
        : 'text-slate-950';
  return (
    <div className="rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-3">
      <p className="text-xs uppercase text-slate-600">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${tone}`}>{value}</p>
    </div>
  );
}
