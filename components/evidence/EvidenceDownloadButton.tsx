'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { getEvidenceDownloadUrl } from '@/app/actions/evidence';
import { Button } from '@/components/ui/button';

export function EvidenceDownloadButton({ engagementId, evidenceItemId, filename }: { engagementId: string; evidenceItemId: string; filename: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function download() {
    setBusy(true);
    setError(null);
    try {
      const { url } = await getEvidenceDownloadUrl({ engagementId, evidenceItemId });
      const link = document.createElement('a');
      link.href = url;
      link.click();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return <span className="inline-flex flex-col items-end gap-1"><Button size="sm" variant="outline" disabled={busy} onClick={download} aria-label={`Download ${filename}`}><Download className="h-3 w-3" />{busy ? 'Preparing…' : 'Download'}</Button>{error ? <span className="text-xs text-red-700">{error}</span> : null}</span>;
}
