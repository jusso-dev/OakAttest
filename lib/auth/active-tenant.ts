import { cookies } from 'next/headers';
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { tenantMembers, tenants } from '@/db/schema/tenants';

// Active tenant is stored in a cookie set after the user picks one via the
// command palette. We re-validate every request that the user is still a
// member; never trust the cookie value alone.
const COOKIE = 'oakattest_active_tenant';

export async function readActiveTenantCookie(): Promise<string | null> {
  const c = await cookies();
  const v = c.get(COOKIE)?.value;
  return v && /^[0-9a-f-]{36}$/i.test(v) ? v : null;
}

export async function writeActiveTenantCookie(tenantId: string) {
  const c = await cookies();
  c.set(COOKIE, tenantId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
}

// Resolve the user's active tenant. If the cookie is missing or invalid we
// pick the first tenant the user belongs to. Returns null if the user has
// no tenant memberships (likely a client-only user who has not yet accepted
// any engagement invite).
export async function resolveActiveTenant(userId: string): Promise<{
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
} | null> {
  const cookieTenantId = await readActiveTenantCookie();
  if (cookieTenantId) {
    const row = await db
      .select({
        tenantId: tenants.id,
        tenantSlug: tenants.slug,
        tenantName: tenants.name,
      })
      .from(tenantMembers)
      .innerJoin(tenants, eq(tenants.id, tenantMembers.tenantId))
      .where(
        and(
          eq(tenantMembers.userId, userId),
          eq(tenantMembers.tenantId, cookieTenantId),
          isNull(tenantMembers.deletedAt),
          isNull(tenants.deletedAt),
        ),
      )
      .limit(1);
    if (row[0]) return row[0];
  }

  const fallback = await db
    .select({
      tenantId: tenants.id,
      tenantSlug: tenants.slug,
      tenantName: tenants.name,
    })
    .from(tenantMembers)
    .innerJoin(tenants, eq(tenants.id, tenantMembers.tenantId))
    .where(
      and(
        eq(tenantMembers.userId, userId),
        isNull(tenantMembers.deletedAt),
        isNull(tenants.deletedAt),
      ),
    )
    .limit(1);
  return fallback[0] ?? null;
}
