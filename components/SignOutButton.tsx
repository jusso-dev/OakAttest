'use client';

import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { signOut } from '@/lib/auth/client';

export function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    await signOut();
    router.replace('/signin');
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className="mt-3 inline-flex h-8 w-full items-center justify-center gap-2 rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-xs font-medium text-slate-800 transition-colors hover:bg-[var(--oak-mist)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--oak-shield)]"
    >
      <LogOut className="h-3.5 w-3.5" />
      Sign out
    </button>
  );
}
