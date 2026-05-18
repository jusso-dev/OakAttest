import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  filterCoverageBlockersForRoles,
  getEngagementCoverage,
  type CoverageBlocker,
} from '@/lib/assessment/coverage';
import { requirePageSession } from '@/lib/auth/session';
import { rolesForUser } from '@/lib/rbac/require';
import { db } from '@/lib/db/client';
import { engagements } from '@/db/schema/engagements';

export const metadata = { title: 'Assessment coverage · OakAttest' };

export default async function CoveragePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const session = await requirePageSession();
  const [engagement] = await db
    .select({ tenantId: engagements.tenantId })
    .from(engagements)
    .where(eq(engagements.id, id))
    .limit(1);
  if (!engagement) throw new Error('Engagement not found');
  const roles = await rolesForUser({
    userId: session.user.id,
    tenantId: engagement.tenantId,
    engagementId: id,
  });
  const coverage = await getEngagementCoverage(id);
  const roleVisibleBlockers = filterCoverageBlockersForRoles(coverage.blockers, roles);
  const category = readParam(query.category);
  const severity = readParam(query.severity);
  const visibleBlockers = roleVisibleBlockers.filter((blocker) => {
    if (category && blocker.category !== category) return false;
    if (severity && blocker.severity !== severity) return false;
    return true;
  });
  const categories = Array.from(new Set(roleVisibleBlockers.map((blocker) => blocker.category))).sort();

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
          <Metric
            label="Visible hard blockers"
            value={roleVisibleBlockers.filter((item) => item.severity === 'danger').length}
            intent="danger"
          />
          <Metric
            label="Visible warnings"
            value={roleVisibleBlockers.filter((item) => item.severity === 'warning').length}
            intent="warning"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Blockers</CardTitle>
          <CardDescription>Each item links to the workflow that needs attention.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="grid gap-3 sm:grid-cols-[220px_180px_auto]">
            <select
              name="category"
              defaultValue={category}
              className="flex h-9 rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm"
            >
              <option value="">All areas</option>
              {categories.map((option) => (
                <option key={option} value={option}>
                  {formatCategory(option)}
                </option>
              ))}
            </select>
            <select
              name="severity"
              defaultValue={severity}
              className="flex h-9 rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm"
            >
              <option value="">All severities</option>
              <option value="danger">Hard blockers</option>
              <option value="warning">Warnings</option>
            </select>
            <div className="flex gap-2">
              <button
                type="submit"
                className="inline-flex h-9 items-center justify-center rounded-md bg-[var(--oak-shield)] px-4 text-sm font-medium text-white hover:bg-[var(--oak-shield-hover)]"
              >
                Filter
              </button>
              <Link
                href={`/engagements/${id}/coverage`}
                className="inline-flex h-9 items-center justify-center rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm font-medium text-slate-950 hover:bg-[var(--oak-mist)]"
              >
                Reset
              </Link>
            </div>
          </form>

          {roleVisibleBlockers.length === 0 ? (
            <p className="text-sm text-[var(--oak-shield)]">No coverage blockers detected.</p>
          ) : visibleBlockers.length === 0 ? (
            <p className="text-sm text-slate-600">No blockers match the current filters.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {visibleBlockers.map((blocker) => (
                <Link
                  key={blocker.key}
                  href={blocker.href}
                  className="grid gap-2 py-3 text-sm hover:bg-[var(--oak-mist)] sm:grid-cols-[1fr_150px_80px]"
                >
                  <span className="font-medium text-slate-900">{blocker.label}</span>
                  <span className="text-slate-600">{formatCategory(blocker.category)}</span>
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

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

function formatCategory(category: CoverageBlocker['category']) {
  return category.replace(/_/g, ' ');
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
