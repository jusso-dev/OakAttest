'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ConfirmButton } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  addIpAllowlistEntry,
  removeIpAllowlistEntry,
} from '@/app/actions/branding';

type Entry = { id: string; cidr: string; description: string | null };

export function IpAllowlistManager({
  tenantId,
  entries,
}: {
  tenantId: string;
  entries: Entry[];
}) {
  const router = useRouter();
  const [cidr, setCidr] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setError(null);
    setBusy(true);
    try {
      await addIpAllowlistEntry({
        tenantId,
        cidr,
        description: description || undefined,
      });
      setCidr('');
      setDescription('');
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await removeIpAllowlistEntry({ tenantId, entryId: id });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-[200px_1fr_auto]">
        <div className="space-y-1.5">
          <Label htmlFor="cidr">CIDR</Label>
          <Input
            id="cidr"
            placeholder="203.0.113.0/24"
            value={cidr}
            onChange={(e) => setCidr(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="desc">Description</Label>
          <Input
            id="desc"
            placeholder="Sydney office"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="flex items-end">
          <Button variant="primary" disabled={busy || !cidr} onClick={add}>
            Add
          </Button>
        </div>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] text-sm">
        <thead>
          <tr className="border-b border-[var(--field-border)] text-left text-xs uppercase text-slate-600">
            <th className="py-2 pr-3">CIDR</th>
            <th className="py-2 pr-3">Description</th>
            <th className="py-2 pr-3"></th>
          </tr>
        </thead>
        <tbody>
          {entries.length === 0 ? (
            <tr>
              <td colSpan={3} className="py-3 text-sm text-slate-600">
                No restrictions. Any IP may sign in.
              </td>
            </tr>
          ) : (
            entries.map((e) => (
              <tr key={e.id} className="border-b border-[var(--field-border)]">
                <td className="py-2 pr-3 font-mono text-xs">{e.cidr}</td>
                <td className="py-2 pr-3 text-slate-700">{e.description ?? '—'}</td>
                <td className="py-2 pr-3 text-right">
                  <ConfirmButton
                    size="sm"
                    variant="destructive"
                    triggerLabel="Remove"
                    title="Remove IP allowlist entry?"
                    description={`Remove ${e.cidr} from the allowlist? Assessors connecting from this range will be blocked. You can re-add it later.`}
                    confirmLabel="Remove entry"
                    onConfirm={() => remove(e.id)}
                  />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}
