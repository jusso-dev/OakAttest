'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { upsertAuditReadinessProfile } from '@/app/actions/audit-readiness';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AUDIT_PROFILE_STATUSES,
  AUDIT_TYPE_LABELS,
  TRUST_SERVICE_CATEGORIES,
  type AuditType,
} from '@/lib/audit-readiness';

type ProfileValue = {
  auditType: AuditType;
  status: (typeof AUDIT_PROFILE_STATUSES)[number];
  auditFirm: string | null;
  leadAuditor: string | null;
  scopeStatement: string;
  trustServiceCategories: string[];
  periodStart: string | null;
  periodEnd: string | null;
  targetAuditDate: string;
} | null;

export function AuditReadinessProfileForm({
  engagementId,
  allowedTypes,
  profile,
  canManage,
}: {
  engagementId: string;
  allowedTypes: AuditType[];
  profile: ProfileValue;
  canManage: boolean;
}) {
  const router = useRouter();
  const initialType = profile?.auditType ?? allowedTypes[0];
  const [auditType, setAuditType] = useState<AuditType>(initialType);
  const [categories, setCategories] = useState<string[]>(
    profile?.trustServiceCategories ?? ['security'],
  );
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        await upsertAuditReadinessProfile({
          engagementId,
          auditType,
          status: String(form.get('status')) as NonNullable<ProfileValue>['status'],
          auditFirm: String(form.get('auditFirm') ?? ''),
          leadAuditor: String(form.get('leadAuditor') ?? ''),
          scopeStatement: String(form.get('scopeStatement') ?? ''),
          trustServiceCategories: categories as never,
          periodStart: String(form.get('periodStart') ?? '') || null,
          periodEnd: String(form.get('periodEnd') ?? '') || null,
          targetAuditDate: String(form.get('targetAuditDate') ?? ''),
        });
        setMessage('Audit plan saved. Checklist synchronised.');
        router.refresh();
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  const soc2 = auditType.startsWith('soc_2');

  return (
    <form className="space-y-5" onSubmit={submit}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Audit type" htmlFor="auditType">
          <select
            id="auditType"
            value={auditType}
            disabled={!canManage}
            onChange={(event) => setAuditType(event.target.value as AuditType)}
            className="flex h-9 w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm disabled:opacity-60"
          >
            {allowedTypes.map((type) => (
              <option key={type} value={type}>{AUDIT_TYPE_LABELS[type]}</option>
            ))}
          </select>
        </Field>
        <Field label="Readiness status" htmlFor="auditStatus">
          <select
            id="auditStatus"
            name="status"
            defaultValue={profile?.status ?? 'planning'}
            disabled={!canManage}
            className="flex h-9 w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm disabled:opacity-60"
          >
            {AUDIT_PROFILE_STATUSES.map((status) => (
              <option key={status} value={status}>{label(status)}</option>
            ))}
          </select>
        </Field>
        <Field label="Audit firm" htmlFor="auditFirm">
          <Input id="auditFirm" name="auditFirm" defaultValue={profile?.auditFirm ?? ''} disabled={!canManage} />
        </Field>
        <Field label="Lead auditor" htmlFor="leadAuditor">
          <Input id="leadAuditor" name="leadAuditor" defaultValue={profile?.leadAuditor ?? ''} disabled={!canManage} />
        </Field>
        <Field label="Target audit date" htmlFor="targetAuditDate">
          <Input id="targetAuditDate" name="targetAuditDate" type="date" required defaultValue={profile?.targetAuditDate ?? ''} disabled={!canManage} />
        </Field>
        {soc2 ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Period start" htmlFor="periodStart">
              <Input id="periodStart" name="periodStart" type="date" required={auditType === 'soc_2_type_2'} defaultValue={profile?.periodStart ?? ''} disabled={!canManage} />
            </Field>
            <Field label="Period end" htmlFor="periodEnd">
              <Input id="periodEnd" name="periodEnd" type="date" required={auditType === 'soc_2_type_2'} defaultValue={profile?.periodEnd ?? ''} disabled={!canManage} />
            </Field>
          </div>
        ) : null}
      </div>

      {soc2 ? (
        <fieldset disabled={!canManage}>
          <legend className="text-sm font-medium text-slate-900">Trust Services Categories</legend>
          <div className="mt-2 flex flex-wrap gap-3">
            {TRUST_SERVICE_CATEGORIES.map((category) => (
              <label key={category} className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={categories.includes(category)}
                  disabled={category === 'security' || !canManage}
                  onChange={(event) => setCategories((current) =>
                    event.target.checked
                      ? [...current, category]
                      : current.filter((value) => value !== category),
                  )}
                />
                {label(category)}{category === 'security' ? ' (required)' : ''}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <Field label="Audit scope statement" htmlFor="scopeStatement">
        <textarea
          id="scopeStatement"
          name="scopeStatement"
          required
          minLength={20}
          disabled={!canManage}
          defaultValue={profile?.scopeStatement ?? ''}
          placeholder="Included services, entities, locations, processes, environments, interfaces, dependencies, and exclusions."
          className="min-h-32 w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 py-2 text-sm text-slate-950 disabled:opacity-60"
        />
      </Field>

      {canManage ? <Button variant="primary" disabled={pending}>{pending ? 'Saving…' : profile ? 'Save audit plan' : 'Create audit plan'}</Button> : null}
      {message ? <p className="text-sm text-[var(--oak-shield)]">{message}</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </form>
  );
}

function Field({ label: text, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label htmlFor={htmlFor}>{text}</Label>{children}</div>;
}

function label(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}
