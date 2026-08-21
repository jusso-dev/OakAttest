import { eq } from 'drizzle-orm';
import { users } from '@/db/schema/auth';
import { db } from '@/lib/db/client';
import { normaliseTimeZone } from '@/lib/timezone';

export async function userTimeZone(userId: string): Promise<string> {
  const [profile] = await db
    .select({ timeZone: users.timeZone })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return normaliseTimeZone(profile?.timeZone);
}
