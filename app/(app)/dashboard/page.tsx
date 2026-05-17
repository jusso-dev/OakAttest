import Link from 'next/link';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { engagements } from '@/db/schema/engagements';
import { getSession } from '@/lib/auth/session';
import { resolveActiveTenant } from '@/lib/auth/active-tenant';
import { engagementMembers } from '@/db/schema/tenants';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata = { title: 'Dashboard · OakAttest' };

export default async function DashboardPage() {
  const session = (await getSession())!;
  const tenant = (await resolveActiveTenant(session.user.id))!;

  const rows =
    tenant.access === 'tenant'
      ? await db
          .select({
            id: engagements.id,
            name: engagements.name,
            classification: engagements.classification,
            phase: engagements.phase,
            status: engagements.status,
            reference: engagements.reference,
          })
          .from(engagements)
          .where(
            and(eq(engagements.tenantId, tenant.tenantId), isNull(engagements.deletedAt)),
          )
          .orderBy(engagements.createdAt)
      : await db
          .select({
            id: engagements.id,
            name: engagements.name,
            classification: engagements.classification,
            phase: engagements.phase,
            status: engagements.status,
            reference: engagements.reference,
          })
          .from(engagementMembers)
          .innerJoin(engagements, eq(engagements.id, engagementMembers.engagementId))
          .where(
            and(
              eq(engagementMembers.tenantId, tenant.tenantId),
              eq(engagementMembers.userId, session.user.id),
              isNull(engagementMembers.deletedAt),
              isNull(engagements.deletedAt),
            ),
          )
          .orderBy(engagements.createdAt);

  const total = rows.length;
  const active = rows.filter((row) => row.status === 'active').length;
  const draft = rows.filter((row) => row.status === 'draft').length;
  const onHold = rows.filter((row) => row.status === 'on_hold').length;
  const completed = rows.filter((row) => row.status === 'completed' || row.status === 'archived').length;
  const phases = [
    'scoping',
    'evidence',
    'fieldwork',
    'findings',
    'certification',
    'maintenance',
  ] as const;
  const phaseCounts = phases.map((phase) => ({
    phase,
    count: rows.filter((row) => row.phase === phase).length,
  }));
  const classificationCounts = Array.from(
    rows.reduce((map, row) => {
      map.set(row.classification, (map.get(row.classification) ?? 0) + 1);
      return map;
    }, new Map<string, number>()),
  ).sort((a, b) => b[1] - a[1]);
  const recentRows = rows.slice(-5).reverse();

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase text-slate-600">{tenant.tenantName}</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Engagements</h1>
        </div>
        {tenant.access === 'tenant' && (
          <Link
            href="/engagements/new"
            className="inline-flex h-9 items-center justify-center rounded-md bg-[var(--oak-shield)] px-4 text-sm font-medium text-white transition-colors hover:bg-[var(--oak-shield-hover)]"
          >
            New engagement
          </Link>
        )}
      </header>

      {rows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No engagements yet</CardTitle>
            <CardDescription>
              {tenant.access === 'tenant'
                ? 'An engagement scopes one client system at a single classification. Create your first one to begin the five-phase IRAP lifecycle.'
                : 'You do not have access to any engagements yet. Ask the assessor team for an engagement invitation.'}
            </CardDescription>
          </CardHeader>
          {tenant.access === 'tenant' && (
            <CardContent>
              <Link
                href="/engagements/new"
                className="inline-flex h-9 items-center justify-center rounded-md bg-[var(--oak-shield)] px-4 text-sm font-medium text-white transition-colors hover:bg-[var(--oak-shield-hover)]"
              >
                Start an engagement
              </Link>
            </CardContent>
          )}
        </Card>
      ) : (
        <div className="space-y-6">
          <section className="grid gap-3 md:grid-cols-4">
            <Metric label="Total engagements" value={total} />
            <Metric label="Active" value={active} />
            <Metric label="Draft" value={draft} />
            <Metric label="On hold" value={onHold} />
          </section>

          <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
            <Card>
              <CardHeader>
                <CardTitle>Engagement workload</CardTitle>
                <CardDescription>
                  Current stage distribution across the engagements you can access.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {phaseCounts.map(({ phase, count }) => (
                  <div key={phase} className="grid grid-cols-[120px_1fr_44px] items-center gap-3 text-sm">
                    <span className="capitalize text-slate-700">{phase.replace('_', ' ')}</span>
                    <div className="h-2 overflow-hidden rounded-full bg-[var(--oak-mist-strong)]">
                      <div
                        className="h-full rounded-full bg-[var(--oak-shield)]"
                        style={{ width: `${total > 0 ? Math.max((count / total) * 100, count > 0 ? 6 : 0) : 0}%` }}
                      />
                    </div>
                    <span className="text-right font-medium text-slate-950">{count}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Portfolio snapshot</CardTitle>
                <CardDescription>
                  Status and classification mix for this workspace.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <StatusCell label="Completed or archived" value={completed} />
                  <StatusCell label="Needs attention" value={onHold + draft} />
                </div>
                <div>
                  <p className="text-xs font-medium uppercase text-slate-600">Classifications</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {classificationCounts.map(([classification, count]) => (
                      <span
                        key={classification}
                        className="rounded-full bg-[var(--oak-mist-strong)] px-2 py-1 text-xs font-medium text-slate-800"
                      >
                        {classification.replace('_', ':')} · {count}
                      </span>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
            <Card>
              <CardHeader>
                <CardTitle>Next attention</CardTitle>
                <CardDescription>Draft and paused engagements to move forward.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {rows
                  .filter((row) => row.status === 'draft' || row.status === 'on_hold')
                  .slice(0, 5)
                  .map((row) => (
                    <EngagementLink key={row.id} row={row} />
                  ))}
                {draft + onHold === 0 && (
                  <p className="text-sm text-slate-600">No draft or paused engagements.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent engagements</CardTitle>
                <CardDescription>Open a workspace and continue the assessment.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {recentRows.map((row) => (
                  <EngagementLink key={row.id} row={row} />
                ))}
              </CardContent>
            </Card>
          </section>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-4 shadow-sm">
      <p className="text-xs font-medium uppercase text-slate-600">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function StatusCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-[var(--field-border)] bg-[var(--oak-mist)] p-3">
      <p className="text-xl font-semibold text-slate-950">{value}</p>
      <p className="mt-1 text-xs text-slate-600">{label}</p>
    </div>
  );
}

function EngagementLink({
  row,
}: {
  row: {
    id: string;
    name: string;
    classification: string;
    phase: string;
    status: string;
    reference: string | null;
  };
}) {
  return (
    <Link
      href={`/engagements/${row.id}/overview`}
      className="block rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-3 transition-colors hover:border-slate-300 hover:bg-[var(--oak-mist)]"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-900">{row.name}</p>
          <p className="text-xs text-slate-600">
            {row.reference ? `${row.reference} · ` : ''}
            {row.classification.replace('_', ':')} · {row.phase.replace('_', ' ')}
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--oak-mist-strong)]">
            <div
              className="h-full rounded-full bg-[var(--oak-shield)]"
              style={{ width: `${phaseProgress(row.phase)}%` }}
            />
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-[var(--oak-mist-strong)] px-3 py-1 text-xs font-medium text-slate-700">
          {row.status.replace('_', ' ')}
        </span>
      </div>
    </Link>
  );
}

function phaseProgress(phase: string) {
  const order = ['scoping', 'evidence', 'fieldwork', 'findings', 'certification', 'maintenance'];
  const index = order.indexOf(phase);
  return index >= 0 ? ((index + 1) / order.length) * 100 : 0;
}
