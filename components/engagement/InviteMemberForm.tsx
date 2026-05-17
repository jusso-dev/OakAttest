'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { inviteToEngagement } from '@/app/actions/invitations';

export function InviteMemberForm({ engagementId }: { engagementId: string }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<
    'client_admin' | 'client_contributor' | 'read_only_observer'
  >('client_contributor');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const result = await inviteToEngagement({ engagementId, email, role });
      setMessage(
        `Client invitation sent. Access is limited to this engagement and expires ${new Date(result.expiresAt).toLocaleString('en-AU')}.`,
      );
      setEmail('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-[var(--field-border)] bg-[var(--oak-mist)] p-3">
      <p className="text-xs font-medium uppercase text-slate-600">Invite client</p>
      <p className="mt-1 text-xs text-slate-700">
        Invited users can only access this engagement unless they are separately added elsewhere.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_200px_auto]">
        <div className="space-y-1.5">
          <Label htmlFor="invEmail">Email</Label>
          <Input
            id="invEmail"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="invRole">Role</Label>
          <select
            id="invRole"
            value={role}
            onChange={(e) => setRole(e.target.value as never)}
            className="flex h-9 w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm"
          >
            <option value="client_admin">Client admin</option>
            <option value="client_contributor">Client contributor</option>
            <option value="read_only_observer">Read-only observer</option>
          </select>
        </div>
        <div className="flex items-end">
          <Button variant="primary" disabled={busy || !email} onClick={submit}>
            {busy ? 'Sending…' : 'Send invite'}
          </Button>
        </div>
      </div>
      {message && <p className="mt-2 text-xs text-slate-600">{message}</p>}
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}
