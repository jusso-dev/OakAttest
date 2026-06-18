import { and, eq, sql, SQL } from 'drizzle-orm';
import { db } from './client';
import * as schema from '@/db/schema';

// Tenant scoping helper. Every domain table that carries `tenant_id` must be
// queried through this so that the predicate is never forgotten. Pages and
// Server Actions never read tenant_id from the URL; it comes from the active
// session (§3, §15).

export type ScopedContext = {
  tenantId: string;
  engagementId?: string;
  userId: string;
};

export function tenantScope(tenantId: string, column: { name: string } & SQL) {
  return eq(column as never, tenantId);
}

// Convenience: build a `WHERE tenant_id = $1 AND <extra>` predicate.
export function withTenant<T extends SQL>(tenantId: string, tenantColumn: SQL, extra?: T) {
  return extra ? and(eq(tenantColumn as never, tenantId), extra) : eq(tenantColumn as never, tenantId);
}

// Wrapper around the Drizzle client used inside Server Actions. Callers must
// pass a `ScopedContext`; the wrapper exposes the underlying client so the
// caller can build queries, but the convention is to always include
// `eq(<table>.tenantId, ctx.tenantId)` in every predicate.
export function scopedDb(_ctx: ScopedContext) {
  return { db, schema };
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Tenant-scoped transaction for Postgres Row-Level Security. Sets the
// `app.current_tenant_id` GUC (SET LOCAL, via set_config) for the life of the
// transaction so the RLS policies in `db/migrations/post/rls_policies.sql`
// filter every tenant_id-bearing table to this tenant. Route tenant-scoped
// reads/writes through this to get DB-enforced isolation on top of the
// application predicates (defence-in-depth). Until a query is migrated onto
// this helper the policies are permissive for it (see the SQL header).
export async function runWithTenantScope<T>(
  tenantId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.current_tenant_id', ${tenantId}, true)`);
    return fn(tx);
  });
}
