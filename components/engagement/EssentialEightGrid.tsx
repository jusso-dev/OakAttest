'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { upsertEssentialEight } from '@/app/actions/essential-eight';

type Strategy = {
  key: string;
  label: string;
  current: string;
  target: string;
  remediationPlan: string;
};

const LEVELS = ['ml0', 'ml1', 'ml2', 'ml3'];

export function EssentialEightGrid({
  engagementId,
  strategies,
}: {
  engagementId: string;
  strategies: Strategy[];
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {strategies.map((s) => (
        <StrategyCard key={s.key} engagementId={engagementId} strategy={s} />
      ))}
    </div>
  );
}

function StrategyCard({
  engagementId,
  strategy,
}: {
  engagementId: string;
  strategy: Strategy;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState(strategy.current);
  const [target, setTarget] = useState(strategy.target);
  const [plan, setPlan] = useState(strategy.remediationPlan);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await upsertEssentialEight({
        engagementId,
        strategy: strategy.key as never,
        currentMaturity: current as never,
        targetMaturity: target as never,
        remediationPlan: plan || undefined,
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-slate-200 bg-white p-4">
      <p className="font-medium text-slate-900">{strategy.label}</p>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <label className="space-y-1">
          <span className="text-xs text-slate-500">Current</span>
          <select
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3"
          >
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs text-slate-500">Target</span>
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3"
          >
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
      </div>
      <textarea
        rows={3}
        placeholder="Remediation plan"
        value={plan}
        onChange={(e) => setPlan(e.target.value)}
        className="mt-3 w-full rounded-md border border-slate-200 bg-white p-2 text-sm"
      />
      <div className="mt-3 flex justify-end">
        <Button size="sm" variant="primary" disabled={busy} onClick={save}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
