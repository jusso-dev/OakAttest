'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db/client';
import { users } from '@/db/schema/auth';
import { auditLog } from '@/db/schema/audit';
import { requireSession } from '@/lib/auth/session';

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
