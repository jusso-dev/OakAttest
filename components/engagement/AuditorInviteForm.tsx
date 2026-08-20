'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { inviteToEngagement } from '@/app/actions/invitations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function AuditorInviteForm({ engagementId }: { engagementId: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const email = String(new FormData(form).get('email') ?? '');
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await inviteToEngagement({ engagementId, email, role: 'read_only_observer' });
        setMessage(`Auditor invite sent. Expires ${new Date(result.expiresAt).toLocaleString('en-AU')}.`);
        form.reset();
      } catch (err) {
        setMessage((err as Error).message);
      }
    });
  }

  return <form onSubmit={submit} className="space-y-3 rounded-md border border-[var(--field-border)] bg-[var(--oak-mist)] p-4">
    <div><p className="text-sm font-semibold text-slate-950">Invite external auditor</p><p className="mt-1 text-xs text-slate-700">Creates engagement-scoped, read-only access. Auditor can inspect readiness, controls, accepted evidence, findings, and packages without editing.</p></div>
    <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"><div className="space-y-1.5"><Label htmlFor="auditorEmail">Auditor email</Label><Input id="auditorEmail" name="email" type="email" required /></div><Button variant="primary" disabled={pending}>{pending ? 'Sending…' : 'Send auditor invite'}</Button></div>
    {message ? <p className="text-xs text-slate-700">{message}</p> : null}
  </form>;
}
