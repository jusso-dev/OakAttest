'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  acceptEngagementInvitation,
  acceptTenantInvitation,
} from '@/app/actions/invitations';
import { acceptPartnerInvitation } from '@/app/actions/partner-invitations';
import { signUp, useSession } from '@/lib/auth/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Link from 'next/link';

export function AcceptForm({
  token,
  kind,
  email,
  publicSignupEnabled,
}: {
  token: string;
  kind: 'tenant' | 'engagement' | 'partner';
  email: string;
  publicSignupEnabled: boolean;
}) {
  const router = useRouter();
  const { data: session } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      if (kind === 'engagement') {
        const result = await acceptEngagementInvitation({ token });
        router.push(`/engagements/${result.engagementId}/overview`);
      } else if (kind === 'partner') {
        await acceptPartnerInvitation({ token });
        router.push('/partner');
      } else {
        await acceptTenantInvitation({ token });
        router.push('/dashboard');
      }
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function createAccount(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await signUp.email({
      email,
      password,
      name,
      callbackURL: `/invite/${token}`,
    });
    if (result.error) {
      setError(result.error.message ?? 'Could not create the account.');
      setBusy(false);
      return;
    }
    await accept();
  }

  if (!session && !publicSignupEnabled) {
    return (
      <form onSubmit={createAccount} className="space-y-3">
        <p className="text-sm text-slate-600">
          Create a password for this invitation. The email address is locked to the invite.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="invite-email">Email</Label>
          <Input id="invite-email" value={email} readOnly />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="invite-name">Name</Label>
          <Input id="invite-name" value={name} onChange={(event) => setName(event.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="invite-password">Password</Label>
          <Input
            id="invite-password"
            type="password"
            autoComplete="new-password"
            minLength={14}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </div>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? 'Creating…' : 'Create account and accept'}
        </Button>
      </form>
    );
  }

  if (!session) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          You need to sign in{publicSignupEnabled ? ' or create an account' : ''} before accepting
          this invitation.
        </p>
        <div className="flex gap-2">
          <Link
            href={`/signin?next=/invite/${token}`}
            className="inline-flex h-9 items-center justify-center rounded-md bg-[var(--oak-shield)] px-4 text-sm font-medium text-white hover:bg-[var(--oak-shield-hover)]"
          >
            Sign in
          </Link>
          {publicSignupEnabled && (
            <Link
              href={`/sign-up?next=/invite/${token}`}
              className="inline-flex h-9 items-center justify-center rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-4 text-sm font-medium text-slate-900 hover:bg-[var(--oak-mist)]"
            >
              Create account
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-red-700">{error}</p>}
      <Button variant="primary" disabled={busy} onClick={accept}>
        {busy ? 'Accepting…' : 'Accept invitation'}
      </Button>
    </div>
  );
}
