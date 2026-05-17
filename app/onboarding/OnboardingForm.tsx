'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createTenant } from '@/app/actions/tenants';

const schema = z.object({
  name: z.string().min(2).max(120),
  abn: z
    .string()
    .regex(/^\d{11}$/, 'ABN must be 11 digits')
    .optional()
    .or(z.literal('')),
});

type FormValues = z.infer<typeof schema>;

export function OnboardingForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      await createTenant({ name: values.name, abn: values.abn });
      router.push('/dashboard');
      router.refresh();
    } catch (err) {
      setServerError((err as Error).message);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="name">Firm name</Label>
        <Input id="name" placeholder="Acme Assessors Pty Ltd" {...register('name')} />
        {errors.name && <p className="text-xs text-red-700">{errors.name.message}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="abn">ABN (optional)</Label>
        <Input id="abn" placeholder="11 digits, no spaces" {...register('abn')} />
        {errors.abn && <p className="text-xs text-red-700">{errors.abn.message}</p>}
      </div>
      {serverError && <p className="text-sm text-red-700">{serverError}</p>}
      <Button type="submit" variant="primary" disabled={isSubmitting} className="w-full">
        {isSubmitting ? 'Creating…' : 'Create tenant'}
      </Button>
    </form>
  );
}
