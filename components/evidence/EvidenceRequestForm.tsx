'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createEvidenceRequest } from '@/app/actions/evidence';

const schema = z.object({
  title: z.string().min(2).max(200),
  description: z.string().max(4000).optional(),
  artifactType: z.string().max(100).optional(),
  dueAt: z.string().optional(),
});

type Values = z.infer<typeof schema>;

export function EvidenceRequestForm({
  engagementId,
  controls,
}: {
  engagementId: string;
  controls: Array<{ id: string; controlId: string; description: string }>;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [selectedControls, setSelectedControls] = useState<string[]>([]);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  async function onSubmit(values: Values) {
    if (selectedControls.length === 0) {
      setServerError('Select at least one control');
      return;
    }
    setServerError(null);
    try {
      await createEvidenceRequest({
        engagementId,
        title: values.title,
        description: values.description,
        artifactType: values.artifactType,
        dueAt: values.dueAt ? new Date(values.dueAt).toISOString() : undefined,
        ismControlIds: selectedControls,
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
          <Label htmlFor="title">Title</Label>
          <Input id="title" {...register('title')} />
          {errors.title && <p className="text-xs text-red-700">{errors.title.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="artifactType">Artifact type</Label>
          <Input
            id="artifactType"
            placeholder="config export, screenshot, policy"
            {...register('artifactType')}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="description">Description</Label>
          <textarea
            id="description"
            rows={3}
            className="flex w-full rounded-md border border-slate-200 bg-white p-2 text-sm"
            {...register('description')}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dueAt">Due date</Label>
          <Input id="dueAt" type="date" {...register('dueAt')} />
        </div>
      </div>
      <div>
        <Label>Controls covered ({selectedControls.length} selected)</Label>
        <div className="mt-2 max-h-44 overflow-y-auto rounded-md border border-slate-200 bg-white p-2 text-sm">
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
              <span>
                <span className="font-mono text-xs text-slate-700">{c.controlId}</span>{' '}
                <span className="text-slate-500">— {c.description.slice(0, 80)}</span>
              </span>
            </label>
          ))}
        </div>
      </div>
      {serverError && <p className="text-sm text-red-700">{serverError}</p>}
      <div className="flex justify-end">
        <Button type="submit" variant="primary" disabled={isSubmitting}>
          {isSubmitting ? 'Creating…' : 'Create request'}
        </Button>
      </div>
    </form>
  );
}
