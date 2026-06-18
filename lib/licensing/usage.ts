import { and, count, eq, isNull, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { tenantMembers, engagementMembers } from '@/db/schema/tenants';
import { engagements } from '@/db/schema/engagements';
import { evidenceItems } from '@/db/schema/evidence';
import { tenantUsage } from '@/db/schema/usage';

// Usage counters are computed LIVE for the limit-critical dimensions (users,
// entities, storage) so enforcement never drifts. `tenant_usage` is a snapshot
// refreshed by `refreshTenantUsage` for the subscription screen / MSP console.

// A "user" is anyone with access to the tenant: an assessor-firm member
// (tenant_members) OR a client-side engagement participant (engagement_members).
// Counted distinct so a person in both scopes uses one seat.
export async function countActiveUsers(tenantId: string): Promise<number> {
  const [tm, em] = await Promise.all([
    db
      .select({ userId: tenantMembers.userId })
      .from(tenantMembers)
      .where(and(eq(tenantMembers.tenantId, tenantId), isNull(tenantMembers.deletedAt))),
    db
      .select({ userId: engagementMembers.userId })
      .from(engagementMembers)
      .where(
        and(eq(engagementMembers.tenantId, tenantId), isNull(engagementMembers.deletedAt)),
      ),
  ]);
  return new Set<string>([...tm.map((r) => r.userId), ...em.map((r) => r.userId)]).size;
}

// A "business entity" is an assessment engagement (one assessed system).
// Archived engagements do not count against the live cap.
export async function countActiveEntities(tenantId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(engagements)
    .where(
      and(
        eq(engagements.tenantId, tenantId),
        isNull(engagements.deletedAt),
        ne(engagements.status, 'archived'),
      ),
    );
  return row?.n ?? 0;
}

export async function sumStorageBytes(tenantId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${evidenceItems.sizeBytes}), 0)` })
    .from(evidenceItems)
    .where(eq(evidenceItems.tenantId, tenantId));
  return Number(row?.total ?? 0);
}

// Recompute and upsert the tenant_usage snapshot. Call after mutations that
// change users/entities/storage. frameworkCount is left untouched (forward-
// looking until the framework abstraction adds framework_id).
export async function refreshTenantUsage(tenantId: string): Promise<void> {
  const [userCount, entityCount, storageBytes] = await Promise.all([
    countActiveUsers(tenantId),
    countActiveEntities(tenantId),
    sumStorageBytes(tenantId),
  ]);
  await db
    .insert(tenantUsage)
    .values({ tenantId, userCount, entityCount, storageBytes, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: tenantUsage.tenantId,
      set: { userCount, entityCount, storageBytes, updatedAt: new Date() },
    });
}
