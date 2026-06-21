'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClient, updateClient } from '@/app/actions/clients';

export type ClientRecord = {
  id: string;
  name: string;
  businessNumber: string | null;
  primaryContactName: string | null;
  primaryContactEmail: string | null;
  address: string | null;
  notes: string | null;
};

export function ClientForm({
  tenantId,
  client,
  onDone,
}: {
  tenantId: string;
  client?: ClientRecord;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(client?.name ?? '');
  const [businessNumber, setBusinessNumber] = useState(client?.businessNumber ?? '');
  const [contactName, setContactName] = useState(client?.primaryContactName ?? '');
  const [contactEmail, setContactEmail] = useState(client?.primaryContactEmail ?? '');
  const [address, setAddress] = useState(client?.address ?? '');
  const [notes, setNotes] = useState(client?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const payload = {
        tenantId,
        name,
        businessNumber: businessNumber || undefined,
        primaryContactName: contactName || undefined,
        primaryContactEmail: contactEmail || undefined,
        address: address || undefined,
        notes: notes || undefined,
      };
      if (client) await updateClient({ id: client.id, ...payload });
      else await createClient(payload);
      if (!client) {
        setName('');
        setBusinessNumber('');
        setContactName('');
        setContactEmail('');
        setAddress('');
        setNotes('');
      }
      onDone?.();
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="cl-name">Client name</Label>
          <Input id="cl-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cl-bn">Business number (optional)</Label>
          <Input id="cl-bn" placeholder="ABN, EIN, company no." value={businessNumber} onChange={(e) => setBusinessNumber(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cl-cn">Primary contact name</Label>
          <Input id="cl-cn" value={contactName} onChange={(e) => setContactName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cl-ce">Primary contact email</Label>
          <Input id="cl-ce" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="cl-addr">Address (optional)</Label>
          <Input id="cl-addr" value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="cl-notes">Notes (optional)</Label>
          <textarea
            id="cl-notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="flex w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-2 text-sm text-slate-950"
          />
        </div>
      </div>
      {err && <p className="text-sm text-red-700">{err}</p>}
      <div className="flex gap-2">
        <Button variant="primary" size="sm" disabled={busy || name.trim().length < 2} onClick={submit}>
          {busy ? 'Saving…' : client ? 'Save client' : 'Create client'}
        </Button>
        {client && onDone && (
          <Button variant="outline" size="sm" disabled={busy} onClick={onDone}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
