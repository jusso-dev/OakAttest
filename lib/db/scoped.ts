import { and, eq, SQL } from 'drizzle-orm';
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
