'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { updateAuditReadinessRequirement } from '@/app/actions/audit-readiness';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AUDIT_REQUIREMENT_STATUSES, type AuditRequirementStatus } from '@/lib/audit-readiness';

export type AuditRequirementValue = {
  id: string;
  category: string;
  title: string;
  guidance: string;
  status: AuditRequirementStatus;
  notes: string | null;
  ownerUserId: string | null;
  dueDate: string | null;
  updatedAt: string;
  evidenceItemIds: string[];
};

export function AuditRequirementChecklist({ engagementId, requirements, members, evidenceOptions, canManage }: {
  engagementId: string;
  requirements: AuditRequirementValue[];
  members: Array<{ userId: string; label: string }>;
  evidenceOptions: Array<{ id: string; label: string; accepted: boolean }>;
  canManage: boolean;
}) {
  const categories = Array.from(new Set(requirements.map((item) => item.category)));
  return <div className="space-y-6">
    {categories.map((category) => (
      <section key={category} className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">{category}</h3>
        {requirements.filter((item) => item.category === category).map((item) => (
          <RequirementRow key={item.id} engagementId={engagementId} item={item} members={members} evidenceOptions={evidenceOptions} canManage={canManage} />
        ))}
      </section>
    ))}
  </div>;
}

function RequirementRow({ engagementId, item, members, evidenceOptions, canManage }: {
  engagementId: string;
  item: AuditRequirementValue;
  members: Array<{ userId: string; label: string }>;
  evidenceOptions: Array<{ id: string; label: string; accepted: boolean }>;
  canManage: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(item.status);
  const [evidenceItemIds, setEvidenceItemIds] = useState(item.evidenceItemIds);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setMessage(null);
    startTransition(async () => {
      try {
        await updateAuditReadinessRequirement({
          engagementId,
          requirementId: item.id,
          status,
          ownerUserId: String(form.get('ownerUserId') ?? '') || null,
          dueDate: String(form.get('dueDate') ?? '') || null,
          notes: String(form.get('notes') ?? ''),
          evidenceItemIds,
        });
        setMessage('Saved');
        router.refresh();
      } catch (err) {
        setMessage((err as Error).message);
      }
    });
  }

  return <form onSubmit={submit} className="rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-4">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div className="max-w-3xl">
        <h4 className="text-sm font-semibold text-slate-950">{item.title}</h4>
        <p className="mt-1 text-sm leading-6 text-slate-700">{item.guidance}</p>
        <p className="mt-1 text-xs text-slate-500">Updated {new Date(item.updatedAt).toLocaleString('en-AU')}</p>
      </div>
      <select value={status} disabled={!canManage} onChange={(event) => setStatus(event.target.value as AuditRequirementStatus)} className="h-9 rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm disabled:opacity-60">
        {AUDIT_REQUIREMENT_STATUSES.map((value) => <option key={value} value={value}>{label(value)}</option>)}
      </select>
    </div>
    <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
      <select name="ownerUserId" defaultValue={item.ownerUserId ?? ''} disabled={!canManage} aria-label={`Owner for ${item.title}`} className="h-9 rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm disabled:opacity-60">
        <option value="">Unassigned</option>
        {members.map((member) => <option key={member.userId} value={member.userId}>{member.label}</option>)}
      </select>
      <Input name="dueDate" type="date" defaultValue={item.dueDate ?? ''} disabled={!canManage} aria-label={`Due date for ${item.title}`} />
    </div>
    <textarea name="notes" defaultValue={item.notes ?? ''} disabled={!canManage} placeholder="Evidence references, gaps, decisions, or auditor notes" className="mt-3 min-h-20 w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 py-2 text-sm disabled:opacity-60" />
    <details className="mt-3 rounded-md border border-[var(--field-border)] bg-[var(--oak-mist)] p-3">
      <summary className="cursor-pointer text-sm font-medium text-slate-900">Linked evidence ({evidenceItemIds.length})</summary>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {evidenceOptions.length === 0 ? <p className="text-xs text-slate-600">No finalised evidence available.</p> : evidenceOptions.map((evidence) => (
          <label key={evidence.id} className="flex items-start gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={evidenceItemIds.includes(evidence.id)}
              disabled={!canManage}
              onChange={(event) => setEvidenceItemIds((current) =>
                event.target.checked
                  ? [...current, evidence.id]
                  : current.filter((id) => id !== evidence.id),
              )}
            />
            <span>{evidence.label}{evidence.accepted ? '' : ' · review pending'}</span>
          </label>
        ))}
      </div>
    </details>
    {canManage ? <div className="mt-3 flex items-center gap-3"><Button size="sm" variant="outline" disabled={pending}>{pending ? 'Saving…' : 'Save requirement'}</Button>{message ? <span className={message === 'Saved' ? 'text-xs text-[var(--oak-shield)]' : 'text-xs text-red-700'}>{message}</span> : null}</div> : null}
  </form>;
}

function label(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}
