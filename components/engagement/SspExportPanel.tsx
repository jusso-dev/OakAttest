'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { generateSspPdf, getSspDownloadUrl } from '@/app/actions/ssp';

type Exp = {
  id: string;
  version: number;
  sha256: string;
  format: string;
  generatedAt: string;
};

export function SspExportPanel({
  engagementId,
  exports: list,
}: {
  engagementId: string;
  exports: Exp[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setError(null);
    setBusy(true);
    try {
      await generateSspPdf({ engagementId });
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function download(id: string) {
    const { url } = await getSspDownloadUrl({ engagementId, exportId: id });
    window.open(url, '_blank');
  }

  return (
    <div className="space-y-3">
      <Button variant="primary" disabled={busy} onClick={generate}>
        {busy ? 'Generating…' : 'Generate SSP PDF'}
      </Button>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {list.length > 0 && (
        <ul className="divide-y divide-slate-100 text-sm">
          {list.map((e) => (
            <li key={e.id} className="flex items-center justify-between py-2">
              <div>
                <p className="font-medium text-slate-900">SSP v{e.version} · {e.format}</p>
                <p className="font-mono text-xs text-slate-500">
                  {e.sha256.slice(0, 24)}… · {new Date(e.generatedAt).toLocaleString('en-AU')}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => download(e.id)}>
                Download
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
