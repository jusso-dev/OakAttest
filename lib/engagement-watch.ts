import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { engagementWatchers } from '@/db/schema/collaboration';
import { createNotifications } from './notifications';

export async function watchEngagement(engagementId: string, userId: string): Promise<void> {
  await db
    .insert(engagementWatchers)
    .values({ engagementId, userId })
    .onConflictDoNothing();
}

export async function unwatchEngagement(engagementId: string, userId: string): Promise<void> {
  await db
    .delete(engagementWatchers)
    .where(
      and(eq(engagementWatchers.engagementId, engagementId), eq(engagementWatchers.userId, userId)),
    );
}

export async function isWatchingEngagement(engagementId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: engagementWatchers.id })
    .from(engagementWatchers)
    .where(
      and(eq(engagementWatchers.engagementId, engagementId), eq(engagementWatchers.userId, userId)),
    )
    .limit(1);
  return !!row;
}

export async function listWatcherIds(engagementId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: engagementWatchers.userId })
    .from(engagementWatchers)
    .where(eq(engagementWatchers.engagementId, engagementId));
  return rows.map((r) => r.userId);
}

// Notify everyone watching an engagement (except the actor). Fire-and-forget at
// the call site — a notification failure must never break the action.
export async function notifyEngagementWatchers(opts: {
  engagementId: string;
  tenantId: string;
  actorUserId: string | null;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
}): Promise<void> {
  const ids = await listWatcherIds(opts.engagementId);
  await createNotifications(
    ids.map((userId) => ({
      userId,
      tenantId: opts.tenantId,
      engagementId: opts.engagementId,
      type: opts.type,
      title: opts.title,
      body: opts.body ?? null,
      link: opts.link ?? `/engagements/${opts.engagementId}/overview`,
      actorUserId: opts.actorUserId ?? null,
    })),
  );
}
