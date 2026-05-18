'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { createReassessmentTask } from '@/app/actions/tasks';

export function ReassessmentTaskButton({
  engagementId,
  dueDate,
}: {
  engagementId: string;
  dueDate: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function createTask() {
    setBusy(true);
    try {
      await createReassessmentTask({ engagementId, dueDate });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button size="sm" variant="outline" disabled={busy} onClick={createTask}>
      {busy ? 'Creating…' : 'Create task'}
    </Button>
  );
}
