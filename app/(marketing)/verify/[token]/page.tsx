import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { certificationReports } from '@/db/schema/certification';
import { engagements } from '@/db/schema/engagements';
import { tenants } from '@/db/schema/tenants';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata = { title: 'Verify · OakAttest' };

// Public verification page (§9.11). Accessible without auth; only safe
// fields are exposed. The token is the value stored in
// `certification_reports.public_verification_token` and is the only way to
// reach this view.

export default async function VerifyPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const [report] = await db
    .select({
      version: certificationReports.version,
      status: certificationReports.status,
      signedAt: certificationReports.signedAt,
      bundleSha256: certificationReports.bundleSha256,
      signatureAlgorithm: certificationReports.signatureAlgorithm,
      engagementId: certificationReports.engagementId,
      tenantId: certificationReports.tenantId,
    })
    .from(certificationReports)
    .where(eq(certificationReports.publicVerificationToken, token))
    .limit(1);

  if (!report || report.status !== 'signed') notFound();

  const [engagement] = await db
    .select({
      name: engagements.name,
      classification: engagements.classification,
      certifiedAt: engagements.certifiedAt,
    })
    .from(engagements)
    .where(eq(engagements.id, report.engagementId))
    .limit(1);

  const [tenant] = await db
    .select({ name: tenants.name })
    .from(tenants)
    .where(eq(tenants.id, report.tenantId))
    .limit(1);

  return (
    <main className="mx-auto min-h-dvh max-w-2xl px-6 py-16">
      <p className="text-xs uppercase tracking-[0.22em] text-slate-500">OakAttest</p>
      <h1 className="mt-1 text-2xl font-semibold text-slate-900">Certification verification</h1>
      <p className="mt-2 text-sm text-slate-600">
        This page presents the public verification details for an OakAttest-issued IRAP
        certification bundle. Compare the bundle SHA-256 here against the hash of the file you
        received.
      </p>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>{engagement.name}</CardTitle>
          <CardDescription>
            Certified by {tenant.name} on{' '}
            {engagement.certifiedAt
              ? new Date(engagement.certifiedAt).toLocaleString('en-AU')
              : '—'}
            .
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Row label="Classification">{engagement.classification.replace('_', ':')}</Row>
          <Row label="Report version">v{report.version}</Row>
          <Row label="Status">Signed</Row>
          <Row label="Signed at">
            {report.signedAt ? new Date(report.signedAt).toLocaleString('en-AU') : '—'}
          </Row>
          <Row label="Signature algorithm">{report.signatureAlgorithm ?? '—'}</Row>
          <div>
            <p className="text-slate-500">Bundle SHA-256</p>
            <p className="break-all font-mono text-xs">{report.bundleSha256}</p>
          </div>
        </CardContent>
      </Card>

      <p className="mt-6 text-xs text-slate-500">
        This page does not expose any client- or system-identifying details beyond the
        engagement and tenant names. If you believe this certification has been revoked,
        contact the issuing tenant.
      </p>
    </main>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between border-b border-slate-100 pb-2 last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-900">{children}</span>
    </div>
  );
}
