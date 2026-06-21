import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { users } from '@/db/schema/auth';

// Platform (instance) superadmin. This is the host/owner of the whole OakAttest
// deployment — above every partner (MSP) and tenant. Backed by BetterAuth's
// admin plugin `users.role` column: a user whose role is 'admin' is a platform
// superadmin. Bootstrap the first one with `scripts/grant-platform-admin.ts`.
//
// Hierarchy: platform superadmin → partners (MSPs) → tenants (clients).

export class PlatformAccessError extends Error {
  constructor(message = 'Platform administrator access required') {
    super(message);
    this.name = 'PlatformAccessError';
  }
}

export async function isPlatformAdmin(userId: string): Promise<boolean> {
  if (!userId) return false;
  const [row] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.role === 'admin';
}

// Throw unless the user is a platform superadmin. Use in every platform-scoped
// Server Action and the /owner console.
export async function requirePlatformAdmin(userId: string): Promise<void> {
  if (!(await isPlatformAdmin(userId))) {
    throw new PlatformAccessError();
  }
}
