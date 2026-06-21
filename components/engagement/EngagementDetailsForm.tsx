'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { updateEngagementDetails } from '@/app/actions/engagements';

// Inline edit for engagement name + reference. Shown to assessor-side editors.
export function EngagementDetailsForm({
  engagementId,
  name: initialName,
  reference: initialReference,
}: {
  engagementId: string;
  name: string;
  reference: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initialName);
  const [reference, setReference] = useState(initialReference ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await updateEngagementDetails({
        engagementId,
        name,
        reference: reference.trim() || undefined,
      });
      setEditing(false);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
        Edit details
      </Button>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="eng-name">Engagement name</Label>
        <Input id="eng-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="eng-ref">Reference</Label>
        <Input
          id="eng-ref"
          value={reference}
          placeholder="ENG-2025-001"
          onChange={(e) => setReference(e.target.value)}
        />
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex gap-2">
        <Button type="button" variant="primary" size="sm" disabled={busy || name.length < 2} onClick={save}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => {
            setName(initialName);
            setReference(initialReference ?? '');
            setError(null);
            setEditing(false);
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
