'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { importFrameworkCsv, type FrameworkActionState } from '@/app/actions/frameworks';

const initialState: FrameworkActionState = { ok: false, message: '' };

// Client CSV import for licensed frameworks (SOC 2 / ISO 27001). The client
// uploads their own control set; rows are stored tenant-scoped.
export function FrameworkCsvImport({
  frameworkKey,
  frameworkLabel,
  templateUrl,
}: {
  frameworkKey: string;
  frameworkLabel: string;
  templateUrl?: string;
}) {
  const [state, action, pending] = useActionState(importFrameworkCsv, initialState);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="frameworkKey" value={frameworkKey} />
      <p className="text-sm leading-6 text-slate-700">
        {frameworkLabel} control text is licensed to you, not distributed by OakAttest. Upload your
        own control set as CSV. Required columns: <code>control_id</code>, <code>title</code>,{' '}
        <code>description</code>. Optional: <code>topic</code>/<code>category</code>,{' '}
        <code>guidance</code>, <code>default_applicable</code>.
        {templateUrl && (
          <>
            {' '}
            <a className="font-medium underline" href={templateUrl} download>
              Download template
            </a>
            .
          </>
        )}
      </p>
      <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-slate-800" htmlFor={`csv-${frameworkKey}`}>
            CSV file
          </label>
          <input
            id={`csv-${frameworkKey}`}
            name="file"
            type="file"
            accept=".csv,text/csv"
            className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border file:border-[var(--field-border)] file:bg-[var(--panel-surface)] file:px-3 file:py-1.5 file:text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-slate-800" htmlFor={`rev-${frameworkKey}`}>
            Revision label (optional)
          </label>
          <input
            id={`rev-${frameworkKey}`}
            name="revision"
            placeholder="e.g. 2025-TSC"
            className="flex h-9 w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm text-slate-950"
          />
        </div>
      </div>
      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? 'Importing…' : 'Import control set'}
      </Button>
      {state.message && (
        <p
          className={`rounded-md border px-3 py-2 text-sm ${
            state.ok
              ? 'border-[var(--oak-border)] bg-[var(--oak-mist)] text-[var(--oak-shield)]'
              : 'border-red-200 bg-red-50 text-red-800'
          }`}
          aria-live="polite"
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
