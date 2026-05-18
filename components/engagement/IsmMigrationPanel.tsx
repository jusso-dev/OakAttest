'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { migrateEngagementIsmRevision } from '@/app/actions/engagements';

export function IsmMigrationPanel({
  engagementId,
  currentRevision,
  targetRevision,
  diff,
}: {
  engagementId: string;
  currentRevision: string;
  targetRevision: string;
  diff: { added: number; removed: number; changed: number; unchanged: number };
}) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function migrate() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await migrateEngagementIsmRevision({
        engagementId,
        toRevision: targetRevision,
        reason,
      });
      setMessage(`Migrated: ${result.updated} updated, ${result.added} added, ${result.removed} marked not applicable.`);
      router.refresh();
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm">
      <p className="font-semibold text-amber-950">Newer ISM revision available</p>
      <p className="mt-1 text-amber-900">
        Current {currentRevision}; latest loaded {targetRevision}. Diff: {diff.added} added,{' '}
        {diff.changed} changed, {diff.removed} removed.
      </p>
      <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto]">
        <input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Migration reason"
          className="h-9 rounded-md border border-amber-200 bg-white px-3 text-sm"
        />
        <Button variant="primary" disabled={busy || reason.trim().length < 10} onClick={migrate}>
          {busy ? 'Migrating…' : 'Migrate controls'}
        </Button>
      </div>
      {message && <p className="mt-2 text-xs text-amber-900">{message}</p>}
    </div>
  );
}
