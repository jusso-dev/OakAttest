'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { startEvidenceUpload, finaliseEvidenceUpload } from '@/app/actions/evidence';
import { sha256ForFile } from '@/lib/evidence/sha256';
import type { Classification } from '@/db/schema/enums';

const CLASSIFICATIONS: Classification[] = [
  'OFFICIAL',
  'OFFICIAL_SENSITIVE',
  'PROTECTED',
  'SECRET',
  'TOP_SECRET',
];

const LABELS: Record<Classification, string> = {
  OFFICIAL: 'OFFICIAL',
  OFFICIAL_SENSITIVE: 'OFFICIAL: Sensitive',
  PROTECTED: 'PROTECTED',
  SECRET: 'SECRET',
  TOP_SECRET: 'TOP SECRET',
};

export function EvidenceUploader({
  engagementId,
  evidenceRequestId,
  controls,
  workspaceClassification,
}: {
  engagementId: string;
  evidenceRequestId?: string;
  controls: Array<{ id: string; controlId: string }>;
  workspaceClassification: Classification;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dataClassification, setDataClassification] = useState<Classification | ''>('');

  async function onFile(file: File) {
    if (!dataClassification) {
      setError('Declare the document classification before selecting a file.');
      return;
    }
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
        dataClassification,
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

      setStatus('Verifying and indexing for search…');
      const finalised = await finaliseEvidenceUpload({
        engagementId,
        evidenceItemId: start.evidenceItemId,
        sha256: sha,
      });

      setStatus(
        finalised.rag.status === 'indexed'
          ? `Uploaded and indexed (${finalised.rag.chunks} search chunks).`
          : `Uploaded. Search indexing: ${finalised.rag.error ?? finalised.rag.status}.`,
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
    <div className="flex flex-col items-end gap-1">
      <label className="w-full text-xs font-medium text-slate-700">
        Document classification
        <select
          value={dataClassification}
          onChange={(event) => setDataClassification(event.target.value as Classification | '')}
          className="mt-1 h-9 w-full rounded-md border border-[var(--field-border)] bg-white px-2 text-xs text-slate-950"
          disabled={busy}
        >
          <option value="">Declare before upload</option>
          {CLASSIFICATIONS.slice(0, CLASSIFICATIONS.indexOf(workspaceClassification) + 1).map(
            (classification) => (
              <option key={classification} value={classification}>
                {LABELS[classification]}
              </option>
            ),
          )}
        </select>
      </label>
      <p className="max-w-72 text-right text-xs text-amber-800">
        This workspace is {LABELS[workspaceClassification]}. Higher-classified data is blocked and
        must be moved to an appropriately accredited workspace.
      </p>
      <label className="inline-flex h-9 cursor-pointer items-center justify-center rounded-md bg-[var(--oak-shield)] px-4 text-sm font-medium text-white hover:bg-[var(--oak-shield-hover)]">
        {busy ? 'Uploading…' : 'Upload evidence'}
        <input
          type="file"
          className="hidden"
          disabled={busy || !dataClassification}
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
