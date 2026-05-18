'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { migrateEngagementIsmRevision } from '@/app/actions/engagements';
import type { IsmRevisionDiff } from '@/lib/ism/compare';

export function IsmMigrationPanel({
  engagementId,
  currentRevision,
  targetRevision,
  diff,
}: {
  engagementId: string;
  currentRevision: string;
  targetRevision: string;
  diff: IsmRevisionDiff;
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
      <div className="mt-3 grid gap-2 md:grid-cols-3">
        <DiffList title="Added controls" items={diff.items.added.map((item) => item.controlId)} />
        <DiffList
          title="Changed controls"
          items={diff.items.changed.map((item) => `${item.controlId} (${item.changedFields.join(', ')})`)}
        />
        <DiffList title="Removed controls" items={diff.items.removed.map((item) => item.controlId)} />
      </div>
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

function DiffList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-md border border-amber-200 bg-white/70 p-2">
      <p className="text-xs font-semibold uppercase text-amber-950">{title}</p>
      {items.length === 0 ? (
        <p className="mt-1 text-xs text-amber-900">None</p>
      ) : (
        <ul className="mt-1 space-y-1 text-xs text-amber-900">
          {items.slice(0, 8).map((item) => (
            <li key={item} className="truncate">{item}</li>
          ))}
          {items.length > 8 && <li>{items.length - 8} more</li>}
        </ul>
      )}
    </div>
  );
}
