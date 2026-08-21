'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Download, PackageCheck } from 'lucide-react';
import {
  generateAuditEvidencePackage,
  getAuditEvidencePackageDownloadUrl,
} from '@/app/actions/audit-readiness';
import { Button } from '@/components/ui/button';
import { UserDateTime } from '@/components/timezone/UserTimezone';

export function AuditEvidencePackagePanel({ engagementId, packages, canManage }: {
  engagementId: string;
  packages: Array<{ id: string; version: number; bundleSha256: string; sizeBytes: number; generatedAt: string; auditType: string }>;
  canManage: boolean;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function generate() {
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await generateAuditEvidencePackage({ engagementId });
        setMessage(`Package v${result.version} created. SHA-256 ${result.bundleSha256}.`);
        router.refresh();
      } catch (err) {
        setMessage((err as Error).message);
      }
    });
  }

  async function download(packageId: string) {
    setBusyId(packageId);
    setMessage(null);
    try {
      const { url } = await getAuditEvidencePackageDownloadUrl({ engagementId, packageId });
      const link = document.createElement('a');
      link.href = url;
      link.click();
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return <div className="space-y-4">
    <div className="rounded-md border border-[var(--field-border)] bg-[var(--oak-mist)] p-4 text-sm text-slate-700">
      Package freezes checklist, control matrix, verified evidence files with SHA-256 hashes, findings, machine-readable manifest, and engagement audit log. Large exports can take several minutes.
    </div>
    {canManage ? <Button variant="primary" onClick={generate} disabled={pending}><PackageCheck className="h-4 w-4" />{pending ? 'Generating…' : 'Generate timestamped package'}</Button> : null}
    {message ? <p className="break-all text-sm text-slate-700">{message}</p> : null}
    {packages.length === 0 ? <p className="text-sm text-slate-600">No evidence packages yet.</p> : <ul className="divide-y divide-slate-100">
      {packages.map((record) => <li key={record.id} className="grid gap-3 py-3 text-sm md:grid-cols-[90px_1fr_180px_auto] md:items-center">
        <span className="font-medium text-slate-950">v{record.version}</span>
        <span className="font-mono text-xs text-slate-600" title={record.bundleSha256}>{record.bundleSha256.slice(0, 24)}…</span>
        <span className="text-slate-600"><UserDateTime value={record.generatedAt} /> · {formatBytes(record.sizeBytes)}</span>
        <Button size="sm" variant="outline" disabled={busyId === record.id} onClick={() => download(record.id)}><Download className="h-3 w-3" />{busyId === record.id ? 'Preparing…' : 'Download'}</Button>
      </li>)}
    </ul>}
  </div>;
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
