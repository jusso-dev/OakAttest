'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient } from '@/lib/auth/client';

type EnrolState =
  | { step: 'start' }
  | { step: 'verify'; uri: string; backupCodes: string[] }
  | { step: 'done' };

export function MfaEnrolPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next');
  const [state, setState] = useState<EnrolState>({ step: 'start' });
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function start() {
    setError(null);
    setBusy(true);
    const result = await authClient.twoFactor.enable({ password });
    setBusy(false);
    if (result.error) {
      setError(result.error.message ?? 'Could not start MFA enrolment');
      return;
    }
    const data = result.data as { totpURI: string; backupCodes: string[] };
    setState({ step: 'verify', uri: data.totpURI, backupCodes: data.backupCodes });
  }

  async function verify() {
    setError(null);
    setBusy(true);
    const result = await authClient.twoFactor.verifyTotp({ code });
    setBusy(false);
    if (result.error) {
      setError(result.error.message ?? 'Invalid code');
      return;
    }
    setState({ step: 'done' });
    router.push(next?.startsWith('/') ? next : '/dashboard');
  }

  if (state.step === 'start') {
    return (
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="password">Confirm your password</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <Button variant="primary" disabled={busy || password.length < 14} onClick={start}>
          {busy ? 'Generating…' : 'Begin enrolment'}
        </Button>
      </div>
    );
  }

  if (state.step === 'verify') {
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-700">
          Add this account to your authenticator app. The setup URI is below; most apps will
          accept it directly, or you can paste the secret from inside the URI.
        </p>
        <pre className="overflow-x-auto rounded bg-[var(--oak-mist-strong)] p-3 text-xs">{state.uri}</pre>
        <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-medium">Backup codes — save these now.</p>
          <ul className="mt-2 grid grid-cols-2 gap-1 font-mono text-xs">
            {state.backupCodes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="code">Six-digit code</Label>
          <Input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <Button variant="primary" disabled={busy || code.length !== 6} onClick={verify}>
          {busy ? 'Verifying…' : 'Verify and finish'}
        </Button>
      </div>
    );
  }

  return <p className="text-sm text-slate-700">MFA enrolment complete. Redirecting…</p>;
}
