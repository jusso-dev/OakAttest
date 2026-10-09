'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient } from '@/lib/auth/client';

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const origin = window.location.origin;
    const result = await authClient.requestPasswordReset({
      email,
      redirectTo: `${origin}/reset-password`,
    });
    setBusy(false);
    if (result.error) {
      setError(result.error.message ?? 'Could not send the reset email.');
      return;
    }
    setMessage('If an account exists for that email, a reset link is on its way.');
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="email">Work email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {message && <p className="text-sm text-slate-700">{message}</p>}
      <Button type="submit" variant="primary" disabled={busy} className="w-full">
        {busy ? 'Sending…' : 'Send reset link'}
      </Button>
    </form>
  );
}
