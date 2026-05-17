'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createTenant } from '@/app/actions/tenants';
import { isValidAbn, normalizeAbn } from '@/lib/abn';

const optionalAbnSchema =
  z
    .string()
    .transform(normalizeAbn)
    .refine((value) => value === '' || isValidAbn(value), 'Enter a valid ABN')
    .transform((value) => value || undefined);

const schema = z.object({
  name: z.string().min(2).max(120),
  abn: optionalAbnSchema,
});

type FormInput = z.input<typeof schema>;
type FormValues = z.output<typeof schema>;

export function OnboardingForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    const raw = sessionStorage.getItem('oakattest:onboarding');
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as Partial<FormInput>;
      if (saved.name) setValue('name', saved.name);
      if (saved.abn) setValue('abn', saved.abn);
    } catch {
      sessionStorage.removeItem('oakattest:onboarding');
    }
  }, [setValue]);

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      await createTenant({ name: values.name, abn: values.abn });
      sessionStorage.removeItem('oakattest:onboarding');
      router.push('/admin?invite=1');
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
        <Input id="abn" placeholder="62 684 389 839" {...register('abn')} />
        {errors.abn && <p className="text-xs text-red-700">{errors.abn.message}</p>}
      </div>
      {serverError && <p className="text-sm text-red-700">{serverError}</p>}
      <Button type="submit" variant="primary" disabled={isSubmitting} className="w-full">
        {isSubmitting ? 'Creating…' : 'Create tenant'}
      </Button>
    </form>
  );
}
