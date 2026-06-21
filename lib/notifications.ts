import { and, count, desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { notifications, type Notification } from '@/db/schema/collaboration';

export type NewNotification = {
  userId: string;
  tenantId: string;
  engagementId?: string | null;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  actorUserId?: string | null;
};

// Insert in-app notifications. Self-notifications (actor === recipient) are
// dropped so you never get pinged for your own action.
export async function createNotifications(rows: NewNotification[]): Promise<void> {
  const clean = rows.filter((r) => r.userId && r.userId !== r.actorUserId);
  if (!clean.length) return;
  await db.insert(notifications).values(
    clean.map((r) => ({
      userId: r.userId,
      tenantId: r.tenantId,
      engagementId: r.engagementId ?? null,
      type: r.type,
      title: r.title,
      body: r.body ?? null,
      link: r.link ?? null,
      actorUserId: r.actorUserId ?? null,
    })),
  );
}

export async function listNotifications(userId: string, limit = 50): Promise<Notification[]> {
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function unreadNotificationCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return row?.value ?? 0;
}

export async function markNotificationRead(userId: string, id: string): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}
