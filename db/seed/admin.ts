#!/usr/bin/env tsx

import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth/auth';
import { db } from '@/lib/db/client';
import { users } from '@/db/schema/auth';

async function main() {
  const email = process.env.DEFAULT_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.DEFAULT_ADMIN_PASSWORD;
  const name = process.env.DEFAULT_ADMIN_NAME?.trim() || 'Platform Administrator';

  if (!email && !password) {
    console.log('[seed] Default administrator not configured; skipping.');
    return;
  }
  if (!email || !password) {
    throw new Error('DEFAULT_ADMIN_EMAIL and DEFAULT_ADMIN_PASSWORD must be set together.');
  }
  if (!email.includes('@')) {
    throw new Error('DEFAULT_ADMIN_EMAIL must be a valid email address.');
  }
  if (password.length < 14 || password.length > 256) {
    throw new Error('DEFAULT_ADMIN_PASSWORD must contain between 14 and 256 characters.');
  }

  const [existing] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing) {
    if (existing.role !== 'admin') {
      await db
        .update(users)
        .set({ role: 'admin', updatedAt: new Date() })
        .where(eq(users.id, existing.id));
    }
    console.log(`[seed] Default administrator ready: ${email}.`);
    return;
  }

  await auth.api.createUser({
    body: { email, password, name, role: 'admin' },
  });
  console.log(`[seed] Default administrator created: ${email}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
