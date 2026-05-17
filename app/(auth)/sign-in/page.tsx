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
          Multi-factor authentication is mandatory for assessor-side users.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <SignInForm />
        <p className="text-sm text-slate-500">
          New to OakAttest?{' '}
          <Link href="/sign-up" className="font-medium text-teal-900 hover:underline">
            Create an account
          </Link>
          .
        </p>
      </CardContent>
    </Card>
  );
}
