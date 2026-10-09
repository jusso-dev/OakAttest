import { Suspense } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MfaChallengeForm } from './MfaChallengeForm';

export const metadata = { title: 'Authenticator code · OakAttest' };

export default function MfaChallengePage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Enter your authenticator code</CardTitle>
        <CardDescription>
          Password and magic-link sign-in stop here until the one-time code succeeds.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense fallback={<p className="text-sm text-slate-700">Loading challenge…</p>}>
          <MfaChallengeForm />
        </Suspense>
      </CardContent>
    </Card>
  );
}
