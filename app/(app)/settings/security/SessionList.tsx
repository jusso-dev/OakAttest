'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth/client';

type ListedSession = {
  token: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  createdAt?: string | Date;
};

export function SessionList() {
  const [sessions, setSessions] = useState<ListedSession[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyToken, setBusyToken] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    authClient.listSessions().then((result) => {
      if (cancelled) return;
      if (result.error) {
        setError(result.error.message ?? 'Could not list sessions.');
        return;
      }
      setSessions((result.data ?? []) as ListedSession[]);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function revoke(token: string) {
    setBusyToken(token);
    setError(null);
    const result = await authClient.revokeSession({ token });
    setBusyToken(null);
    if (result.error) {
      setError(result.error.message ?? 'Could not revoke that session.');
      return;
    }
    setSessions((current) => current.filter((session) => session.token !== token));
  }

  if (sessions.length === 0 && !error) {
    return <p className="text-sm text-slate-600">No other sessions to show.</p>;
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-red-700">{error}</p>}
      <ul className="divide-y divide-slate-100">
        {sessions.map((session) => (
          <li key={session.token} className="flex items-center justify-between gap-3 py-3">
            <div>
              <p className="text-sm text-slate-900">{session.userAgent || 'Unknown device'}</p>
              <p className="text-xs text-slate-600">{session.ipAddress || 'IP not recorded'}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={busyToken === session.token}
              onClick={() => revoke(session.token)}
            >
              {busyToken === session.token ? 'Revoking…' : 'Revoke'}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
