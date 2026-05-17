'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createFinding } from '@/app/actions/findings';

const schema = z.object({
  type: z.enum(['non_conformance', 'observation']),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  title: z.string().min(2).max(300),
  description: z.string().min(10).max(8000),
  recommendation: z.string().max(8000).optional(),
});

type Values = z.infer<typeof schema>;

export function FindingCreateForm({
  engagementId,
  controls,
}: {
  engagementId: string;
  controls: Array<{ id: string; controlId: string }>;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [selectedControls, setSelectedControls] = useState<string[]>([]);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { type: 'observation', severity: 'medium' },
  });

  async function onSubmit(v: Values) {
    setServerError(null);
    try {
      await createFinding({
        engagementId,
        type: v.type,
        severity: v.severity,
        title: v.title,
        description: v.description,
        recommendation: v.recommendation,
        ismControlIds: selectedControls.length ? selectedControls : undefined,
      });
      reset();
      setSelectedControls([]);
    } catch (err) {
      setServerError((err as Error).message);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="type">Type</Label>
          <select
            id="type"
            className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
            {...register('type')}
          >
            <option value="observation">Observation</option>
            <option value="non_conformance">Non-conformance</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="severity">Severity</Label>
          <select
            id="severity"
            className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
            {...register('severity')}
          >
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="title">Title</Label>
          <Input id="title" {...register('title')} />
          {errors.title && <p className="text-xs text-red-700">{errors.title.message}</p>}
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="description">Description</Label>
          <textarea
            id="description"
            rows={4}
            className="flex w-full rounded-md border border-slate-200 bg-white p-2 text-sm"
            {...register('description')}
          />
          {errors.description && <p className="text-xs text-red-700">{errors.description.message}</p>}
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="recommendation">Recommendation (assessor-side note)</Label>
          <textarea
            id="recommendation"
            rows={2}
            className="flex w-full rounded-md border border-slate-200 bg-white p-2 text-sm"
            {...register('recommendation')}
          />
          <p className="text-xs text-slate-500">
            The recommendation is informational. Clients author their own remediation actions
            so the independence rule is preserved.
          </p>
        </div>
      </div>
      <div>
        <Label>Linked controls</Label>
        <div className="mt-2 max-h-40 overflow-y-auto rounded-md border border-slate-200 bg-white p-2 text-sm">
          {controls.map((c) => (
            <label key={c.id} className="flex items-start gap-2 px-1 py-0.5 hover:bg-slate-50">
              <input
                type="checkbox"
                checked={selectedControls.includes(c.id)}
                onChange={(e) => {
                  setSelectedControls((prev) =>
                    e.target.checked ? [...prev, c.id] : prev.filter((id) => id !== c.id),
                  );
                }}
              />
              <span className="font-mono text-xs">{c.controlId}</span>
            </label>
          ))}
        </div>
      </div>
      {serverError && <p className="text-sm text-red-700">{serverError}</p>}
      <div className="flex justify-end">
        <Button type="submit" variant="primary" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : 'Log finding'}
        </Button>
      </div>
    </form>
  );
}
