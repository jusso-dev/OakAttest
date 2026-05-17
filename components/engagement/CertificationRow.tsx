'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  signAndBundleCertification,
  getCertificationDownloadUrl,
} from '@/app/actions/certification';

type Report = {
  id: string;
  version: number;
  status: 'draft' | 'signed' | 'superseded' | 'revoked';
  pdfStorageKey: string | null;
  bundleStorageKey: string | null;
  bundleSha256: string | null;
  publicVerificationToken: string | null;
  signedAt: Date | null;
  signatureAlgorithm: string | null;
  createdAt: Date;
};

export function CertificationRow({
  engagementId,
  report,
  canSign,
}: {
  engagementId: string;
  report: Report;
  canSign: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function sign() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await signAndBundleCertification({
        engagementId,
        reportId: report.id,
      });
      setMessage(`Signed. Bundle SHA-256: ${result.bundleHash.slice(0, 16)}…`);
      router.refresh();
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function downloadPdf() {
    const { url } = await getCertificationDownloadUrl({
      engagementId,
      reportId: report.id,
      kind: 'pdf',
    });
    window.open(url, '_blank');
  }

  async function downloadBundle() {
    const { url } = await getCertificationDownloadUrl({
      engagementId,
      reportId: report.id,
      kind: 'bundle',
    });
    window.open(url, '_blank');
  }

  return (
    <div className="rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-4 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-slate-900">Version {report.version}</p>
          <p className="text-xs text-slate-600">
            {report.status}
            {report.signedAt
              ? ` · signed ${new Date(report.signedAt).toLocaleString('en-AU')}`
              : ` · created ${new Date(report.createdAt).toLocaleString('en-AU')}`}
          </p>
          {report.bundleSha256 && (
            <p className="mt-1 font-mono text-xs text-slate-600">
              SHA-256 {report.bundleSha256.slice(0, 24)}…
            </p>
          )}
          {report.publicVerificationToken && (
            <a
              className="mt-1 inline-block text-xs text-[var(--oak-shield)] underline"
              href={`/verify/${report.publicVerificationToken}`}
              target="_blank"
              rel="noreferrer"
            >
              Public verification URL
            </a>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          {report.pdfStorageKey && (
            <Button size="sm" variant="outline" onClick={downloadPdf}>
              Download PDF
            </Button>
          )}
          {report.bundleStorageKey && (
            <Button size="sm" variant="outline" onClick={downloadBundle}>
              Download bundle
            </Button>
          )}
          {canSign && report.status === 'draft' && (
            <Button size="sm" variant="primary" disabled={busy} onClick={sign}>
              {busy ? 'Signing…' : 'Sign and bundle'}
            </Button>
          )}
        </div>
      </div>
      {message && <p className="mt-2 text-xs text-slate-600">{message}</p>}
    </div>
  );
}
