'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import {
  importFrameworkFromUrl,
  type FrameworkActionState,
} from '@/app/actions/frameworks';

const initialState: FrameworkActionState = { ok: false, message: '' };

// Import an OSCAL catalogue for a framework from a URL (NIST 800-53 today).
export function FrameworkUrlImport({
  frameworkKey,
  defaultUrl,
}: {
  frameworkKey: string;
  defaultUrl?: string;
}) {
  const [state, action, pending] = useActionState(importFrameworkFromUrl, initialState);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="frameworkKey" value={frameworkKey} />
      <label className="block text-sm font-medium text-slate-800" htmlFor={`url-${frameworkKey}`}>
        OSCAL catalogue URL
      </label>
      <input
        id={`url-${frameworkKey}`}
        name="url"
        defaultValue={defaultUrl}
        placeholder="https://…/catalog.json"
        className="flex h-9 w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm text-slate-950"
      />
      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? 'Importing…' : 'Import catalogue'}
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
