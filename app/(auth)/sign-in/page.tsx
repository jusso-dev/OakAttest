import { Suspense } from 'react';
import Link from 'next/link';
import { SignInForm } from './SignInForm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata = { title: 'Sign in · OakAttest' };

export default function SignInPage() {
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
        <p className="text-sm text-slate-600">
          New to OakAttest?{' '}
          <Link href="/sign-up" className="font-medium text-[var(--oak-shield)] hover:underline">
            Create an account
          </Link>
          .
        </p>
      </CardContent>
    </Card>
  );
}
