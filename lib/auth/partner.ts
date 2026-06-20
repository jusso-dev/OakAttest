import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { partners, partnerMembers } from '@/db/schema/partners';
import { tenants } from '@/db/schema/tenants';
import type { PartnerRole } from '@/lib/rbac/matrix';

export class PartnerAccessError extends Error {
  constructor(message = 'Partner access denied') {
    super(message);
    this.name = 'PartnerAccessError';
  }
}

// The partner role a user holds over a given tenant (via the tenant's partner),
// or null. Used by `rolesForUser` to grant effective tenant management to MSP
// staff without a per-tenant membership row.
export async function partnerRoleForTenant(
  userId: string,
  tenantId: string,
): Promise<PartnerRole | null> {
  const [row] = await db
    .select({ role: partnerMembers.role })
    .from(tenants)
    .innerJoin(partnerMembers, eq(partnerMembers.partnerId, tenants.partnerId))
    .where(
      and(
        eq(tenants.id, tenantId),
        eq(partnerMembers.userId, userId),
        isNull(partnerMembers.deletedAt),
        isNull(tenants.deletedAt),
      ),
    )
    .limit(1);
  return (row?.role as PartnerRole | undefined) ?? null;
}

// Partners the user is an active member of.
export async function partnersForUser(
  userId: string,
): Promise<Array<{ partnerId: string; slug: string; name: string; role: PartnerRole }>> {
  const rows = await db
    .select({
      partnerId: partners.id,
      slug: partners.slug,
      name: partners.name,
      role: partnerMembers.role,
    })
    .from(partnerMembers)
    .innerJoin(partners, eq(partners.id, partnerMembers.partnerId))
    .where(
      and(
        eq(partnerMembers.userId, userId),
        isNull(partnerMembers.deletedAt),
        isNull(partners.deletedAt),
      ),
    );
  return rows.map((r) => ({ ...r, role: r.role as PartnerRole }));
}

// Active client tenants under a partner.
export async function tenantsForPartner(partnerId: string) {
  return db
    .select({ id: tenants.id, slug: tenants.slug, name: tenants.name })
    .from(tenants)
    .where(and(eq(tenants.partnerId, partnerId), isNull(tenants.deletedAt)));
}

// Throw unless the user holds one of `allowed` roles in the partner. Used for
// partner-scoped provisioning actions that have no single tenant context.
export async function requirePartnerRole(
  userId: string,
  partnerId: string,
  allowed: PartnerRole[],
): Promise<PartnerRole> {
  const [row] = await db
    .select({ role: partnerMembers.role })
    .from(partnerMembers)
    .where(
      and(
        eq(partnerMembers.partnerId, partnerId),
        eq(partnerMembers.userId, userId),
        isNull(partnerMembers.deletedAt),
      ),
    )
    .limit(1);
  const role = (row?.role as PartnerRole | undefined) ?? null;
  if (!role || !allowed.includes(role)) {
    throw new PartnerAccessError();
  }
  return role;
}
