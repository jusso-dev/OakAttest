'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createInterview } from '@/app/actions/interviews';

const schema = z.object({
  title: z.string().min(2).max(200),
  purpose: z.string().max(2000).optional(),
  scheduledAt: z.string().optional(),
  durationMinutes: z.number().int().min(5).max(480).optional(),
  location: z.string().max(200).optional(),
  attendees: z.string().max(2000).optional(),
});

type Values = z.infer<typeof schema>;

export function InterviewForm({ engagementId }: { engagementId: string }) {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  async function onSubmit(v: Values) {
    setServerError(null);
    try {
      const attendees =
        v.attendees
          ?.split(/\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            const [name, role, email] = line.split('|').map((s) => s.trim());
            return { name, role: role || undefined, email: email || undefined };
          }) ?? [];
      await createInterview({
        engagementId,
        title: v.title,
        purpose: v.purpose,
        scheduledAt: v.scheduledAt ? new Date(v.scheduledAt).toISOString() : undefined,
        durationMinutes: v.durationMinutes,
        location: v.location,
        attendees,
      });
      reset();
    } catch (err) {
      setServerError((err as Error).message);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="title">Title</Label>
          <Input id="title" {...register('title')} />
          {errors.title && <p className="text-xs text-red-700">{errors.title.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="scheduledAt">When</Label>
          <Input id="scheduledAt" type="datetime-local" {...register('scheduledAt')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="durationMinutes">Duration (minutes)</Label>
          <Input
            id="durationMinutes"
            type="number"
            min={5}
            max={480}
            {...register('durationMinutes', { valueAsNumber: true })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="location">Location</Label>
          <Input id="location" {...register('location')} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="purpose">Purpose</Label>
          <textarea
            id="purpose"
            rows={2}
            className="flex w-full rounded-md border border-slate-200 bg-white p-2 text-sm"
            {...register('purpose')}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="attendees">Attendees (one per line: name | role | email)</Label>
          <textarea
            id="attendees"
            rows={3}
            className="flex w-full rounded-md border border-slate-200 bg-white p-2 text-sm font-mono text-xs"
            placeholder="Jane Smith | CISO | jane@client.example"
            {...register('attendees')}
          />
        </div>
      </div>
      {serverError && <p className="text-sm text-red-700">{serverError}</p>}
      <div className="flex justify-end">
        <Button type="submit" variant="primary" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : 'Schedule'}
        </Button>
      </div>
    </form>
  );
}
