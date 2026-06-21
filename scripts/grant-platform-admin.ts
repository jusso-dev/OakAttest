#!/usr/bin/env tsx
// Grant (or revoke) platform superadmin to a user by email. The platform
// superadmin is the host/owner of the whole instance, above all partners (MSPs)
// and tenants. Backed by BetterAuth's `users.role` column.
//
//   npm run platform:admin -- --email you@example.com            # grant
//   npm run platform:admin -- --email you@example.com --revoke   # revoke

import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { users } from '@/db/schema/auth';

function arg(name: string): string | undefined {
  const i = process.argv.findIndex((a) => a === `--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = arg('email');
  const revoke = process.argv.includes('--revoke');
  if (!email) {
    throw new Error('Usage: npm run platform:admin -- --email you@example.com [--revoke]');
  }

  const [user] = await db
    .select({ id: users.id, email: users.email, role: users.role })
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);
  if (!user) {
    throw new Error(`No user found with email ${email}. Sign up first, then re-run.`);
  }

  await db
    .update(users)
    .set({ role: revoke ? 'user' : 'admin' })
    .where(eq(users.id, user.id));

  // eslint-disable-next-line no-console
  console.log(
    `[platform] ${revoke ? 'Revoked' : 'Granted'} platform superadmin for ${user.email}.`,
  );
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
