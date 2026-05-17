import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { resolveActiveTenant } from '@/lib/auth/active-tenant';
import { OnboardingForm } from './OnboardingForm';

export const metadata = { title: 'Create tenant · OakAttest' };

export default async function OnboardingPage() {
  const session = await getSession();
  if (!session) redirect('/sign-in');

  const tenant = await resolveActiveTenant(session.user.id);
  if (tenant) redirect('/dashboard');

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-6 py-16">
      <p className="text-xs uppercase tracking-[0.22em] text-slate-500">OakAttest</p>
      <h1 className="mt-1 text-2xl font-semibold text-slate-900">Create your assessor firm</h1>
      <p className="mt-2 text-sm text-slate-600">
        A tenant represents your IRAP assessor firm. You can invite colleagues afterwards.
      </p>
      <div className="mt-8">
        <OnboardingForm />
      </div>
    </div>
  );
}
