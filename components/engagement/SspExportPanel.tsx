'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { deleteSspExport, generateSspBundle, getSspDownloadUrl } from '@/app/actions/ssp';

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
  const [busy, setBusy] = useState<'bundle' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Exp | null>(null);

  async function generate() {
    setError(null);
    setBusy('bundle');
    try {
      const result = await generateSspBundle({ engagementId });
      await download(result.exportId);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setError(null);
    setBusy('delete');
    try {
      await deleteSspExport({ engagementId, exportId: deleteTarget.id });
      setDeleteTarget(null);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function download(id: string) {
    const { url } = await getSspDownloadUrl({ engagementId, exportId: id });
    window.open(url, '_blank');
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" disabled={Boolean(busy)} onClick={generate}>
          {busy === 'bundle' ? 'Generating bundle…' : 'Generate and download SSP bundle'}
        </Button>
      </div>
      <p className="text-xs text-slate-600">
        The bundle includes the SSP PDF, Excel workbook, and boundary PNG.
      </p>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {list.length > 0 && (
        <ul className="divide-y divide-slate-100 text-sm">
          {list.map((e) => (
            <li key={e.id} className="flex items-center justify-between py-2">
              <div>
                <p className="font-medium text-slate-900">
                  SSP v{e.version} · {formatLabel(e.format)}
                </p>
                <p className="font-mono text-xs text-slate-600">
                  {e.sha256.slice(0, 24)}… · {new Date(e.generatedAt).toLocaleString('en-AU')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => download(e.id)}>
                  Download
                </Button>
                <Button size="sm" variant="destructive" onClick={() => setDeleteTarget(e)}>
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4"
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="deleteSspExportTitle"
            className="w-full max-w-md rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-5 shadow-xl"
          >
            <h2 id="deleteSspExportTitle" className="text-base font-semibold text-slate-950">
              Delete generated SSP file?
            </h2>
            <p className="mt-2 text-sm text-slate-700">
              This removes SSP v{deleteTarget.version} ({formatLabel(deleteTarget.format)}) from
              object storage and deletes the export record. The audit log will keep a deletion
              event.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="outline"
                disabled={busy === 'delete'}
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </Button>
              <Button variant="destructive" disabled={busy === 'delete'} onClick={confirmDelete}>
                {busy === 'delete' ? 'Deleting…' : 'Delete file'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatLabel(format: string) {
  if (format === 'xlsx') return 'Excel';
  if (format === 'zip') return 'Bundle';
  return format.toUpperCase();
}
