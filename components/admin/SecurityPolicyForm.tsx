'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { updateTenantSecurityPolicy } from '@/app/actions/tenants';

export function SecurityPolicyForm({
  tenantId,
  initialMode,
  initialGraceDays,
}: {
  tenantId: string;
  initialMode: string;
  initialGraceDays: number;
}) {
  const router = useRouter();
  const [mode, setMode] = useState(initialMode);
  const [graceDays, setGraceDays] = useState(initialGraceDays);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await updateTenantSecurityPolicy({
        tenantId,
        mfaMode: mode as never,
        mfaGracePeriodDays: graceDays,
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_140px_auto]">
      <select
        value={mode}
        onChange={(event) => setMode(event.target.value)}
        className="h-9 rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm"
      >
        <option value="optional">Optional</option>
        <option value="assessor_required">Assessor roles required</option>
        <option value="all_users_required">All users required</option>
      </select>
      <input
        type="number"
        min={0}
        max={30}
        value={graceDays}
        onChange={(event) => setGraceDays(Number(event.target.value))}
        className="h-9 rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm"
        aria-label="MFA grace period in days"
      />
      <Button variant="primary" disabled={busy} onClick={save}>
        {busy ? 'Saving…' : 'Save policy'}
      </Button>
    </div>
  );
}
