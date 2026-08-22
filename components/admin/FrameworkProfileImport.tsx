'use client';

import { useActionState } from 'react';
import { importFrameworkProfile, type FrameworkActionState } from '@/app/actions/frameworks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const initialState: FrameworkActionState = { ok: false, message: '' };

export function FrameworkProfileImport({
  targetFrameworkKey,
  targetFrameworkLabel,
  baseFrameworkKey,
  baseRevisions,
}: {
  targetFrameworkKey: string;
  targetFrameworkLabel: string;
  baseFrameworkKey: string;
  baseRevisions: Array<{ revision: string; controlCount: number }>;
}) {
  const [state, action, pending] = useActionState(importFrameworkProfile, initialState);
  if (baseRevisions.length === 0) {
    return <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Import the NIST SP 800-53 base catalogue before resolving a profile.</p>;
  }
  return (
    <form action={action} className="space-y-3 rounded-md border border-[var(--field-border)] bg-slate-50 p-4">
      <input type="hidden" name="targetFrameworkKey" value={targetFrameworkKey} />
      <input type="hidden" name="baseFrameworkKey" value={baseFrameworkKey} />
      <div>
        <p className="text-sm font-semibold text-slate-900">Resolve OSCAL profile</p>
        <p className="mt-1 text-xs text-slate-600">Creates a tenant-private, active {targetFrameworkLabel} pack from an uploaded NIST or FedRAMP profile.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs font-medium text-slate-700">Base catalogue revision<select name="baseRevision" required className="h-10 w-full rounded-md border border-[var(--field-border)] bg-white px-3 text-sm">{baseRevisions.map((revision) => <option key={revision.revision} value={revision.revision}>{revision.revision} · {revision.controlCount} controls</option>)}</select></label>
        <label className="space-y-1 text-xs font-medium text-slate-700">Pack revision<Input name="revision" required placeholder="moderate-2026.1" /></label>
        <label className="space-y-1 text-xs font-medium text-slate-700">Pack label<Input name="label" required minLength={3} placeholder={`${targetFrameworkLabel} Moderate`} /></label>
        <label className="space-y-1 text-xs font-medium text-slate-700">Effective date<Input name="effectiveDate" type="date" required /></label>
        <label className="space-y-1 text-xs font-medium text-slate-700">Expiry date (optional)<Input name="expiryDate" type="date" /></label>
        <label className="space-y-1 text-xs font-medium text-slate-700">OSCAL profile JSON<Input name="file" type="file" accept="application/json,.json" required /></label>
        <label className="space-y-1 text-xs font-medium text-slate-700 sm:col-span-2">Description<Input name="description" /></label>
      </div>
      <Button type="submit" disabled={pending}>{pending ? 'Resolving…' : 'Resolve and activate profile'}</Button>
      {state.message ? <p className={`text-sm ${state.ok ? 'text-emerald-700' : 'text-red-700'}`} role="status">{state.message}</p> : null}
    </form>
  );
}
