'use server';

import { z } from 'zod';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db/client';
import { clients } from '@/db/schema/clients';
import { auditLog } from '@/db/schema/audit';
import { requireSession } from '@/lib/auth/session';
import { requirePermission } from '@/lib/rbac/require';
import { ACTIONS } from '@/lib/rbac/matrix';

const baseFields = {
  name: z.string().min(2).max(160),
  businessNumber: z.string().max(64).optional(),
  primaryContactName: z.string().max(160).optional(),
  primaryContactEmail: z.string().email().optional().or(z.literal('')),
  address: z.string().max(500).optional(),
  notes: z.string().max(4000).optional(),
};

function clean(v?: string) {
  const t = v?.trim();
  return t ? t : null;
}

export async function listClientsForTenant(tenantId: string) {
  return db
    .select()
    .from(clients)
    .where(and(eq(clients.tenantId, tenantId), isNull(clients.deletedAt)))
    .orderBy(asc(clients.name));
}

const createSchema = z.object({ tenantId: z.string().uuid(), ...baseFields });

export async function createClient(input: z.infer<typeof createSchema>) {
  const session = await requireSession();
  const data = createSchema.parse(input);
  await requirePermission(ACTIONS.clientManage, {
    userId: session.user.id,
    tenantId: data.tenantId,
  });

  const [row] = await db
    .insert(clients)
    .values({
      tenantId: data.tenantId,
      name: data.name.trim(),
      businessNumber: clean(data.businessNumber),
      primaryContactName: clean(data.primaryContactName),
      primaryContactEmail: clean(data.primaryContactEmail),
      address: clean(data.address),
      notes: clean(data.notes),
    })
    .returning({ id: clients.id });

  await db.insert(auditLog).values({
    tenantId: data.tenantId,
    actorUserId: session.user.id,
    action: 'client.create',
    resourceType: 'client',
    resourceId: row.id,
    afterJson: { name: data.name } as never,
  });

  revalidatePath('/clients');
  revalidatePath('/engagements/new');
  return { id: row.id };
}

const updateSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  ...baseFields,
});

export async function updateClient(input: z.infer<typeof updateSchema>) {
  const session = await requireSession();
  const data = updateSchema.parse(input);
  await requirePermission(ACTIONS.clientManage, {
    userId: session.user.id,
    tenantId: data.tenantId,
  });

  await db
    .update(clients)
    .set({
      name: data.name.trim(),
      businessNumber: clean(data.businessNumber),
      primaryContactName: clean(data.primaryContactName),
      primaryContactEmail: clean(data.primaryContactEmail),
      address: clean(data.address),
      notes: clean(data.notes),
      updatedAt: new Date(),
    })
    .where(and(eq(clients.id, data.id), eq(clients.tenantId, data.tenantId)));

  await db.insert(auditLog).values({
    tenantId: data.tenantId,
    actorUserId: session.user.id,
    action: 'client.update',
    resourceType: 'client',
    resourceId: data.id,
    afterJson: { name: data.name } as never,
  });

  revalidatePath('/clients');
  revalidatePath('/engagements/new');
  return { ok: true };
}
