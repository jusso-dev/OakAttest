'use client';

import { useActionState } from 'react';
import {
  activateCustomFrameworkPack,
  createCustomFramework,
  createCustomFrameworkRevision,
  deleteCustomFrameworkControl,
  retireFrameworkPack,
  upsertCustomFrameworkControl,
  type FrameworkActionState,
} from '@/app/actions/frameworks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserDateTime } from '@/components/timezone/UserTimezone';

const initialState: FrameworkActionState = { ok: false, message: '' };

type CustomPack = {
  id: string;
  frameworkId: string;
  frameworkKey: string;
  frameworkLabel: string;
  revision: string;
  label: string;
  description: string | null;
  status: string;
  controlCount: number;
  sourceSha256: string | null;
  effectiveAt: string | null;
  expiresAt: string | null;
  controls: Array<{ controlId: string; title: string | null; description: string; topic: string | null }>;
};

export function CustomFrameworkBuilder({ packs }: { packs: CustomPack[] }) {
  const [state, action, pending] = useActionState(createCustomFramework, initialState);
  return (
    <div className="space-y-4">
      <form action={action} className="grid gap-3 rounded-md border border-[var(--field-border)] bg-slate-50 p-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><p className="text-sm font-semibold text-slate-900">Create custom assessment pack</p><p className="mt-1 text-xs text-slate-600">Draft remains private and unavailable to engagements until controls are reviewed and pack is activated.</p></div>
        <Field name="label" label="Framework label" placeholder="Internal security baseline" />
        <Field name="key" label="Stable key" placeholder="internal-security" />
        <Field name="revision" label="Revision" placeholder="2026.1" />
        <Field name="description" label="Description" placeholder="Purpose, authority, and intended assessment scope" />
        <div className="sm:col-span-2"><Button disabled={pending}>{pending ? 'Creating…' : 'Create draft pack'}</Button></div>
        {state.message ? <p className={`sm:col-span-2 text-sm ${state.ok ? 'text-emerald-700' : 'text-red-700'}`} role="status">{state.message}</p> : null}
      </form>
      {packs.map((pack) => <CustomPackEditor key={pack.id} pack={pack} />)}
    </div>
  );
}

function CustomPackEditor({ pack }: { pack: CustomPack }) {
  const [controlState, controlAction, controlPending] = useActionState(upsertCustomFrameworkControl, initialState);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteCustomFrameworkControl, initialState);
  const [activateState, activateAction, activatePending] = useActionState(activateCustomFrameworkPack, initialState);
  const [retireState, retireAction, retirePending] = useActionState(retireFrameworkPack, initialState);
  const [revisionState, revisionAction, revisionPending] = useActionState(createCustomFrameworkRevision, initialState);
  return (
    <div className="space-y-4 rounded-md border border-[var(--field-border)] bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold text-slate-950">{pack.frameworkLabel} · {pack.revision}</p><p className="mt-1 text-xs text-slate-600">{pack.frameworkKey} · {pack.controlCount} controls{pack.sourceSha256 ? ` · SHA-256 ${pack.sourceSha256.slice(0, 16)}…` : ''}</p></div><span className="rounded-full bg-[var(--oak-mist-strong)] px-2 py-1 text-xs">{pack.status}</span></div>
      {pack.description ? <p className="text-sm text-slate-700">{pack.description}</p> : null}
      {pack.controls.length ? <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead><tr className="border-b text-left text-xs uppercase text-slate-600"><th className="py-2 pr-3">ID</th><th className="py-2 pr-3">Title</th><th className="py-2 pr-3">Description</th>{pack.status === 'draft' ? <th className="py-2">Action</th> : null}</tr></thead><tbody>{pack.controls.map((control) => <tr key={control.controlId} className="border-b border-slate-100"><td className="py-2 pr-3 font-mono text-xs">{control.controlId}</td><td className="py-2 pr-3">{control.title ?? '—'}</td><td className="py-2 pr-3 text-slate-600">{control.description}</td>{pack.status === 'draft' ? <td className="py-2"><form action={deleteAction}><input type="hidden" name="packId" value={pack.id} /><input type="hidden" name="controlId" value={control.controlId} /><Button type="submit" size="sm" variant="outline" disabled={deletePending}>Remove</Button></form></td> : null}</tr>)}</tbody></table>{deleteState.message ? <p className={`mt-2 text-sm ${deleteState.ok ? 'text-emerald-700' : 'text-red-700'}`} role="status">{deleteState.message}</p> : null}</div> : <p className="text-sm text-slate-600">No controls yet.</p>}
      {pack.status === 'draft' ? (
        <>
          <form action={controlAction} className="grid gap-3 rounded-md bg-slate-50 p-3 sm:grid-cols-2">
            <input type="hidden" name="packId" value={pack.id} />
            <Field name="controlId" label="Control ID" placeholder="ORG-01" />
            <Field name="title" label="Title" placeholder="Security governance" />
            <Field name="topic" label="Topic" placeholder="Governance" required={false} />
            <label className="space-y-1 text-xs font-medium text-slate-700">Default scope<select name="defaultApplicable" defaultValue="true" className="h-10 w-full rounded-md border border-[var(--field-border)] bg-white px-3 text-sm"><option value="true">In scope</option><option value="false">Out of scope pending assessor confirmation</option></select></label>
            <label className="space-y-1 text-xs font-medium text-slate-700 sm:col-span-2">Control description<textarea name="description" required minLength={10} rows={3} className="w-full rounded-md border border-[var(--field-border)] bg-white px-3 py-2 text-sm" /></label>
            <label className="space-y-1 text-xs font-medium text-slate-700 sm:col-span-2">Guidance (optional)<textarea name="guidance" rows={2} className="w-full rounded-md border border-[var(--field-border)] bg-white px-3 py-2 text-sm" /></label>
            <div className="sm:col-span-2"><Button variant="outline" disabled={controlPending}>{controlPending ? 'Saving…' : 'Add or update control'}</Button></div>
            {controlState.message ? <p className={`sm:col-span-2 text-sm ${controlState.ok ? 'text-emerald-700' : 'text-red-700'}`} role="status">{controlState.message}</p> : null}
          </form>
          <form action={activateAction} className="flex flex-wrap items-end gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-3">
            <input type="hidden" name="packId" value={pack.id} />
            <label className="text-xs font-medium text-slate-700">Effective date<Input name="effectiveDate" type="date" required /></label>
            <label className="text-xs font-medium text-slate-700">Expiry date (optional)<Input name="expiryDate" type="date" /></label>
            <Button disabled={activatePending || pack.controlCount === 0}>{activatePending ? 'Activating…' : 'Activate immutable revision'}</Button>
            {activateState.message ? <p className={`w-full text-sm ${activateState.ok ? 'text-emerald-700' : 'text-red-700'}`} role="status">{activateState.message}</p> : null}
          </form>
        </>
      ) : null}
      {pack.status === 'active' ? <form action={retireAction} className="space-y-2"><input type="hidden" name="packId" value={pack.id} /><p className="text-xs text-slate-600">Active since {pack.effectiveAt ? <UserDateTime value={pack.effectiveAt} /> : 'activation'}{pack.expiresAt ? <> · expires <UserDateTime value={pack.expiresAt} /></> : null}. Retirement hides it from new engagements; pinned assessments remain intact.</p><Button variant="outline" disabled={retirePending}>{retirePending ? 'Retiring…' : 'Retire pack'}</Button>{retireState.message ? <p className={`text-sm ${retireState.ok ? 'text-emerald-700' : 'text-red-700'}`} role="status">{retireState.message}</p> : null}</form> : null}
      {pack.status !== 'draft' ? <form action={revisionAction} className="flex flex-wrap items-end gap-3 rounded-md bg-slate-50 p-3"><input type="hidden" name="packId" value={pack.id} /><label className="text-xs font-medium text-slate-700">Next revision<Input name="revision" required placeholder="2026.2" /></label><Button variant="outline" disabled={revisionPending}>{revisionPending ? 'Copying…' : 'Create editable revision'}</Button>{revisionState.message ? <p className={`w-full text-sm ${revisionState.ok ? 'text-emerald-700' : 'text-red-700'}`} role="status">{revisionState.message}</p> : null}</form> : null}
    </div>
  );
}

function Field({ name, label, placeholder, required = true }: { name: string; label: string; placeholder: string; required?: boolean }) {
  return <label className="space-y-1 text-xs font-medium text-slate-700">{label}<Input name={name} placeholder={placeholder} required={required} /></label>;
}
