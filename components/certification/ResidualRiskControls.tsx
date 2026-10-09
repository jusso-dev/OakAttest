'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { acceptResidualRisk, updateResidualRisk } from '@/app/actions/residual-risks';

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

type Risk = {
  id: string;
  title: string;
  description: string;
  likelihood: string | null;
  impact: string | null;
  mitigation: string | null;
  acceptedAt: Date | string | null;
};

export function ResidualRiskControls({
  engagementId,
  risk,
}: {
  engagementId: string;
  risk: Risk;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(risk.title);
  const [description, setDescription] = useState(risk.description);
  const [mitigation, setMitigation] = useState(risk.mitigation ?? '');
  const [likelihood, setLikelihood] = useState(risk.likelihood ?? '');
  const [impact, setImpact] = useState(risk.impact ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accepted = Boolean(risk.acceptedAt);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await updateResidualRisk({
        engagementId,
        riskId: risk.id,
        title,
        description,
        mitigation: mitigation || undefined,
        likelihood: likelihood || undefined,
        impact: impact || undefined,
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  }

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      await acceptResidualRisk({
        engagementId,
        riskId: risk.id,
        mitigation: mitigation || undefined,
        likelihood: likelihood || undefined,
        impact: impact || undefined,
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Accept failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 space-y-2 border-t border-[var(--field-border)] pt-3">
      {accepted ? (
        <p className="text-xs text-[var(--oak-shield)]">Accepted</p>
      ) : (
        <p className="text-xs text-amber-700">Unaccepted</p>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`rr-title-${risk.id}`}>Title</Label>
          <Input
            id={`rr-title-${risk.id}`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={busy}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`rr-mit-${risk.id}`}>Mitigation</Label>
          <Input
            id={`rr-mit-${risk.id}`}
            value={mitigation}
            onChange={(e) => setMitigation(e.target.value)}
            disabled={busy}
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`rr-desc-${risk.id}`}>Description</Label>
        <textarea
          id={`rr-desc-${risk.id}`}
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={busy}
          className="w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-2 text-sm"
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`rr-like-${risk.id}`}>Likelihood</Label>
          <select
            id={`rr-like-${risk.id}`}
            value={likelihood}
            onChange={(e) => setLikelihood(e.target.value)}
            disabled={busy}
            className="flex h-9 w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm"
          >
            <option value="">Select likelihood</option>
            {LIKELIHOOD.map((option) => (
              <option key={option.value} value={option.label}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`rr-impact-${risk.id}`}>Impact</Label>
          <select
            id={`rr-impact-${risk.id}`}
            value={impact}
            onChange={(e) => setImpact(e.target.value)}
            disabled={busy}
            className="flex h-9 w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm"
          >
            <option value="">Select impact</option>
            {IMPACT.map((option) => (
              <option key={option.value} value={option.label}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error && <p className="text-xs text-red-700">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={save}>
          {busy ? 'Saving…' : 'Update'}
        </Button>
        {!accepted && (
          <Button size="sm" variant="primary" disabled={busy} onClick={accept}>
            Accept
          </Button>
        )}
      </div>
    </div>
  );
}
