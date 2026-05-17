'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { startEvidenceUpload, finaliseEvidenceUpload } from '@/app/actions/evidence';

export function EvidenceUploader({
  engagementId,
  evidenceRequestId,
  controls,
}: {
  engagementId: string;
  evidenceRequestId?: string;
  controls: Array<{ id: string; controlId: string }>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File) {
    setError(null);
    setBusy(true);
    try {
      setStatus('Requesting upload URL…');
      const start = await startEvidenceUpload({
        engagementId,
        evidenceRequestId,
        filename: file.name,
        mimeType: file.type || undefined,
        sizeBytes: file.size,
        ismControlIds: controls.map((c) => c.id),
      });

      setStatus('Computing SHA-256…');
      const sha = await sha256ForFile(file);

      setStatus('Uploading to storage…');
      const resp = await fetch(start.uploadUrl, {
        method: 'PUT',
        headers: start.headers,
        body: file,
      });
      if (!resp.ok) throw new Error(`Upload failed: ${resp.status}`);

      setStatus('Finalising…');
      await finaliseEvidenceUpload({
        engagementId,
        evidenceItemId: start.evidenceItemId,
        sha256: sha,
      });

      setStatus('Uploaded.');
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <label className="inline-flex h-9 cursor-pointer items-center justify-center rounded-md bg-teal-900 px-4 text-sm font-medium text-white hover:bg-teal-800">
        {busy ? 'Uploading…' : 'Upload evidence'}
        <input
          type="file"
          className="hidden"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
        />
      </label>
      {status && <p className="text-xs text-slate-600">{status}</p>}
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}

async function sha256ForFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
