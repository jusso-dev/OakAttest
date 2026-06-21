'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { provisionPartner } from '@/app/actions/partner-invitations';

// PLATFORM SUPERADMIN: provision a new MSP and invite its owner.
export function ProvisionPartnerForm() {
  const [name, setName] = useState('');
  const [billingEmail, setBillingEmail] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    setInviteUrl(null);
    try {
      const result = await provisionPartner({
        name,
        billingEmail: billingEmail || undefined,
        ownerEmail,
      });
      setInviteUrl(result.url);
      setName('');
      setBillingEmail('');
      setOwnerEmail('');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="ppName">MSP name</Label>
          <Input id="ppName" value={name} onChange={(e) => setName(e.target.value)} placeholder="Yuma IT" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ppOwner">Owner email</Label>
          <Input id="ppOwner" type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} placeholder="owner@yuma.example" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ppBilling">Billing email (optional)</Label>
          <Input id="ppBilling" type="email" value={billingEmail} onChange={(e) => setBillingEmail(e.target.value)} placeholder="billing@yuma.example" />
        </div>
      </div>
      <Button variant="primary" disabled={busy || name.length < 2 || !ownerEmail} onClick={submit}>
        {busy ? 'Provisioning…' : 'Provision MSP + invite owner'}
      </Button>
      {err && <p className="text-sm text-red-700">{err}</p>}
      {inviteUrl && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          MSP provisioned. Invitation sent. Direct link:{' '}
          <a className="font-medium underline break-all" href={inviteUrl}>{inviteUrl}</a>
        </div>
      )}
    </div>
  );
}
