'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ClientForm, type ClientRecord } from './ClientForm';

type Row = ClientRecord & { missing: string[] };

export function ClientsManager({
  tenantId,
  clients,
  initialEditId,
  canManage,
}: {
  tenantId: string;
  clients: Row[];
  initialEditId?: string;
  canManage: boolean;
}) {
  const [editing, setEditing] = useState<string | null>(initialEditId ?? null);

  return (
    <div className="space-y-6">
      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle>Add a client</CardTitle>
            <CardDescription>
              Clients are reusable across engagements. A complete record (name + primary contact) is
              required before you can start an engagement.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ClientForm tenantId={tenantId} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Clients</CardTitle>
          <CardDescription>{clients.length} client(s).</CardDescription>
        </CardHeader>
        <CardContent>
          {clients.length === 0 ? (
            <p className="text-sm text-slate-600">No clients yet.</p>
          ) : (
            <ul className="divide-y divide-[var(--field-border)]">
              {clients.map((c) => (
                <li key={c.id} className="py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-950">
                        {c.name}
                        {c.missing.length > 0 && (
                          <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                            incomplete
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-slate-600">
                        {c.primaryContactName ?? 'No contact'}
                        {c.primaryContactEmail ? ` · ${c.primaryContactEmail}` : ''}
                        {c.businessNumber ? ` · ${c.businessNumber}` : ''}
                      </p>
                      {c.missing.length > 0 && (
                        <p className="text-xs text-amber-800">Missing: {c.missing.join(', ')}</p>
                      )}
                    </div>
                    {canManage && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditing(editing === c.id ? null : c.id)}
                      >
                        {editing === c.id ? 'Close' : 'Edit'}
                      </Button>
                    )}
                  </div>
                  {canManage && editing === c.id && (
                    <div className="mt-3 rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-3">
                      <ClientForm tenantId={tenantId} client={c} onDone={() => setEditing(null)} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
