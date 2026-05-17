'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  acceptEngagementInvitation,
  acceptTenantInvitation,
} from '@/app/actions/invitations';
import { useSession } from '@/lib/auth/client';
import Link from 'next/link';

export function AcceptForm({ token, kind }: { token: string; kind: 'tenant' | 'engagement' }) {
  const router = useRouter();
  const { data: session } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      if (kind === 'engagement') {
        const result = await acceptEngagementInvitation({ token });
        router.push(`/engagements/${result.engagementId}/overview`);
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

  if (!session) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          You need to sign in or create an account before accepting this invitation.
        </p>
        <div className="flex gap-2">
          <Link
            href={`/signin?next=/invite/${token}`}
            className="inline-flex h-9 items-center justify-center rounded-md bg-[var(--oak-shield)] px-4 text-sm font-medium text-white hover:bg-[var(--oak-shield-hover)]"
          >
            Sign in
          </Link>
          <Link
            href={`/sign-up?next=/invite/${token}`}
            className="inline-flex h-9 items-center justify-center rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-4 text-sm font-medium text-slate-900 hover:bg-[var(--oak-mist)]"
          >
            Create account
          </Link>
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
