'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClientTenant } from '@/app/actions/partners';

type PlanCode = 'ESSENTIAL' | 'PROFESSIONAL' | 'ENTERPRISE';

export function CreateClientTenantForm({ partnerId }: { partnerId: string }) {
  const [name, setName] = useState('');
  const [abn, setAbn] = useState('');
  const [plan, setPlan] = useState<PlanCode | ''>('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      await createClientTenant({
        partnerId,
        name,
        abn,
        planCode: plan === '' ? undefined : plan,
      });
      window.location.assign('/partner');
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_180px_auto]">
        <div className="space-y-1.5">
          <Label htmlFor="clientName">Client name</Label>
          <Input id="clientName" value={name} onChange={(e) => setName(e.target.value)} placeholder="Client A" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="clientAbn" className="whitespace-nowrap">Business no. (optional)</Label>
          <Input id="clientAbn" value={abn} onChange={(e) => setAbn(e.target.value)} placeholder="ABN, EIN, company no." />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="clientPlan">Plan</Label>
          <select
            id="clientPlan"
            value={plan}
            onChange={(e) => setPlan(e.target.value as PlanCode | '')}
            className="flex h-9 w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--oak-shield)]"
          >
            <option value="">No plan yet</option>
            <option value="ESSENTIAL">Essential</option>
            <option value="PROFESSIONAL">Professional</option>
            <option value="ENTERPRISE">Enterprise</option>
          </select>
        </div>
        <Button variant="primary" disabled={busy || name.length < 2} onClick={submit}>
          {busy ? 'Adding…' : 'Add tenant'}
        </Button>
      </div>
      {err && <p className="text-sm text-red-700">{err}</p>}
    </div>
  );
}
