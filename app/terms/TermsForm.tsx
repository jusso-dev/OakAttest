'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { acceptDataHandlingTerms } from '@/app/actions/profile';

export function TermsForm() {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await acceptDataHandlingTerms();
      router.push('/dashboard');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-1"
        />
        I acknowledge the data handling and chain-of-custody terms above.
      </label>
      <Button variant="primary" disabled={!agreed || busy} onClick={submit}>
        {busy ? 'Saving…' : 'Acknowledge and continue'}
      </Button>
    </div>
  );
}
