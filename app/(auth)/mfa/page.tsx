import { Suspense } from 'react';
import { MfaEnrolPanel } from './MfaEnrolPanel';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata = { title: 'Multi-factor authentication · OakAttest' };

export default function MfaPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Set up multi-factor authentication</CardTitle>
        <CardDescription>
          Your workspace may require MFA before you can continue. Scan the QR code with an
          authenticator app, enter a six-digit code, and store the backup codes somewhere safe.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense fallback={<p className="text-sm text-slate-700">Loading MFA setup…</p>}>
          <MfaEnrolPanel />
        </Suspense>
      </CardContent>
    </Card>
  );
}
