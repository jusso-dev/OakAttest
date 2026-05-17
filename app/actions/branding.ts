'use server';

import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db/client';
import { tenants } from '@/db/schema/tenants';
import { auditLog } from '@/db/schema/audit';
import { tenantIpAllowlist } from '@/db/schema/auth';
import { requireSession } from '@/lib/auth/session';
import { requirePermission } from '@/lib/rbac/require';
import { ACTIONS } from '@/lib/rbac/matrix';

const brandingSchema = z.object({
  tenantId: z.string().uuid(),
  productName: z.string().min(2).max(80).optional(),
  primaryColour: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  accentColour: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  logoUrl: z.string().url().optional().or(z.literal('')),
});

export async function updateBranding(input: z.infer<typeof brandingSchema>) {
  const session = await requireSession();
  const data = brandingSchema.parse(input);

  await requirePermission(ACTIONS.tenantManageBranding, {
    userId: session.user.id,
    tenantId: data.tenantId,
  });

  const branding = {
    productName: data.productName,
    primaryColour: data.primaryColour,
    accentColour: data.accentColour,
    logoUrl: data.logoUrl || undefined,
  };

  await db.transaction(async (tx) => {
    await tx
      .update(tenants)
      .set({ branding: branding as never, updatedAt: new Date() })
      .where(eq(tenants.id, data.tenantId));
    await tx.insert(auditLog).values({
      tenantId: data.tenantId,
      actorUserId: session.user.id,
      action: 'tenant.branding.update',
      resourceType: 'tenant',
      resourceId: data.tenantId,
      afterJson: branding as never,
    });
  });

  revalidatePath('/admin/branding');
  return { ok: true };
}

const cidrRegex = /^([0-9]{1,3}\.){3}[0-9]{1,3}(\/(3[0-2]|[12]?[0-9]))?$/;

const ipSchema = z.object({
  tenantId: z.string().uuid(),
  cidr: z.string().regex(cidrRegex, 'Use a CIDR like 203.0.113.0/24'),
  description: z.string().max(200).optional(),
});

export async function addIpAllowlistEntry(input: z.infer<typeof ipSchema>) {
  const session = await requireSession();
  const data = ipSchema.parse(input);
  await requirePermission(ACTIONS.tenantManageIpAllowlist, {
    userId: session.user.id,
    tenantId: data.tenantId,
  });
  await db.transaction(async (tx) => {
    await tx.insert(tenantIpAllowlist).values({
      tenantId: data.tenantId,
      cidr: data.cidr,
      description: data.description ?? null,
      createdBy: session.user.id,
    });
    await tx.insert(auditLog).values({
      tenantId: data.tenantId,
      actorUserId: session.user.id,
      action: 'tenant.ip_allowlist.add',
      resourceType: 'tenant_ip_allowlist',
      afterJson: { cidr: data.cidr } as never,
    });
  });
  revalidatePath('/admin/ip-allowlist');
  return { ok: true };
}

const removeIpSchema = z.object({
  tenantId: z.string().uuid(),
  entryId: z.string().uuid(),
});

export async function removeIpAllowlistEntry(input: z.infer<typeof removeIpSchema>) {
  const session = await requireSession();
  const data = removeIpSchema.parse(input);
  await requirePermission(ACTIONS.tenantManageIpAllowlist, {
    userId: session.user.id,
    tenantId: data.tenantId,
  });
  await db.transaction(async (tx) => {
    await tx.delete(tenantIpAllowlist).where(eq(tenantIpAllowlist.id, data.entryId));
    await tx.insert(auditLog).values({
      tenantId: data.tenantId,
      actorUserId: session.user.id,
      action: 'tenant.ip_allowlist.remove',
      resourceType: 'tenant_ip_allowlist',
      resourceId: data.entryId,
    });
  });
  revalidatePath('/admin/ip-allowlist');
  return { ok: true };
}
