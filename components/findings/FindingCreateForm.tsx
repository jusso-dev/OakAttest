'use client';

import { useMemo, useState } from 'react';
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
  controls: Array<{
    id: string;
    controlId: string;
    chapter: string | null;
    subChapter: string | null;
    description: string;
  }>;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [selectedControls, setSelectedControls] = useState<string[]>([]);
  const [controlSearch, setControlSearch] = useState('');
  const [chapter, setChapter] = useState('');
  const [subChapter, setSubChapter] = useState('');
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

  const chapters = useMemo(
    () => Array.from(new Set(controls.map((c) => c.chapter).filter(Boolean) as string[])).sort(),
    [controls],
  );
  const subChapters = useMemo(
    () =>
      Array.from(
        new Set(
          controls
            .filter((c) => !chapter || c.chapter === chapter)
            .map((c) => c.subChapter)
            .filter(Boolean) as string[],
        ),
      ).sort(),
    [chapter, controls],
  );
  const filteredControls = useMemo(() => {
    const q = controlSearch.trim().toLowerCase();
    return controls.filter((control) => {
      if (chapter && control.chapter !== chapter) return false;
      if (subChapter && control.subChapter !== subChapter) return false;
      if (!q) return true;
      return [
        control.controlId,
        control.description,
        control.chapter ?? '',
        control.subChapter ?? '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [chapter, controlSearch, controls, subChapter]);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="type">Type</Label>
          <select
            id="type"
            className="flex h-9 w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm"
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
            className="flex h-9 w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm"
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
            className="flex w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-2 text-sm"
            {...register('description')}
          />
          {errors.description && <p className="text-xs text-red-700">{errors.description.message}</p>}
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="recommendation">Recommendation (assessor-side note)</Label>
          <textarea
            id="recommendation"
            rows={2}
            className="flex w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-2 text-sm"
            {...register('recommendation')}
          />
          <p className="text-xs text-slate-600">
            The recommendation is informational. Clients author their own remediation actions
            so the independence rule is preserved.
          </p>
        </div>
      </div>
      <div>
        <Label>Linked controls</Label>
        <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_180px_180px]">
          <input
            value={controlSearch}
            onChange={(event) => setControlSearch(event.target.value)}
            placeholder="Search controls"
            className="flex h-9 rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm text-slate-950"
          />
          <select
            value={chapter}
            onChange={(event) => {
              setChapter(event.target.value);
              setSubChapter('');
            }}
            className="flex h-9 rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm text-slate-950"
          >
            <option value="">All chapters</option>
            {chapters.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <select
            value={subChapter}
            onChange={(event) => setSubChapter(event.target.value)}
            className="flex h-9 rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm text-slate-950"
          >
            <option value="">All sub-chapters</option>
            {subChapters.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-2 max-h-64 overflow-y-auto rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-2 text-sm">
          {filteredControls.map((c) => (
            <label key={c.id} className="flex items-start gap-2 rounded px-2 py-2 hover:bg-[var(--oak-mist)]">
              <input
                className="mt-1"
                type="checkbox"
                checked={selectedControls.includes(c.id)}
                onChange={(e) => {
                  setSelectedControls((prev) =>
                    e.target.checked ? [...prev, c.id] : prev.filter((id) => id !== c.id),
                  );
                }}
              />
              <span className="min-w-0">
                <span className="font-mono text-xs font-medium text-slate-950">{c.controlId}</span>
                <span className="ml-2 text-xs text-slate-600">
                  {[c.chapter, c.subChapter].filter(Boolean).join(' / ')}
                </span>
                <span className="mt-1 block text-xs text-slate-700">
                  {c.description}
                </span>
              </span>
            </label>
          ))}
          {filteredControls.length === 0 && (
            <p className="px-2 py-4 text-sm text-slate-600">No controls match the current filters.</p>
          )}
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
