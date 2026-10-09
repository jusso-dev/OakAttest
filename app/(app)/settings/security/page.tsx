import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requirePageSession } from '@/lib/auth/session';
import { PasskeyPanel } from './PasskeyPanel';
import { SessionList } from './SessionList';

export const metadata = { title: 'Sessions · OakAttest' };

export default async function SecuritySettingsPage() {
  await requirePageSession();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <p className="text-xs uppercase text-slate-600">Account</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Sessions</h1>
        <p className="mt-2 text-sm text-slate-600">
          Revoke a browser session that should no longer be able to sign in.
        </p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Active sessions</CardTitle>
          <CardDescription>Revoking the current session signs that browser out.</CardDescription>
        </CardHeader>
        <CardContent>
          <SessionList />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Passkeys</CardTitle>
          <CardDescription>Register a device passkey for this account.</CardDescription>
        </CardHeader>
        <CardContent>
          <PasskeyPanel />
        </CardContent>
      </Card>
    </div>
  );
}
