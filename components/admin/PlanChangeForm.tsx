'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { setTenantPlan } from '@/app/actions/partners';

type PlanCode = 'ESSENTIAL' | 'PROFESSIONAL' | 'ENTERPRISE';

const PLANS: Array<{ code: PlanCode; label: string }> = [
  { code: 'ESSENTIAL', label: 'Essential' },
  { code: 'PROFESSIONAL', label: 'Professional' },
  { code: 'ENTERPRISE', label: 'Enterprise' },
];

export function PlanChangeForm({
  tenantId,
  current,
}: {
  tenantId: string;
  current?: string | null;
}) {
  const [plan, setPlan] = useState<PlanCode>((current as PlanCode) ?? 'ESSENTIAL');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      await setTenantPlan({ tenantId, planCode: plan });
      setMsg('Updated');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={plan}
        onChange={(e) => setPlan(e.target.value as PlanCode)}
        className="flex h-9 rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--oak-shield)]"
      >
        {PLANS.map((p) => (
          <option key={p.code} value={p.code}>
            {p.label}
          </option>
        ))}
      </select>
      <Button variant="primary" size="sm" disabled={busy} onClick={submit}>
        {busy ? 'Saving…' : 'Set plan'}
      </Button>
      {msg && <span className="text-xs text-slate-600">{msg}</span>}
      {err && <span className="text-xs text-red-700">{err}</span>}
    </div>
  );
}
