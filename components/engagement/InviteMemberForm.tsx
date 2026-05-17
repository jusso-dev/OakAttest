'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { inviteToEngagement } from '@/app/actions/invitations';

export function InviteMemberForm({ engagementId }: { engagementId: string }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'lead_assessor' | 'assessor' | 'client_admin' | 'client_contributor' | 'read_only_observer'>('client_admin');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const result = await inviteToEngagement({ engagementId, email, role });
      setMessage(`Invitation sent — expires ${new Date(result.expiresAt).toLocaleString('en-AU')}.`);
      setEmail('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Invite member</p>
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
            className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
          >
            <option value="lead_assessor">Lead assessor</option>
            <option value="assessor">Assessor</option>
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
