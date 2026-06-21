'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { invitePartnerMember } from '@/app/actions/partner-invitations';

type PartnerRole = 'partner_owner' | 'partner_admin';

// Invite an MSP staff member to a partner. Used by the platform superadmin and
// by partner owners.
export function InvitePartnerMemberForm({ partnerId }: { partnerId: string }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<PartnerRole>('partner_admin');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    setInviteUrl(null);
    try {
      const result = await invitePartnerMember({ partnerId, email, role });
      setInviteUrl(result.url);
      setEmail('');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_200px_auto]">
        <div className="space-y-1.5">
          <Label htmlFor={`im-${partnerId}`}>MSP staff email</Label>
          <Input id={`im-${partnerId}`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@msp.example" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`ir-${partnerId}`}>Role</Label>
          <select
            id={`ir-${partnerId}`}
            value={role}
            onChange={(e) => setRole(e.target.value as PartnerRole)}
            className="flex h-9 w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--oak-shield)]"
          >
            <option value="partner_admin">Partner admin</option>
            <option value="partner_owner">Partner owner</option>
          </select>
        </div>
        <div className="flex items-end">
          <Button variant="primary" disabled={busy || !email} onClick={submit}>
            {busy ? 'Inviting…' : 'Invite'}
          </Button>
        </div>
      </div>
      {err && <p className="text-sm text-red-700">{err}</p>}
      {inviteUrl && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          Invitation sent. Direct link:{' '}
          <a className="font-medium underline break-all" href={inviteUrl}>{inviteUrl}</a>
        </div>
      )}
    </div>
  );
}
