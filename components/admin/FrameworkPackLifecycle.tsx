'use client';

import { useActionState } from 'react';
import { retireFrameworkPack, type FrameworkActionState } from '@/app/actions/frameworks';
import { Button } from '@/components/ui/button';
import { UserDateTime } from '@/components/timezone/UserTimezone';

const initialState: FrameworkActionState = { ok: false, message: '' };

export function FrameworkPackLifecycle({ pack }: { pack: { id: string; label: string; revision: string; status: string; controlCount: number; effectiveAt: string | null; expiresAt: string | null; sourceSha256: string | null } }) {
  const [state, action, pending] = useActionState(retireFrameworkPack, initialState);
  return <div className="rounded-md border border-[var(--field-border)] bg-white p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-sm font-medium text-slate-900">{pack.label}</p><p className="mt-1 text-xs text-slate-600">{pack.revision} · {pack.controlCount} controls{pack.sourceSha256 ? ` · SHA-256 ${pack.sourceSha256.slice(0, 16)}…` : ''}</p><p className="mt-1 text-xs text-slate-600">Effective {pack.effectiveAt ? <UserDateTime value={pack.effectiveAt} /> : 'not set'}{pack.expiresAt ? <> · expires <UserDateTime value={pack.expiresAt} /></> : null}</p></div><span className="rounded-full bg-[var(--oak-mist-strong)] px-2 py-1 text-xs">{pack.status}</span></div>{pack.status === 'active' ? <form action={action} className="mt-3"><input type="hidden" name="packId" value={pack.id} /><Button variant="outline" size="sm" disabled={pending}>{pending ? 'Retiring…' : 'Retire tenant pack'}</Button></form> : null}{state.message ? <p className={`mt-2 text-sm ${state.ok ? 'text-emerald-700' : 'text-red-700'}`} role="status">{state.message}</p> : null}</div>;
}
