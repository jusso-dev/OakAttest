'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { createEngagement } from '@/app/actions/engagements';
import { isValidAbn, normalizeAbn } from '@/lib/abn';

const optionalAbnSchema =
  z
    .string()
    .transform(normalizeAbn)
    .refine((value) => value === '' || isValidAbn(value), 'Enter a valid ABN')
    .transform((value) => value || undefined);

const schema = z.object({
  name: z.string().min(2).max(200),
  reference: z.string().max(60).optional(),
  classification: z.enum(['OFFICIAL', 'OFFICIAL_SENSITIVE', 'PROTECTED', 'SECRET', 'TOP_SECRET']),
  assessmentType: z.enum(['standard', 'cloud_irap']),
  cloudProvider: z.enum(['none', 'aws', 'azure', 'gcp', 'other']),
  ismRevision: z.string().min(1),
  clientName: z.string().min(2),
  clientAbn: optionalAbnSchema,
  clientContactName: z.string().optional(),
  clientContactEmail: z.string().email().optional().or(z.literal('')),
  systemName: z.string().min(2),
  systemDescription: z.string().max(2000).optional(),
  systemEnvironment: z.string().optional(),
});

type FormInput = z.input<typeof schema>;
type FormValues = z.output<typeof schema>;

export function NewEngagementForm({
  tenantId,
  revisions,
}: {
  tenantId: string;
  revisions: Array<{ revision: string; controlCount: number }>;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      classification: 'PROTECTED',
      assessmentType: 'standard',
      cloudProvider: 'none',
      ismRevision: revisions[0]?.revision,
    },
  });

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
        ismRevision: values.ismRevision,
        clientOrganisation: {
          name: values.clientName,
          abn: values.clientAbn || undefined,
          primaryContactName: values.clientContactName,
          primaryContactEmail: values.clientContactEmail || undefined,
        },
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
            <Label htmlFor="classification">Classification</Label>
            <select
              id="classification"
              className="flex h-9 w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm"
              {...register('classification')}
            >
              <option value="OFFICIAL">OFFICIAL</option>
              <option value="OFFICIAL_SENSITIVE">OFFICIAL:Sensitive</option>
              <option value="PROTECTED">PROTECTED</option>
              <option value="SECRET">SECRET</option>
              <option value="TOP_SECRET">TOP_SECRET</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="assessmentType">Assessment type</Label>
            <select
              id="assessmentType"
              className="flex h-9 w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm text-slate-950"
              {...register('assessmentType')}
            >
              <option value="standard">Standard IRAP</option>
              <option value="cloud_irap">Cloud IRAP workload</option>
            </select>
            <p className="text-xs text-slate-600">
              Cloud IRAP marks likely provider-layer controls out of scope for PROTECTED and below.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cloudProvider">Cloud provider</Label>
            <select
              id="cloudProvider"
              className="flex h-9 w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm text-slate-950"
              {...register('cloudProvider')}
            >
              <option value="none">None</option>
              <option value="aws">AWS</option>
              <option value="azure">Azure</option>
              <option value="gcp">Google Cloud</option>
              <option value="other">Other provider</option>
            </select>
            <p className="text-xs text-slate-600">
              AWS, Azure, and Google Cloud maintain IRAP material for PROTECTED-level public cloud services.
            </p>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="ismRevision">ISM revision</Label>
            <select
              id="ismRevision"
              className="flex h-9 w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm"
              {...register('ismRevision')}
            >
              {revisions.map((r) => (
                <option key={r.revision} value={r.revision}>
                  {r.revision} — {r.controlCount} controls
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Client organisation</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="clientName">Name</Label>
            <Input id="clientName" {...register('clientName')} />
            {errors.clientName && <p className="text-xs text-red-700">{errors.clientName.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="clientAbn">ABN</Label>
            <Input id="clientAbn" placeholder="62 684 389 839" {...register('clientAbn')} />
            {errors.clientAbn && <p className="text-xs text-red-700">{errors.clientAbn.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="clientContactName">Primary contact name</Label>
            <Input id="clientContactName" {...register('clientContactName')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="clientContactEmail">Primary contact email</Label>
            <Input id="clientContactEmail" type="email" {...register('clientContactEmail')} />
          </div>
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
              placeholder="Production, AWS ap-southeast-2"
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
