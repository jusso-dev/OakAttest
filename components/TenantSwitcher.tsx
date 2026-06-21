'use client';

import { useState } from 'react';
import { setActiveTenant } from '@/app/actions/active-tenant';

// Sidebar tenant switcher. Lists every tenant the user can act in (direct
// memberships + MSP-managed + all tenants for the platform owner). Selecting one
// switches the active-tenant context via the server action (which redirects).
export function TenantSwitcher({
  tenants,
  activeTenantId,
}: {
  tenants: Array<{ id: string; name: string; direct: boolean }>;
  activeTenantId: string;
}) {
  const [busy, setBusy] = useState(false);

  const active = tenants.find((t) => t.id === activeTenantId);
  if (tenants.length <= 1) {
    return <p className="mt-3 truncate text-sm font-semibold text-slate-950">{active?.name ?? '—'}</p>;
  }

  return (
    <select
      aria-label="Switch workspace"
      value={activeTenantId}
      disabled={busy}
      onChange={async (e) => {
        const next = e.target.value;
        if (next === activeTenantId) return;
        setBusy(true);
        try {
          await setActiveTenant({ tenantId: next });
        } catch {
          setBusy(false);
        }
      }}
      className="mt-3 w-full truncate rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-2 py-1.5 text-sm font-semibold text-slate-950 disabled:opacity-70"
    >
      {tenants.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
          {t.direct ? '' : ' (managed)'}
        </option>
      ))}
    </select>
  );
}
