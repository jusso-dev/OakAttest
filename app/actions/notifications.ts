'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/auth/session';
import { markNotificationRead, markAllNotificationsRead } from '@/lib/notifications';

export async function markNotificationReadAction(input: { id: string }) {
  const session = await requireSession();
  const { id } = z.object({ id: z.string().uuid() }).parse(input);
  await markNotificationRead(session.user.id, id);
  revalidatePath('/notifications');
  return { ok: true };
}

export async function markAllNotificationsReadAction() {
  const session = await requireSession();
  await markAllNotificationsRead(session.user.id);
  revalidatePath('/notifications');
  return { ok: true };
}
