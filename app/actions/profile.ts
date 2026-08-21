'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db/client';
import { users } from '@/db/schema/auth';
import { auditLog } from '@/db/schema/audit';
import { requireSession } from '@/lib/auth/session';
import { isValidTimeZone } from '@/lib/timezone';
import { z } from 'zod';

const timeZoneSchema = z.string().trim().min(1).max(100).refine(isValidTimeZone, {
  message: 'Select a valid IANA timezone',
});

export async function acceptDataHandlingTerms() {
  const session = await requireSession();
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ dataHandlingAcceptedAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, session.user.id));
    await tx.insert(auditLog).values({
      actorUserId: session.user.id,
      action: 'profile.accept_data_handling',
      resourceType: 'user',
      resourceId: session.user.id,
    });
  });
  revalidatePath('/');
  return { ok: true };
}

export async function updateUserTimeZone(input: { timeZone: string }) {
  const session = await requireSession();
  const timeZone = timeZoneSchema.parse(input.timeZone);
  const [current] = await db
    .select({ timeZone: users.timeZone })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ timeZone, updatedAt: new Date() })
      .where(eq(users.id, session.user.id));
    await tx.insert(auditLog).values({
      actorUserId: session.user.id,
      action: 'profile.timezone.update',
      resourceType: 'user',
      resourceId: session.user.id,
      beforeJson: { timeZone: current?.timeZone ?? null } as never,
      afterJson: { timeZone } as never,
    });
  });
  revalidatePath('/settings/profile');
  revalidatePath('/');
  return { ok: true, timeZone };
}
