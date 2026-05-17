'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { reviewEvidence } from '@/app/actions/evidence';

export function EvidenceReviewActions({
  engagementId,
  evidenceItemId,
}: {
  engagementId: string;
  evidenceItemId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function review(status: 'accepted' | 'insufficient' | 'rejected') {
    setBusy(true);
    try {
      await reviewEvidence({ engagementId, evidenceItemId, status });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex justify-end gap-1">
      <Button size="sm" variant="outline" disabled={busy} onClick={() => review('insufficient')}>
        Insufficient
      </Button>
      <Button size="sm" variant="destructive" disabled={busy} onClick={() => review('rejected')}>
        Reject
      </Button>
      <Button size="sm" variant="primary" disabled={busy} onClick={() => review('accepted')}>
        Accept
      </Button>
    </div>
  );
}
