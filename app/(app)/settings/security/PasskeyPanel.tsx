'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth/client';

export function PasskeyPanel() {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function addPasskey() {
    setBusy(true);
    setError(null);
    setMessage(null);
    const result = await authClient.passkey.addPasskey({ name: 'This device' });
    setBusy(false);
    if (result.error) {
      setError(result.error.message ?? 'Could not register a passkey.');
      return;
    }
    setMessage('Passkey registered.');
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-red-700">{error}</p>}
      {message && <p className="text-sm text-slate-700">{message}</p>}
      <Button type="button" variant="primary" disabled={busy} onClick={addPasskey}>
        {busy ? 'Waiting for the device…' : 'Add a passkey'}
      </Button>
    </div>
  );
}
