'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { inviteTenantMember } from '@/app/actions/tenants';

type TenantRole = 'tenant_owner' | 'assessor_admin';

export function TenantInviteForm({ tenantId }: { tenantId: string }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<TenantRole>('assessor_admin');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setMessage(null);
    setInviteUrl(null);
    setError(null);
    try {
      const result = await inviteTenantMember({ tenantId, email, role });
      setMessage(`Invitation sent. It expires ${new Date(result.expiresAt).toLocaleString('en-AU')}.`);
      setInviteUrl(result.url);
      setEmail('');
      setRole('assessor_admin');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_180px_auto]">
        <div className="space-y-1.5">
          <Label htmlFor="tenantInviteEmail">Work email</Label>
          <Input
            id="tenantInviteEmail"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="colleague@example.com"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tenantInviteRole">Role</Label>
          <select
            id="tenantInviteRole"
            value={role}
            onChange={(e) => setRole(e.target.value as TenantRole)}
            className="flex h-9 w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--oak-shield)]"
          >
            <option value="assessor_admin">Assessor admin</option>
            <option value="tenant_owner">Tenant owner</option>
          </select>
        </div>
        <div className="flex items-end">
          <Button variant="primary" disabled={busy || !email} onClick={submit}>
            {busy ? 'Sending...' : 'Send invite'}
          </Button>
        </div>
      </div>
      {message && <p className="text-sm text-slate-600">{message}</p>}
      {inviteUrl && (
        <p className="break-all rounded-md bg-[var(--oak-mist)] p-2 text-xs text-slate-600">
          Dev invite link: {inviteUrl}
        </p>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
