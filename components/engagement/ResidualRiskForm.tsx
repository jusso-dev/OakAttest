'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { addResidualRisk } from '@/app/actions/residual-risks';
import { useUnsavedChanges } from '@/components/engagement/UnsavedChangesGuard';

const LIKELIHOOD = [
  { value: 1, label: '1 Rare' },
  { value: 2, label: '2 Unlikely' },
  { value: 3, label: '3 Possible' },
  { value: 4, label: '4 Likely' },
  { value: 5, label: '5 Almost certain' },
];

const IMPACT = [
  { value: 1, label: '1 Insignificant' },
  { value: 2, label: '2 Minor' },
  { value: 3, label: '3 Moderate' },
  { value: 4, label: '4 Major' },
  { value: 5, label: '5 Severe' },
];

export function ResidualRiskForm({ engagementId }: { engagementId: string }) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [mitigation, setMitigation] = useState('');
  const [likelihood, setLikelihood] = useState('');
  const [impact, setImpact] = useState('');
  const [busy, setBusy] = useState(false);
  useUnsavedChanges(
    Boolean(title.trim() || description.trim() || mitigation.trim() || likelihood || impact),
    'Residual risk',
  );

  const score = Number(likelihood.split(' ')[0]) * Number(impact.split(' ')[0]);
  const rating = Number.isFinite(score) && score > 0 ? riskRating(score) : null;

  async function submit() {
    if (title.length < 2 || description.length < 10 || !likelihood || !impact) return;
    setBusy(true);
    try {
      await addResidualRisk({
        engagementId,
        title,
        description,
        mitigation: mitigation || undefined,
        likelihood,
        impact,
      });
      setTitle('');
      setDescription('');
      setMitigation('');
      setLikelihood('');
      setImpact('');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 space-y-2 rounded-md border border-[var(--field-border)] bg-[var(--oak-mist)] p-3">
      <p className="text-xs font-medium uppercase text-slate-600">Add risk</p>
      <p className="text-sm text-slate-700">
        Use a 5x5 matrix. Write the risk as cause, event, and consequence. Capture the
        treatment, owner, or accepted residual exposure in the mitigation field.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="rrTitle">Title</Label>
        <Input id="rrTitle" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="rrDesc">Description</Label>
        <textarea
          id="rrDesc"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-2 text-sm"
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="rrLikelihood">Likelihood</Label>
          <select
            id="rrLikelihood"
            value={likelihood}
            onChange={(event) => setLikelihood(event.target.value)}
            className="flex h-9 w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm text-slate-950"
          >
            <option value="">Select likelihood</option>
            {LIKELIHOOD.map((option) => (
              <option key={option.value} value={option.label}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rrImpact">Impact</Label>
          <select
            id="rrImpact"
            value={impact}
            onChange={(event) => setImpact(event.target.value)}
            className="flex h-9 w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm text-slate-950"
          >
            <option value="">Select impact</option>
            {IMPACT.map((option) => (
              <option key={option.value} value={option.label}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-3">
          <p className="text-xs font-medium uppercase text-slate-600">Residual rating</p>
          <p className="mt-1 text-sm font-semibold text-slate-950">
            {rating ? `${score} ${rating}` : 'Select likelihood and impact'}
          </p>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="rrMit">Mitigation</Label>
        <textarea
          id="rrMit"
          rows={2}
          value={mitigation}
          onChange={(e) => setMitigation(e.target.value)}
          className="w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-2 text-sm"
        />
      </div>
      <div className="flex justify-end">
        <Button size="sm" variant="primary" disabled={busy} onClick={submit}>
          {busy ? 'Saving…' : 'Add risk'}
        </Button>
      </div>
    </div>
  );
}

function riskRating(score: number) {
  if (score >= 20) return 'Extreme';
  if (score >= 12) return 'High';
  if (score >= 6) return 'Medium';
  return 'Low';
}
