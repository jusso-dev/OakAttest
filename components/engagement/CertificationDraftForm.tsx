'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { generateCertificationDraft } from '@/app/actions/certification';

const schema = z.object({
  scope: z.string().min(10).max(8000),
  methodology: z.string().min(10).max(8000),
  recommendation: z.enum(['recommended', 'recommended_with_conditions', 'not_recommended']),
  conditions: z.string().max(4000).optional(),
  validUntil: z.string().optional(),
});

type Values = z.infer<typeof schema>;

export function CertificationDraftForm({ engagementId }: { engagementId: string }) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { recommendation: 'recommended_with_conditions' },
  });

  async function onSubmit(v: Values) {
    setServerError(null);
    try {
      await generateCertificationDraft({
        engagementId,
        scope: v.scope,
        methodology: v.methodology,
        recommendation: v.recommendation,
        conditions: v.conditions,
        validUntil: v.validUntil,
      });
      router.refresh();
    } catch (err) {
      setServerError((err as Error).message);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="scope">Scope</Label>
        <textarea
          id="scope"
          rows={3}
          className="flex w-full rounded-md border border-slate-200 bg-white p-2 text-sm"
          {...register('scope')}
        />
        {errors.scope && <p className="text-xs text-red-700">{errors.scope.message}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="methodology">Methodology</Label>
        <textarea
          id="methodology"
          rows={3}
          className="flex w-full rounded-md border border-slate-200 bg-white p-2 text-sm"
          {...register('methodology')}
        />
        {errors.methodology && <p className="text-xs text-red-700">{errors.methodology.message}</p>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="recommendation">Recommendation</Label>
          <select
            id="recommendation"
            className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
            {...register('recommendation')}
          >
            <option value="recommended">Recommended</option>
            <option value="recommended_with_conditions">Recommended with conditions</option>
            <option value="not_recommended">Not recommended</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="validUntil">Re-assessment due</Label>
          <Input id="validUntil" type="date" {...register('validUntil')} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="conditions">Conditions (optional)</Label>
        <textarea
          id="conditions"
          rows={2}
          className="flex w-full rounded-md border border-slate-200 bg-white p-2 text-sm"
          {...register('conditions')}
        />
      </div>
      {serverError && <p className="text-sm text-red-700">{serverError}</p>}
      <div className="flex justify-end">
        <Button type="submit" variant="primary" disabled={isSubmitting}>
          {isSubmitting ? 'Generating…' : 'Generate draft'}
        </Button>
      </div>
    </form>
  );
}
