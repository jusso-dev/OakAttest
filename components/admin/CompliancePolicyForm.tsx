'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { updateTenantCompliancePolicy } from '@/app/actions/tenants';
import type { Classification } from '@/db/schema/enums';
import type { CompliancePolicy } from '@/lib/compliance/policy';

const CLASSIFICATIONS: Classification[] = [
  'OFFICIAL',
  'OFFICIAL_SENSITIVE',
  'PROTECTED',
  'SECRET',
  'TOP_SECRET',
];

const DEFAULT_MONTHS: Record<Classification, number> = {
  OFFICIAL: 36,
  OFFICIAL_SENSITIVE: 36,
  PROTECTED: 24,
  SECRET: 24,
  TOP_SECRET: 12,
};

export function CompliancePolicyForm({
  tenantId,
  initialPolicy,
}: {
  tenantId: string;
  initialPolicy: CompliancePolicy | null;
}) {
  const router = useRouter();
  const [dueSoonDays, setDueSoonDays] = useState(initialPolicy?.dueSoonDays ?? 60);
  const [months, setMonths] = useState<Record<Classification, number>>({
    ...DEFAULT_MONTHS,
    ...(initialPolicy?.reassessmentMonths ?? {}),
  });
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await updateTenantCompliancePolicy({
        tenantId,
        dueSoonDays,
        reassessmentMonths: months,
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1">
          <span className="text-xs font-medium uppercase text-slate-600">Due-soon days</span>
          <input
            type="number"
            min={1}
            max={365}
            value={dueSoonDays}
            onChange={(event) => setDueSoonDays(Number(event.target.value))}
            className="h-9 w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm"
          />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-5">
        {CLASSIFICATIONS.map((classification) => (
          <label key={classification} className="space-y-1">
            <span className="text-xs font-medium uppercase text-slate-600">
              {classification.replace('_', ':')}
            </span>
            <input
              type="number"
              min={1}
              max={120}
              value={months[classification]}
              onChange={(event) =>
                setMonths((current) => ({
                  ...current,
                  [classification]: Number(event.target.value),
                }))
              }
              className="h-9 w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm"
            />
          </label>
        ))}
      </div>
      <div className="flex justify-end">
        <Button variant="outline" size="sm" disabled={busy} onClick={save}>
          {busy ? 'Saving...' : 'Save policy'}
        </Button>
      </div>
    </div>
  );
}
