'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { submitCveScan } from '@/app/actions/cve';

export function CveSubmitForm({ engagementId }: { engagementId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File) {
    setError(null);
    setBusy(true);
    setStatus(`Reading ${file.name}…`);
    try {
      const content = await file.text();
      setStatus('Scanning against OSV.dev…');
      const result = await submitCveScan({
        engagementId,
        filename: file.name,
        content,
        source: file.name.toLowerCase().includes('sbom') ? 'sbom' : 'manifest',
      });
      setStatus(
        `Scan complete: ${result.total} advisor${result.total === 1 ? 'y' : 'ies'} (${result.critical} critical, ${result.high} high).`,
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
    <div className="space-y-3">
      <label className="inline-flex h-9 cursor-pointer items-center justify-center rounded-md bg-[var(--oak-shield)] px-4 text-sm font-medium text-white hover:bg-[var(--oak-shield-hover)]">
        {busy ? 'Scanning…' : 'Submit manifest or SBOM'}
        <input
          type="file"
          className="hidden"
          accept=".json,.lock,.toml,.txt,.xml,Dockerfile"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
        />
      </label>
      <p className="text-xs text-slate-600">
        Supported: package-lock.json, requirements.txt, Pipfile.lock, Gemfile.lock, go.sum,
        Cargo.lock, composer.lock, pom.xml, Dockerfile, CycloneDX/SPDX SBOM JSON.
      </p>
      {status && <p className="text-xs text-slate-700">{status}</p>}
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
