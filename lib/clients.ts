import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { clients } from '@/db/schema/clients';

// Server-only query (NOT a server action) — callers must authorize first.
export async function listClientsForTenant(tenantId: string) {
  return db
    .select()
    .from(clients)
    .where(and(eq(clients.tenantId, tenantId), isNull(clients.deletedAt)))
    .orderBy(asc(clients.name));
}
