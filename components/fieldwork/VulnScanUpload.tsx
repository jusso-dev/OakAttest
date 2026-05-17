'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { importVulnScan } from '@/app/actions/vuln-scans';

export function VulnScanUpload({ engagementId }: { engagementId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File) {
    setError(null);
    setBusy(true);
    setStatus(`Parsing ${file.name}…`);
    try {
      const content = await file.text();
      const result = await importVulnScan({
        engagementId,
        filename: file.name,
        content,
      });
      setStatus(
        `${result.total} entries · drafted ${result.drafted} observation(s) (${result.critical} critical / ${result.high} high).`,
      );
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <label className="inline-flex h-9 cursor-pointer items-center justify-center rounded-md bg-teal-900 px-4 text-sm font-medium text-white hover:bg-teal-800">
        {busy ? 'Importing…' : 'Import vulnerability scan'}
        <input
          type="file"
          className="hidden"
          accept=".nessus,.csv,.xml"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
        />
      </label>
      <p className="text-xs text-slate-500">
        Supported: Nessus (.nessus XML), Rapid7 CSV, Qualys CSV, generic CSV with columns
        host/title/severity/cvss.
      </p>
      {status && <p className="text-xs text-slate-700">{status}</p>}
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
