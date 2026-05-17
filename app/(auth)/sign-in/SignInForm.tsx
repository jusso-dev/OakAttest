'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { signIn } from '@/lib/auth/client';

const schema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(14, 'Password must be at least 14 characters'),
});

type FormValues = z.infer<typeof schema>;

export function SignInForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    const result = await signIn.email({
      email: values.email,
      password: values.password,
    });
    if (result.error) {
      setServerError(result.error.message ?? 'Unable to sign in');
      return;
    }
    router.push('/dashboard');
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="email">Work email</Label>
        <Input id="email" type="email" autoComplete="email" {...register('email')} />
        {errors.email && <p className="text-xs text-red-700">{errors.email.message}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          {...register('password')}
        />
        {errors.password && <p className="text-xs text-red-700">{errors.password.message}</p>}
      </div>
      {serverError && <p className="text-sm text-red-700">{serverError}</p>}
      <Button type="submit" variant="primary" disabled={isSubmitting} className="w-full">
        {isSubmitting ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}
