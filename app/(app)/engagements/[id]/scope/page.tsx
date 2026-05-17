import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { engagementControls } from '@/db/schema/ism';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default async function ScopePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const rows = await db
    .select({
      controlId: engagementControls.controlId,
      revision: engagementControls.revision,
      status: engagementControls.status,
      applicable: engagementControls.applicable,
      justification: engagementControls.applicabilityJustification,
    })
    .from(engagementControls)
    .where(eq(engagementControls.engagementId, id))
    .orderBy(engagementControls.controlId);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Applicability worksheet</CardTitle>
          <CardDescription>
            All ISM controls auto-selected for this engagement by the cumulative classification
            rule. Inline applicability decisions and implementation statements land in milestone 2.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-slate-500">
              No controls populated yet. If you just created this engagement, run{' '}
              <code className="rounded bg-slate-100 px-1 py-0.5">npm run ism:import</code> to load
              the ISM revision pinned for this engagement, then re-create.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wider text-slate-500">
                    <th className="px-3 py-2">Control</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Applicable</th>
                    <th className="px-3 py-2">Justification</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.controlId} className="border-b border-slate-100">
                      <td className="px-3 py-2 font-mono text-xs">{r.controlId}</td>
                      <td className="px-3 py-2">{r.status}</td>
                      <td className="px-3 py-2">{r.applicable ?? '—'}</td>
                      <td className="px-3 py-2 text-slate-600">{r.justification ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
