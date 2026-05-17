import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { resolveActiveTenant } from '@/lib/auth/active-tenant';
import { OnboardingForm } from './OnboardingForm';
import { BrandLogo } from '@/components/BrandLogo';

export const metadata = { title: 'Create tenant · OakAttest' };

export default async function OnboardingPage() {
  const session = await getSession();
  if (!session) redirect('/signin');

  const tenant = await resolveActiveTenant(session.user.id);
  if (tenant) redirect('/dashboard');

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-6 py-16">
      <BrandLogo imageClassName="h-10" priority />
      <h1 className="mt-1 text-2xl font-semibold text-slate-900">Create your organisation</h1>
      <p className="mt-2 text-sm text-slate-600">
        This becomes your assessor firm workspace. You can invite colleagues after it is created.
      </p>
      <div className="mt-8">
        <OnboardingForm />
      </div>
    </div>
  );
}
