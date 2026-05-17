import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { cveScans, cveScanFindings } from '@/db/schema/cve';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CveSubmitForm } from '@/components/evidence/CveSubmitForm';
import { getSession } from '@/lib/auth/session';

export const metadata = { title: 'CVE scan · OakAttest' };

export default async function CveScanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await getSession();

  const scans = await db
    .select()
    .from(cveScans)
    .where(eq(cveScans.engagementId, id))
    .orderBy(desc(cveScans.startedAt));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>CVE scan as evidence</CardTitle>
          <CardDescription>
            Submit a manifest or SBOM. We run it against the public OSV.dev advisory database
            (which aggregates the GitHub Advisory Database, PyPI advisories, RustSec, and
            others) and produce a signed, point-in-time evidence artifact. Critical or high
            severity findings auto-draft an observation linked to the patching controls.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CveSubmitForm engagementId={id} />
        </CardContent>
      </Card>

      {scans.map((s) => (
        <ScanCard key={s.id} scan={s} />
      ))}
    </div>
  );
}

async function ScanCard({ scan }: { scan: typeof cveScans.$inferSelect }) {
  const findings = await db
    .select()
    .from(cveScanFindings)
    .where(eq(cveScanFindings.scanId, scan.id))
    .orderBy(desc(cveScanFindings.severity));

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {scan.sourceFilename ?? scan.source} — {scan.status}
        </CardTitle>
        <CardDescription>
          Started {new Date(scan.startedAt).toLocaleString('en-AU')}.
          {scan.signedHash && (
            <>
              {' '}Signed hash <span className="font-mono">{scan.signedHash.slice(0, 16)}…</span>.
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {scan.status === 'failed' ? (
          <p className="text-sm text-red-700">Failed: {scan.failureReason}</p>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-3 text-center">
              <Counter label="Critical" value={scan.criticalCount} tone="critical" />
              <Counter label="High" value={scan.highCount} tone="high" />
              <Counter label="Medium" value={scan.mediumCount} tone="medium" />
              <Counter label="Low" value={scan.lowCount} tone="low" />
            </div>
            {findings.length > 0 && (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wider text-slate-500">
                    <tr className="border-b border-slate-200">
                      <th className="py-2 pr-3">Package</th>
                      <th className="py-2 pr-3">Version</th>
                      <th className="py-2 pr-3">Advisory</th>
                      <th className="py-2 pr-3">Severity</th>
                      <th className="py-2 pr-3">Fixed in</th>
                    </tr>
                  </thead>
                  <tbody>
                    {findings.map((f) => (
                      <tr key={f.id} className="border-b border-slate-100">
                        <td className="py-2 pr-3 font-mono text-xs">
                          {f.packageEcosystem}: {f.packageName}
                        </td>
                        <td className="py-2 pr-3 text-slate-600">{f.version}</td>
                        <td className="py-2 pr-3 font-mono text-xs text-slate-700">
                          {f.advisoryId}
                        </td>
                        <td className="py-2 pr-3">{f.severity}</td>
                        <td className="py-2 pr-3 text-slate-500">
                          {(f.fixedVersions ?? []).join(', ') || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Counter({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'critical' | 'high' | 'medium' | 'low';
}) {
  const colour = {
    critical: 'bg-red-100 text-red-900',
    high: 'bg-amber-100 text-amber-900',
    medium: 'bg-sky-100 text-sky-900',
    low: 'bg-slate-100 text-slate-700',
  }[tone];
  return (
    <div className={`rounded-md ${colour} p-3`}>
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-xs uppercase tracking-wider">{label}</p>
    </div>
  );
}
