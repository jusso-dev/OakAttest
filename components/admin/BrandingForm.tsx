'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { updateBranding } from '@/app/actions/branding';

const schema = z.object({
  productName: z.string().min(2).max(80),
  primaryColour: z.string().regex(/^#[0-9a-f]{6}$/i),
  accentColour: z.string().regex(/^#[0-9a-f]{6}$/i),
  logoUrl: z.string().url().optional().or(z.literal('')),
});

type Values = z.infer<typeof schema>;

export function BrandingForm({
  tenantId,
  initial,
}: {
  tenantId: string;
  initial: Values;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: initial });

  const primary = watch('primaryColour');
  const accent = watch('accentColour');

  async function onSubmit(v: Values) {
    setServerError(null);
    try {
      await updateBranding({ tenantId, ...v });
      router.refresh();
    } catch (err) {
      setServerError((err as Error).message);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="productName">Product name</Label>
          <Input id="productName" {...register('productName')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="primaryColour">Primary colour</Label>
          <Input id="primaryColour" {...register('primaryColour')} />
          {errors.primaryColour && <p className="text-xs text-red-700">Use #RRGGBB</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="accentColour">Accent colour</Label>
          <Input id="accentColour" {...register('accentColour')} />
          {errors.accentColour && <p className="text-xs text-red-700">Use #RRGGBB</p>}
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="logoUrl">Logo URL</Label>
          <Input id="logoUrl" placeholder="https://…/logo.svg" {...register('logoUrl')} />
        </div>
      </div>
      <div className="flex gap-3 rounded-md border border-[var(--field-border)] bg-[var(--oak-mist)] p-3">
        <div className="h-8 w-8 rounded" style={{ backgroundColor: primary }} />
        <div className="h-8 w-8 rounded" style={{ backgroundColor: accent }} />
        <p className="text-xs text-slate-600">Preview</p>
      </div>
      {serverError && <p className="text-sm text-red-700">{serverError}</p>}
      <Button type="submit" variant="primary" disabled={isSubmitting}>
        {isSubmitting ? 'Saving…' : 'Save branding'}
      </Button>
    </form>
  );
}
