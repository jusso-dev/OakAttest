'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { addResidualRisk } from '@/app/actions/residual-risks';

export function ResidualRiskForm({ engagementId }: { engagementId: string }) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [mitigation, setMitigation] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (title.length < 2 || description.length < 10) return;
    setBusy(true);
    try {
      await addResidualRisk({ engagementId, title, description, mitigation: mitigation || undefined });
      setTitle('');
      setDescription('');
      setMitigation('');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Add risk</p>
      <div className="space-y-1.5">
        <Label htmlFor="rrTitle">Title</Label>
        <Input id="rrTitle" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="rrDesc">Description</Label>
        <textarea
          id="rrDesc"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded-md border border-slate-200 bg-white p-2 text-sm"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="rrMit">Mitigation</Label>
        <textarea
          id="rrMit"
          rows={2}
          value={mitigation}
          onChange={(e) => setMitigation(e.target.value)}
          className="w-full rounded-md border border-slate-200 bg-white p-2 text-sm"
        />
      </div>
      <div className="flex justify-end">
        <Button size="sm" variant="primary" disabled={busy} onClick={submit}>
          {busy ? 'Saving…' : 'Add risk'}
        </Button>
      </div>
    </div>
  );
}
