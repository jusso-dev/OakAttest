'use server';

import { z } from 'zod';
import { and, eq, isNull } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db/client';
import { tenants, tenantMembers } from '@/db/schema/tenants';
import { auditLog } from '@/db/schema/audit';
import { requireSession } from '@/lib/auth/session';
import { writeActiveTenantCookie } from '@/lib/auth/active-tenant';
import { partnerRoleForTenant } from '@/lib/auth/partner';
import { isPlatformAdmin } from '@/lib/auth/platform';

// Whether a user may act inside a tenant: a direct tenant member, an MSP staff
// member of the tenant's partner ("drop into"), or the platform superadmin.
export async function canAccessTenant(userId: string, tenantId: string): Promise<boolean> {
  const [member] = await db
    .select({ id: tenantMembers.id })
    .from(tenantMembers)
    .where(
      and(
        eq(tenantMembers.tenantId, tenantId),
        eq(tenantMembers.userId, userId),
        isNull(tenantMembers.deletedAt),
      ),
    )
    .limit(1);
  if (member) return true;
  if (await partnerRoleForTenant(userId, tenantId)) return true;
  if (await isPlatformAdmin(userId)) return true;
  return false;
}

const schema = z.object({
  tenantId: z.string().uuid(),
  // Where to land after switching. Defaults to the dashboard.
  redirectTo: z.string().startsWith('/').optional(),
});

// "Drop into" a tenant: validate access, set the active-tenant cookie, and
// redirect. This is how an MSP admin manages a client tenant and how the
// platform superadmin enters any tenant. Audited under the target tenant.
export async function setActiveTenant(input: z.infer<typeof schema>) {
  const session = await requireSession();
  const data = schema.parse(input);

  const [tenant] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(and(eq(tenants.id, data.tenantId), isNull(tenants.deletedAt)))
    .limit(1);
  if (!tenant) throw new Error('Tenant not found');

  if (!(await canAccessTenant(session.user.id, data.tenantId))) {
    throw new Error('You do not have access to this tenant');
  }

  await writeActiveTenantCookie(data.tenantId);

  // Audit cross-tenant entry — important for MSP/superadmin accountability.
  await db.insert(auditLog).values({
    tenantId: data.tenantId,
    actorType: 'user',
    actorUserId: session.user.id,
    action: 'tenant.context_switch',
    resourceType: 'tenant',
    resourceId: data.tenantId,
  });

  redirect(data.redirectTo ?? '/dashboard');
}
