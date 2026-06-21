'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { setActiveTenant } from '@/app/actions/active-tenant';

// "Drop into" a client tenant: switches the active tenant and lands on the
// tenant dashboard. The server action validates access and redirects.
export function DropIntoButton({
  tenantId,
  label = 'Manage',
}: {
  tenantId: string;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true);
    try {
      await setActiveTenant({ tenantId });
      // setActiveTenant redirects server-side; nothing to do on success.
    } catch {
      // Redirect throws control-flow internally; only real errors land here.
      setBusy(false);
    }
  }

  return (
    <Button variant="outline" disabled={busy} onClick={go}>
      {busy ? 'Entering…' : label}
    </Button>
  );
}
