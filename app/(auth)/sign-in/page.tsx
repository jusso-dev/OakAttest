import { Suspense } from 'react';
import Link from 'next/link';
import { connection } from 'next/server';
import { SignInForm } from './SignInForm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { isPublicSignupEnabled } from '@/lib/auth/signup-policy';

export const metadata = { title: 'Sign in · OakAttest' };

export default async function SignInPage() {
  await connection();
  const publicSignupEnabled = isPublicSignupEnabled();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>
          Multi-factor authentication follows the assessor firm workspace policy and may be
          required before access is granted.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Suspense fallback={<p className="text-sm text-slate-700">Loading sign in…</p>}>
          <SignInForm />
        </Suspense>
        {publicSignupEnabled && (
          <p className="text-sm text-slate-600">
            New to OakAttest?{' '}
            <Link href="/sign-up" className="font-medium text-[var(--oak-shield)] hover:underline">
              Create an account
            </Link>
            .
          </p>
        )}
      </CardContent>
    </Card>
  );
}
