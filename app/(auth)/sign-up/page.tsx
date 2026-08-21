import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { SignUpForm } from './SignUpForm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { isPublicSignupEnabled } from '@/lib/auth/signup-policy';

export const metadata = { title: 'Create account · OakAttest' };

export default async function SignUpPage() {
  await connection();
  if (!isPublicSignupEnabled()) redirect('/sign-in');

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create your account</CardTitle>
        <CardDescription>
          Create your user account and organisation workspace. You will enrol a second
          factor from account settings when you are ready.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense fallback={<p className="text-sm text-slate-700">Loading account setup…</p>}>
          <SignUpForm />
        </Suspense>
      </CardContent>
    </Card>
  );
}
