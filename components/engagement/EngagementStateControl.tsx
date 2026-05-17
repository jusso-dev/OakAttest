'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { updateEngagementState } from '@/app/actions/engagements';
import type { Phase } from './PhaseStepper';

const PHASE_OPTIONS: Array<{ value: Phase; label: string }> = [
  { value: 'scoping', label: 'Scoping' },
  { value: 'evidence', label: 'Evidence' },
  { value: 'fieldwork', label: 'Fieldwork' },
  { value: 'findings', label: 'Findings' },
  { value: 'certification', label: 'Certification' },
  { value: 'maintenance', label: 'Maintenance' },
];

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'on_hold', label: 'On hold' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived', label: 'Archived' },
] as const;

type EngagementStatus = (typeof STATUS_OPTIONS)[number]['value'];

export function EngagementStateControl({
  engagementId,
  currentPhase,
  currentStatus,
  canEdit,
}: {
  engagementId: string;
  currentPhase: Phase;
  currentStatus: EngagementStatus;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>(currentPhase);
  const [status, setStatus] = useState<EngagementStatus>(currentStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = phase !== currentPhase || status !== currentStatus;

  async function save() {
    if (!changed) return;
    setBusy(true);
    setError(null);
    try {
      await updateEngagementState({ engagementId, phase, status });
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <label className="space-y-1">
          <span className="text-xs font-medium uppercase text-slate-600">Current stage</span>
          <select
            value={phase}
            disabled={!canEdit || busy}
            onChange={(event) => setPhase(event.target.value as Phase)}
            className="flex h-9 w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm text-slate-950 disabled:opacity-70"
          >
            {PHASE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium uppercase text-slate-600">Engagement status</span>
          <select
            value={status}
            disabled={!canEdit || busy}
            onChange={(event) => setStatus(event.target.value as EngagementStatus)}
            className="flex h-9 w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm text-slate-950 disabled:opacity-70"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {canEdit && (
          <div className="flex items-end">
            <Button
              type="button"
              variant="primary"
              disabled={!changed || busy}
              onClick={save}
              className="w-full sm:w-auto"
            >
              {busy ? 'Saving...' : 'Update state'}
            </Button>
          </div>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
