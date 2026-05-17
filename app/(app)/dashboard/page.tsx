import Link from 'next/link';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { engagements } from '@/db/schema/engagements';
import { getSession } from '@/lib/auth/session';
import { resolveActiveTenant } from '@/lib/auth/active-tenant';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata = { title: 'Dashboard · OakAttest' };

export default async function DashboardPage() {
  const session = (await getSession())!;
  const tenant = (await resolveActiveTenant(session.user.id))!;

  const rows = await db
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
    .orderBy(engagements.createdAt);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-slate-500">{tenant.tenantName}</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Engagements</h1>
        </div>
        <Link
          href="/engagements/new"
          className="inline-flex h-9 items-center justify-center rounded-md bg-teal-900 px-4 text-sm font-medium text-white transition-colors hover:bg-teal-800"
        >
          New engagement
        </Link>
      </header>

      {rows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No engagements yet</CardTitle>
            <CardDescription>
              An engagement scopes one client system at a single classification. Create your
              first one to begin the five-phase IRAP lifecycle.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/engagements/new"
              className="inline-flex h-9 items-center justify-center rounded-md bg-teal-900 px-4 text-sm font-medium text-white transition-colors hover:bg-teal-800"
            >
              Start an engagement
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {rows.map((row) => (
            <Link
              key={row.id}
              href={`/engagements/${row.id}/overview`}
              className="block rounded-md border border-slate-200 bg-white p-4 transition-colors hover:border-slate-300 hover:bg-slate-50"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium text-slate-900">{row.name}</p>
                  <p className="text-xs text-slate-500">
                    {row.reference ? `${row.reference} · ` : ''}
                    {row.classification.replace('_', ':')} · {row.phase}
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                  {row.status}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
