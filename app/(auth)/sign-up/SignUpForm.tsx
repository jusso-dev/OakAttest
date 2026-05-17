'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { signUp } from '@/lib/auth/client';
import { isValidAbn, normalizeAbn } from '@/lib/abn';

const optionalAbnSchema =
  z
    .string()
    .transform(normalizeAbn)
    .refine((value) => value === '' || isValidAbn(value), 'Enter a valid ABN')
    .transform((value) => value || undefined);

const schema = z
  .object({
    name: z.string().min(2, 'Enter your name'),
    email: z.string().email('Enter a valid email address'),
    organisationName: z.string().max(120, 'Use 120 characters or fewer').optional(),
    abn: optionalAbnSchema,
    password: z.string().min(14, 'Use at least 14 characters'),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    path: ['confirm'],
    message: 'Passwords do not match',
  });

type FormInput = z.input<typeof schema>;
type FormValues = z.output<typeof schema>;

export function SignUpForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next');
  const isInvitationSignup = next?.startsWith('/invite/') ?? false;
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    const organisationName = values.organisationName?.trim();
    const abn = values.abn;
    if (!isInvitationSignup && !organisationName) {
      setServerError('Enter your organisation name');
      return;
    }
    const result = await signUp.email({
      name: values.name,
      email: values.email,
      password: values.password,
    });
    if (result.error) {
      setServerError(result.error.message ?? 'Unable to create account');
      return;
    }
    if (!isInvitationSignup && organisationName) {
      sessionStorage.setItem(
        'oakattest:onboarding',
        JSON.stringify({ name: organisationName, abn: abn || '' }),
      );
    }
    router.push(next?.startsWith('/') ? next : '/dashboard');
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="name">Full name</Label>
        <Input id="name" autoComplete="name" {...register('name')} />
        {errors.name && <p className="text-xs text-red-700">{errors.name.message}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="email">Work email</Label>
        <Input id="email" type="email" autoComplete="email" {...register('email')} />
        {errors.email && <p className="text-xs text-red-700">{errors.email.message}</p>}
      </div>
      {!isInvitationSignup && (
        <div className="rounded-md border border-[var(--field-border)] bg-[var(--oak-mist)] p-3">
          <p className="text-xs font-medium uppercase text-slate-600">
            Organisation
          </p>
          <div className="mt-3 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="organisationName">Organisation name</Label>
              <Input
                id="organisationName"
                autoComplete="organization"
                placeholder="Acme Assessors Pty Ltd"
                {...register('organisationName')}
              />
              {errors.organisationName && (
                <p className="text-xs text-red-700">{errors.organisationName.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="abn">ABN (optional)</Label>
              <Input id="abn" inputMode="numeric" placeholder="62 684 389 839" {...register('abn')} />
              {errors.abn && <p className="text-xs text-red-700">{errors.abn.message}</p>}
            </div>
          </div>
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          {...register('password')}
        />
        {errors.password && <p className="text-xs text-red-700">{errors.password.message}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirm">Confirm password</Label>
        <Input
          id="confirm"
          type="password"
          autoComplete="new-password"
          {...register('confirm')}
        />
        {errors.confirm && <p className="text-xs text-red-700">{errors.confirm.message}</p>}
      </div>
      {serverError && <p className="text-sm text-red-700">{serverError}</p>}
      <Button type="submit" variant="primary" disabled={isSubmitting} className="w-full">
        {isSubmitting ? 'Creating account…' : 'Create account'}
      </Button>
    </form>
  );
}
