import { notFound } from 'next/navigation';
import { eq, or } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { certificationReports, tenantSigningKeys } from '@/db/schema/certification';
import { engagements } from '@/db/schema/engagements';
import { tenants } from '@/db/schema/tenants';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BrandLogo } from '@/components/BrandLogo';
import { MANAGED_HMAC_REPORT_ALGORITHM, verifyCertificationSignature } from '@/lib/security/signing';

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
      revokedAt: certificationReports.revokedAt,
      revokedReason: certificationReports.revokedReason,
      signatureValue: certificationReports.signatureValue,
      signatureAlgorithm: certificationReports.signatureAlgorithm,
      signingKeyId: certificationReports.signingKeyId,
      signingKeyFingerprint: certificationReports.signingKeyFingerprint,
      engagementId: certificationReports.engagementId,
      tenantId: certificationReports.tenantId,
      keyId: tenantSigningKeys.id,
      keyPublicKey: tenantSigningKeys.publicKey,
      keyFingerprint: tenantSigningKeys.fingerprint,
      keyRotatedAt: tenantSigningKeys.rotatedAt,
      keyRevokedAt: tenantSigningKeys.revokedAt,
    })
    .from(certificationReports)
    .leftJoin(
      tenantSigningKeys,
      or(
        eq(tenantSigningKeys.id, certificationReports.signingKeyId),
        eq(tenantSigningKeys.fingerprint, certificationReports.signingKeyFingerprint),
      ),
    )
    .where(eq(certificationReports.publicVerificationToken, token))
    .limit(1);

  if (!report || (report.status !== 'signed' && report.status !== 'revoked')) notFound();

  const verification = verifyCertificationSignature({
    tenantId: report.tenantId,
    bundleHash: report.bundleSha256,
    signatureValue: report.signatureValue,
    signatureAlgorithm: report.signatureAlgorithm,
    reportRevokedAt:
      report.revokedAt ?? (report.status === 'revoked' ? report.signedAt ?? 'revoked' : null),
    signingKey: report.keyId
      ? {
          id: report.keyId,
          publicKey: report.keyPublicKey,
          fingerprint: report.keyFingerprint,
          rotatedAt: report.keyRotatedAt,
          revokedAt: report.keyRevokedAt,
        }
      : report.signingKeyFingerprint
        ? { fingerprint: report.signingKeyFingerprint }
        : null,
  });

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
    <main className="mx-auto min-h-dvh max-w-2xl px-6 py-16 text-slate-950">
      <BrandLogo imageClassName="h-10" priority />
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
          <Row label="Report status">
            {report.status === 'revoked' || report.revokedAt ? 'Revoked' : 'Signed'}
          </Row>
          <Row label="Signed at">
            {report.signedAt ? new Date(report.signedAt).toLocaleString('en-AU') : '—'}
          </Row>
          <Row label="Signature status">
            <span className={verification.valid ? 'text-emerald-700' : 'text-red-700'}>
              {signatureStatusLabel(verification.status)}
            </span>
          </Row>
          <Row label="Signature algorithm">{report.signatureAlgorithm ?? '—'}</Row>
          <div>
            <p className="text-slate-600">Signing key fingerprint</p>
            <p className="break-all font-mono text-xs">
              {verification.keyFingerprint ?? report.signingKeyFingerprint ?? '—'}
            </p>
          </div>
          <Row label="Signing key status">
            {signingKeyStatus({
              algorithm: report.signatureAlgorithm,
              rotatedAt: report.keyRotatedAt,
              revokedAt: report.keyRevokedAt,
              hasKey: Boolean(report.keyId),
            })}
          </Row>
          <div>
            <p className="text-slate-600">Bundle SHA-256</p>
            <p className="break-all font-mono text-xs">{report.bundleSha256}</p>
          </div>
          <div className="rounded-md border border-[var(--field-border)] bg-[var(--oak-mist)] p-3 text-slate-700">
            {verification.message}
            {report.revokedReason ? ` Reason: ${report.revokedReason}` : ''}
          </div>
        </CardContent>
      </Card>

      <p className="mt-6 text-xs text-slate-600">
        This page does not expose any client- or system-identifying details beyond the
        engagement and tenant names. If you believe this certification has been revoked,
        contact the issuing tenant.
      </p>
    </main>
  );
}

function signatureStatusLabel(status: ReturnType<typeof verifyCertificationSignature>['status']) {
  switch (status) {
    case 'valid':
      return 'Valid';
    case 'valid_with_key_warning':
      return 'Valid with key warning';
    case 'report_revoked':
      return 'Report revoked';
    case 'missing_signature':
      return 'Missing signature metadata';
    case 'missing_key':
      return 'Missing public key';
    case 'unsupported_algorithm':
      return 'Unsupported algorithm';
    case 'invalid':
      return 'Invalid';
  }
}

function signingKeyStatus({
  algorithm,
  hasKey,
  rotatedAt,
  revokedAt,
}: {
  algorithm: string | null;
  hasKey: boolean;
  rotatedAt: Date | null;
  revokedAt: Date | null;
}) {
  if (algorithm === MANAGED_HMAC_REPORT_ALGORITHM) return 'Deployment-managed';
  if (!hasKey) return 'Not found';
  if (revokedAt) return `Revoked ${new Date(revokedAt).toLocaleDateString('en-AU')}`;
  if (rotatedAt) return `Rotated ${new Date(rotatedAt).toLocaleDateString('en-AU')}`;
  return 'Active';
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between border-b border-[var(--field-border)] pb-2 last:border-0">
      <span className="text-slate-600">{label}</span>
      <span className="text-slate-900">{children}</span>
    </div>
  );
}
