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
          Multi-factor authentication is optional for self-installed instances and strongly
          recommended for assessor-side users.
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
