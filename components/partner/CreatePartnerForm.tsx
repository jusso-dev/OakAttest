'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createPartner } from '@/app/actions/partners';

export function CreatePartnerForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      await createPartner({ name, billingEmail: email || undefined });
      window.location.assign('/partner');
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="partnerName">MSP name</Label>
        <Input
          id="partnerName"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Yuma IT"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="partnerEmail">Billing email (optional)</Label>
        <Input
          id="partnerEmail"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="billing@yuma.example"
        />
      </div>
      <Button variant="primary" disabled={busy || name.length < 2} onClick={submit}>
        {busy ? 'Creating…' : 'Create partner'}
      </Button>
      {err && <p className="text-sm text-red-700">{err}</p>}
    </div>
  );
}
