'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { createEngagement } from '@/app/actions/engagements';

const schema = z.object({
  name: z.string().min(2).max(200),
  reference: z.string().max(60).optional(),
  // ISM-only fields; defaulted and hidden for non-classification frameworks.
  classification: z.enum(['OFFICIAL', 'OFFICIAL_SENSITIVE', 'PROTECTED', 'SECRET', 'TOP_SECRET']),
  assessmentType: z.enum(['standard', 'cloud_irap']),
  cloudProvider: z.enum(['none', 'aws', 'azure', 'gcp', 'other']),
  frameworkKey: z.string().min(1),
  frameworkRevision: z.string().min(1),
  clientId: z.string().uuid({ message: 'Select a client' }),
  systemName: z.string().min(2),
  systemDescription: z.string().max(2000).optional(),
  systemEnvironment: z.string().optional(),
});

type FormInput = z.input<typeof schema>;
type FormValues = z.output<typeof schema>;

const SELECT_CLASS =
  'flex h-9 w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm text-slate-950';

type FrameworkOption = { key: string; label: string; scopingMode: string };
type ClientOption = { id: string; name: string; missing: string[] };

export function NewEngagementForm({
  tenantId,
  frameworks,
  revisions,
  clients,
}: {
  tenantId: string;
  frameworks: FrameworkOption[];
  revisions: Array<{ revision: string; controlCount: number; frameworkKey: string }>;
  clients: ClientOption[];
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const defaultFrameworkKey = revisions[0]?.frameworkKey ?? frameworks[0]?.key ?? 'ism';
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      classification: 'PROTECTED',
      assessmentType: 'standard',
      cloudProvider: 'none',
      frameworkKey: defaultFrameworkKey,
      frameworkRevision: revisions.find((r) => r.frameworkKey === defaultFrameworkKey)?.revision,
      clientId: clients.find((c) => c.missing.length === 0)?.id ?? clients[0]?.id,
    },
  });

  const selectedClientId = watch('clientId');
  const selectedClient = clients.find((c) => c.id === selectedClientId);
  const selectedFrameworkKey = watch('frameworkKey');
  const frameworkRevisions = revisions.filter((r) => r.frameworkKey === selectedFrameworkKey);
  // Only frameworks with at least one imported catalogue revision are selectable.
  const selectableFrameworks = frameworks.filter((f) =>
    revisions.some((r) => r.frameworkKey === f.key),
  );
  const selectedFramework = frameworks.find((f) => f.key === selectedFrameworkKey);
  // Classification + IRAP fields only apply to classification-scoped frameworks
  // (the Australian ISM). Other frameworks scope by baseline or selection.
  const isClassified = selectedFramework?.scopingMode === 'classification';

  // Keep the revision valid for the selected framework, and reset ISM-only
  // fields to defaults when switching to a non-classification framework.
  useEffect(() => {
    const current = watch('frameworkRevision');
    if (!frameworkRevisions.some((r) => r.revision === current)) {
      setValue('frameworkRevision', frameworkRevisions[0]?.revision ?? '');
    }
    if (!isClassified) {
      setValue('classification', 'OFFICIAL');
      setValue('assessmentType', 'standard');
      setValue('cloudProvider', 'none');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFrameworkKey]);

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      const result = await createEngagement({
        tenantId,
        name: values.name,
        reference: values.reference,
        classification: values.classification,
        assessmentType: values.assessmentType,
        cloudProvider: values.cloudProvider,
        frameworkKey: values.frameworkKey,
        frameworkRevision: values.frameworkRevision,
        clientId: values.clientId,
        system: {
          name: values.systemName,
          description: values.systemDescription,
          environment: values.systemEnvironment,
        },
      });
      router.push(`/engagements/${result.id}/scope`);
      router.refresh();
    } catch (err) {
      setServerError((err as Error).message);
    }
  }

  const scopeNote = isClassified
    ? null
    : selectedFramework?.scopingMode === 'baseline_profile'
      ? 'All catalogue controls are added to the engagement. Refine the baseline during scoping.'
      : 'All controls are added to the engagement; mark each as in or out of scope (Statement of Applicability) during scoping.';

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Engagement details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="name">Engagement name</Label>
            <Input id="name" {...register('name')} />
            {errors.name && <p className="text-xs text-red-700">{errors.name.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reference">Reference (optional)</Label>
            <Input id="reference" placeholder="ENG-2025-001" {...register('reference')} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="frameworkKey">Compliance framework</Label>
            <select id="frameworkKey" className={SELECT_CLASS} {...register('frameworkKey')}>
              {selectableFrameworks.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="frameworkRevision">Framework revision</Label>
            <select id="frameworkRevision" className={SELECT_CLASS} {...register('frameworkRevision')}>
              {frameworkRevisions.map((r) => (
                <option key={r.revision} value={r.revision}>
                  {r.revision} — {r.controlCount} controls
                </option>
              ))}
            </select>
          </div>

          {/* Australian ISM-specific scoping. Hidden for other frameworks. */}
          {isClassified && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="classification">Classification</Label>
                <select id="classification" className={SELECT_CLASS} {...register('classification')}>
                  <option value="OFFICIAL">OFFICIAL</option>
                  <option value="OFFICIAL_SENSITIVE">OFFICIAL:Sensitive</option>
                  <option value="PROTECTED">PROTECTED</option>
                  <option value="SECRET">SECRET</option>
                  <option value="TOP_SECRET">TOP_SECRET</option>
                </select>
                <p className="text-xs text-slate-600">
                  Controls are included cumulatively up to this classification.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="assessmentType">Assessment type</Label>
                <select id="assessmentType" className={SELECT_CLASS} {...register('assessmentType')}>
                  <option value="standard">Standard IRAP</option>
                  <option value="cloud_irap">Cloud IRAP workload</option>
                </select>
                <p className="text-xs text-slate-600">
                  Cloud IRAP marks likely provider-layer controls out of scope for PROTECTED and below.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cloudProvider">Cloud provider</Label>
                <select id="cloudProvider" className={SELECT_CLASS} {...register('cloudProvider')}>
                  <option value="none">None</option>
                  <option value="aws">AWS</option>
                  <option value="azure">Azure</option>
                  <option value="gcp">Google Cloud</option>
                  <option value="other">Other provider</option>
                </select>
                <p className="text-xs text-slate-600">
                  Used for Cloud IRAP provider-layer inheritance.
                </p>
              </div>
            </>
          )}

          {scopeNote && (
            <p className="sm:col-span-2 rounded-md border border-[var(--field-border)] bg-[var(--oak-mist)] px-3 py-2 text-xs text-slate-700">
              {scopeNote}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Client</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {clients.length === 0 ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              No clients yet.{' '}
              <a className="font-medium underline" href="/clients">
                Create a client
              </a>{' '}
              before starting an engagement.
            </p>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="clientId">Select client</Label>
                <select id="clientId" className={SELECT_CLASS} {...register('clientId')}>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.missing.length > 0 ? ' — incomplete' : ''}
                    </option>
                  ))}
                </select>
                {errors.clientId && <p className="text-xs text-red-700">{errors.clientId.message}</p>}
              </div>
              {selectedClient && selectedClient.missing.length > 0 && (
                <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  {selectedClient.name} is missing {selectedClient.missing.join(', ')}.{' '}
                  <a className="font-medium underline" href={`/clients?edit=${selectedClient.id}`}>
                    Update the client record
                  </a>{' '}
                  before starting an engagement.
                </p>
              )}
              <p className="text-xs text-slate-600">
                Need a new client?{' '}
                <a className="underline" href="/clients">
                  Manage clients
                </a>
                .
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>System under assessment</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="systemName">System name</Label>
            <Input id="systemName" {...register('systemName')} />
            {errors.systemName && <p className="text-xs text-red-700">{errors.systemName.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="systemEnvironment">Environment</Label>
            <Input
              id="systemEnvironment"
              placeholder="Production, ap-southeast-2"
              {...register('systemEnvironment')}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="systemDescription">Description</Label>
            <textarea
              id="systemDescription"
              rows={4}
              className="flex w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-2 text-sm"
              {...register('systemDescription')}
            />
          </div>
        </CardContent>
      </Card>

      {serverError && <p className="text-sm text-red-700">{serverError}</p>}

      <div className="flex justify-end gap-2">
        <Button type="submit" variant="primary" disabled={isSubmitting}>
          {isSubmitting ? 'Creating…' : 'Create engagement'}
        </Button>
      </div>
    </form>
  );
}
